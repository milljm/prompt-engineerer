/**
 * Iterative prompt-engineering loop.
 *
 * Parent drafts or revises a system prompt, Child is tested on one or more
 * multi-turn scenarios, Parent scores the transcripts, and the cycle repeats
 * until the target score, the iteration budget, or Stop.
 */

import { extractJsonObject } from "./json";
import { chat, stopLocal } from "./inference";
import { isBrowserDirectUrl } from "./openai-url";
import {
  PARENT_SYSTEM,
  fallbackScenarios,
  historyBrief,
  parseParentReply,
  type ParentReply,
} from "./parent-protocol";
import type {
  ChatMessage,
  IterationRecord,
  PromptVersion,
  ScenarioResult,
  ScenarioSpec,
  Settings,
} from "./types";
import { uid } from "./utils";
import type { LiveEvent } from "./live-transcript.ts";

export type EngineEvent =
  | { type: "phase"; phase: string; iteration: number }
  | { type: "parent-delta"; text: string }
  | { type: "live"; event: LiveEvent }
  | { type: "version"; version: PromptVersion }
  | { type: "version-update"; rev: number; patch: Partial<PromptVersion> }
  | { type: "iteration"; record: IterationRecord }
  | { type: "done"; reason: "pass" | "max" | "stop" | "error"; message?: string };

export type EngineInput = {
  goal: string;
  seedPrompt: string;
  versions: PromptVersion[];
  currentRev: number | null;
  settings: Settings;
  signal: AbortSignal;
  onEvent: (event: EngineEvent) => void;
};

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");
}

async function parentCall(
  input: EngineInput,
  user: string,
  onDelta: (t: string) => void,
): Promise<ParentReply> {
  const { settings, signal } = input;
  const run = async (nudge?: string) => {
    const messages: ChatMessage[] = [
      { role: "system", content: PARENT_SYSTEM },
      { role: "user", content: nudge ? `${user}\n\n${nudge}` : user },
    ];
    const result = await chat({
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model: settings.parentModel,
      messages,
      temperature: 0.35,
      maxTokens: 2200,
      signal,
      onDelta,
    });
    return parseParentReply(extractJsonObject(result.text), settings.turns);
  };

  try {
    return await run();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return run("Your previous reply was not valid JSON. Return ONLY the JSON object.");
  }
}

async function runScenarios(
  input: EngineInput,
  prompt: string,
  scenarios: ScenarioSpec[],
): Promise<ScenarioResult[]> {
  const { settings, signal, onEvent } = input;
  const out: ScenarioResult[] = [];
  onEvent({ type: "live", event: { type: "clear" } });
  for (const spec of scenarios) {
    throwIfAborted(signal);
    const turns: ScenarioResult["turns"] = [];
    const history: ChatMessage[] = [{ role: "system", content: prompt }];
    const planned = spec.turns.slice(0, Math.max(1, settings.turns));
    for (let n = 0; n < planned.length; n++) {
      throwIfAborted(signal);
      const turn = planned[n];
      onEvent({
        type: "live",
        event: { type: "separator", scenario: spec.name, turn: n + 1, of: planned.length },
      });
      onEvent({ type: "live", event: { type: "parent", text: turn.user } });
      onEvent({ type: "live", event: { type: "child-start" } });
      history.push({ role: "user", content: turn.user });
      const t0 = performance.now();
      const reply = await chat({
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        model: settings.childModel,
        messages: history,
        temperature: settings.childTemperature,
        maxTokens: 900,
        signal,
        onDelta: (text) => onEvent({ type: "live", event: { type: "child-delta", text } }),
      });
      const assistant = reply.text || "(empty reply)";
      history.push({ role: "assistant", content: assistant });
      turns.push({ user: turn.user, assistant, ms: performance.now() - t0 });
    }
    out.push({ name: spec.name, turns });
  }
  return out;
}

function transcriptBlock(results: ScenarioResult[]): string {
  return results
    .map((s, i) => {
      const body = s.turns
        .map(
          (t, n) =>
            `User ${n + 1}: ${t.user}\nChild ${n + 1} (${Math.round(t.ms)}ms):\n${t.assistant}`,
        )
        .join("\n\n");
      return `### Scenario ${i + 1}: ${s.name}\n${body}`;
    })
    .join("\n\n");
}

/**
 * Run the Parent → Child → judge loop until pass, max iterations, stop, or error.
 *
 * Events are pushed through `onEvent` so the UI can stream deltas, versions,
 * and scores. Aborting `signal` is the Stop button.
 *
 * @param input - Goal, current versions, settings, abort signal, event sink.
 */
export async function runEngine(input: EngineInput) {
  const { settings, signal, onEvent, goal } = input;
  let versions = [...input.versions];
  let currentRev = input.currentRev;
  let nextRev = (versions.at(-1)?.rev ?? 0) + 1;
  let pendingScenarios: ScenarioSpec[] | null = null;

  const emitVersion = (version: PromptVersion) => {
    versions = [...versions, version];
    currentRev = version.rev;
    nextRev = version.rev + 1;
    onEvent({ type: "version", version });
  };

  const currentOf = () => versions.find((v) => v.rev === currentRev);

  try {
    for (let i = 1; i <= settings.maxIterations; i++) {
      throwIfAborted(signal);
      const iterStarted = performance.now();
      let parentMs = 0;
      let childMs = 0;
      onEvent({ type: "phase", phase: "Parent is thinking…", iteration: i });
      onEvent({ type: "parent-delta", text: "" });

      if (i === 1 && !currentOf() && input.seedPrompt.trim()) {
        emitVersion({
          rev: nextRev,
          prompt: input.seedPrompt.trim(),
          rationale: "Seeded by you",
          score: null,
          status: "draft",
          createdAt: Date.now(),
          parentRev: null,
        });
      }

      let reply: ParentReply | null = null;
      const tParent = performance.now();
      if (!currentOf()?.prompt) {
        reply = await parentCall(
          input,
          `GOAL:\n${goal}\n\nNo system prompt yet. Draft one and ${settings.turns}-turn test scenarios.`,
          (text) => onEvent({ type: "parent-delta", text }),
        );
        if (!reply.systemPrompt.trim()) {
          throw new Error("Parent did not produce a system prompt");
        }
        emitVersion({
          rev: nextRev,
          prompt: reply.systemPrompt.trim(),
          rationale: reply.rationale || "Initial draft",
          score: null,
          status: "draft",
          createdAt: Date.now(),
          parentRev: null,
        });
        pendingScenarios = reply.scenarios;
      } else if (!pendingScenarios?.length) {
        const cur = currentOf();
        reply = await parentCall(
          input,
          `GOAL:\n${goal}\n\nCURRENT SYSTEM PROMPT (rev ${cur?.rev}):\n${cur?.prompt ?? ""}\n\nHISTORY:\n${historyBrief(versions)}\n\nDesign ${settings.turns}-turn test scenarios for this prompt. action should be "draft". Keep system_prompt unless it is clearly broken.`,
          (text) => onEvent({ type: "parent-delta", text }),
        );
        pendingScenarios = reply.scenarios;
        if (reply.systemPrompt.trim() && reply.systemPrompt.trim() !== cur?.prompt) {
          emitVersion({
            rev: nextRev,
            prompt: reply.systemPrompt.trim(),
            rationale: reply.rationale || "Parent adjusted the prompt before testing",
            score: null,
            status: "draft",
            createdAt: Date.now(),
            parentRev: cur?.rev ?? null,
          });
        }
      }
      parentMs += performance.now() - tParent;

      const active = currentOf();
      const promptText = active?.prompt ?? "";
      if (!promptText) throw new Error("No system prompt to test");

      const scenarios =
        pendingScenarios && pendingScenarios.length
          ? pendingScenarios
          : fallbackScenarios(goal, settings.turns);
      pendingScenarios = null;

      onEvent({
        type: "phase",
        phase: `Child running ${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"}…`,
        iteration: i,
      });
      const tChild = performance.now();
      const results = await runScenarios(input, promptText, scenarios);
      childMs += performance.now() - tChild;

      throwIfAborted(signal);
      onEvent({ type: "phase", phase: "Parent judging…", iteration: i });
      onEvent({ type: "parent-delta", text: "" });
      const tJudge = performance.now();
      const judged = await parentCall(
        input,
        `GOAL:\n${goal}\n\nCURRENT SYSTEM PROMPT (rev ${currentRev}):\n${promptText}\n\nHISTORY:\n${historyBrief(versions)}\n\nCHILD TRANSCRIPTS:\n${transcriptBlock(results)}\n\nScore 1–10. If score >= ${settings.targetScore}, action="pass". Otherwise revise the FULL system prompt or revert to a better rev. Include the next test scenarios.`,
        (text) => onEvent({ type: "parent-delta", text }),
      );
      parentMs += performance.now() - tJudge;

      const score = judged.score ?? 0;
      const passed = judged.pass || score >= settings.targetScore;

      if (currentRev != null) {
        onEvent({
          type: "version-update",
          rev: currentRev,
          patch: {
            score,
            status: passed ? "champion" : "tested",
            rationale: judged.rationale || reply?.rationale || "",
          },
        });
        versions = versions.map((v) =>
          v.rev === currentRev
            ? {
                ...v,
                score,
                status: passed ? "champion" : "tested",
                rationale: judged.rationale || v.rationale,
              }
            : passed && v.status === "champion" && v.rev !== currentRev
              ? { ...v, status: "tested" }
              : v,
        );
      }

      const record: IterationRecord = {
        id: uid("iter"),
        iteration: i,
        rev: currentRev ?? 0,
        startedAt: Date.now(),
        ms: performance.now() - iterStarted,
        score,
        rationale: judged.rationale,
        action: passed ? "pass" : judged.action,
        scenarios: results,
        phaseMs: { parent: parentMs, child: childMs },
      };
      onEvent({ type: "iteration", record });

      if (passed) {
        onEvent({
          type: "done",
          reason: "pass",
          message: `Hit ${score}/10 (target ${settings.targetScore}).`,
        });
        return;
      }

      if (i >= settings.maxIterations) {
        onEvent({
          type: "done",
          reason: "max",
          message: `Stopped after ${settings.maxIterations} iterations. Review the timeline.`,
        });
        return;
      }

      if (judged.action === "revert" && judged.revertTo != null) {
        const src = versions.find((v) => v.rev === judged.revertTo);
        if (src) {
          emitVersion({
            rev: nextRev,
            prompt: src.prompt,
            rationale: judged.rationale || `Reverted to rev ${src.rev}`,
            score: null,
            status: "draft",
            createdAt: Date.now(),
            parentRev: src.rev,
          });
          pendingScenarios = judged.scenarios;
          continue;
        }
      }

      const nextPrompt = judged.systemPrompt.trim();
      if (nextPrompt && nextPrompt !== promptText) {
        emitVersion({
          rev: nextRev,
          prompt: nextPrompt,
          rationale: judged.rationale || "Revised after missing the target score",
          score: null,
          status: "draft",
          createdAt: Date.now(),
          parentRev: currentRev,
        });
      }
      pendingScenarios = judged.scenarios;
    }

    onEvent({ type: "done", reason: "max", message: "Iteration budget exhausted." });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (isBrowserDirectUrl(settings.apiUrl)) {
        await stopLocal(settings.apiUrl, settings.childModel);
        await stopLocal(settings.apiUrl, settings.parentModel);
      }
      onEvent({ type: "done", reason: "stop", message: "Stopped." });
      return;
    }
    onEvent({
      type: "done",
      reason: "error",
      message: err instanceof Error ? err.message : "Engine failed",
    });
  }
}
