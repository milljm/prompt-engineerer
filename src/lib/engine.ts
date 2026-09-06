/**
 * Iterative prompt-engineering loop.
 *
 * Parent drafts or revises a system prompt, Child is tested on one or more
 * multi-turn scenarios, Parent scores the transcripts, and the cycle repeats
 * until the target score, the iteration budget, or Stop.
 */

import { childKillStamp, estimateTokens, wasKilled } from "./child-cap";
import { extractJsonObject } from "./json";
import { chat, stopLocal } from "./inference";
import { isBrowserDirectUrl } from "./openai-url";
import {
  fallbackScenarios,
  historyBrief,
  inCharacterFollowUp,
  parseFollowUp,
  parseParentReply,
  type ParentReply,
} from "./parent-protocol";
import {
  focusScenarios,
  killFocusBlock,
  mergeLedger,
  transcriptsKilled,
} from "./rule-ledger";
import { mergeScenarios } from "./scenarios";
import type {
  ChatMessage,
  IterationRecord,
  PromptVersion,
  RuleRecord,
  ScenarioResult,
  ScenarioSpec,
  Settings,
} from "./types";
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
  parentSystem: string;
  parentFollowupSystem: string;
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
    onDelta("");
    const messages: ChatMessage[] = [
      { role: "system", content: input.parentSystem },
      { role: "user", content: nudge ? `${user}\n\n${nudge}` : user },
    ];
    const result = await chat({
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model: settings.parentModel,
      messages,
      temperature: 0.35,
      maxTokens: 8192,
      signal,
      onDelta,
    });
    return parseParentReply(extractJsonObject(result.text), settings.turns);
  };

  try {
    return await run();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return run("Your previous reply was not valid JSON. Return ONLY the JSON object. Apostrophes must be bare: write don't, never don\\'t. Emit one FIRST user turn per scenario — later turns are written live.");
  }
}

async function parentFollowUp(
  input: EngineInput,
  prompt: {
    goal: string;
    scenario: string;
    turn: number;
    of: number;
    systemPrompt: string;
    transcript: string;
  },
): Promise<{ kind: "next"; user: string } | { kind: "stop" } | { kind: "fail" }> {
  const { settings, signal, onEvent } = input;
  onEvent({ type: "parent-delta", text: "" });
  const user = `GOAL:\n${prompt.goal}\n\nSCENARIO: ${prompt.scenario}\nYou are writing user turn ${prompt.turn} of ${prompt.of}. Stay on this rule.\n\nCHILD SYSTEM PROMPT:\n${prompt.systemPrompt}\n\nTRANSCRIPT SO FAR:\n${prompt.transcript}\n\nWrite the next user message to Child. JSON only.`;
  try {
    const result = await chat({
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model: settings.parentModel,
      messages: [
        { role: "system", content: input.parentFollowupSystem },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      maxTokens: 400,
      signal,
      onDelta: (text) => onEvent({ type: "parent-delta", text }),
    });
    const follow = parseFollowUp(extractJsonObject(result.text));
    if (!follow.continue || !follow.user) return { kind: "stop" };
    return { kind: "next", user: follow.user };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { kind: "fail" };
  }
}

async function runScenarios(
  input: EngineInput,
  prompt: string,
  scenarios: ScenarioSpec[],
  iteration: number,
): Promise<ScenarioResult[]> {
  const { settings, signal, onEvent } = input;
  const out: ScenarioResult[] = [];
  onEvent({ type: "live", event: { type: "clear" } });
  for (let s = 0; s < scenarios.length; s++) {
    throwIfAborted(signal);
    const spec = scenarios[s];
    const remaining = scenarios.length - s - 1;
    onEvent({
      type: "phase",
      phase:
        remaining > 0
          ? `Scenario ${s + 1} of ${scenarios.length}: ${spec.name} (${remaining} more, then judgement)`
          : `Scenario ${s + 1} of ${scenarios.length}: ${spec.name} — then Parent judges`,
      iteration,
    });
    onEvent({
      type: "live",
      event: { type: "scenario", name: spec.name, index: s + 1, of: scenarios.length },
    });
    const turns: ScenarioResult["turns"] = [];
    const history: ChatMessage[] = [{ role: "system", content: prompt }];
    const planned = spec.turns.slice(0, Math.max(1, settings.turns));
    const maxTurns = Math.max(1, settings.turns);
    for (let n = 0; n < maxTurns; n++) {
      throwIfAborted(signal);
      let userText = "";
      if (n === 0) {
        userText = planned[0]?.user || inCharacterFollowUp("", 0);
      } else {
        onEvent({
          type: "phase",
          phase: `Parent writing turn ${n + 1} of ${maxTurns} · ${spec.name}`,
          iteration,
        });
        const transcript = turns
          .map((t, i) => `User ${i + 1}: ${t.user}\nChild ${i + 1}:\n${t.assistant}`)
          .join("\n\n");
        const follow = await parentFollowUp(input, {
          goal: input.goal,
          scenario: spec.name,
          turn: n + 1,
          of: maxTurns,
          systemPrompt: prompt,
          transcript,
        });
        if (follow.kind === "next") userText = follow.user;
        else if (follow.kind === "fail") {
          userText = planned[n]?.user || inCharacterFollowUp(turns[0]?.user ?? "", n);
        } else break;
      }
      onEvent({
        type: "phase",
        phase:
          remaining > 0
            ? `Scenario ${s + 1} of ${scenarios.length}: ${spec.name} · turn ${n + 1} of ${maxTurns}`
            : `Scenario ${s + 1} of ${scenarios.length}: ${spec.name} · turn ${n + 1} of ${maxTurns} — then judgement`,
        iteration,
      });
      onEvent({
        type: "live",
        event: { type: "separator", scenario: spec.name, turn: n + 1, of: maxTurns },
      });
      onEvent({ type: "live", event: { type: "parent", text: userText } });
      onEvent({ type: "live", event: { type: "child-start" } });
      history.push({ role: "user", content: userText });
      const t0 = performance.now();
      const reply = await chat({
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        model: settings.childModel,
        messages: history,
        temperature: settings.childTemperature,
        maxTokens: settings.childMaxTokens,
        signal,
        onDelta: (text) => onEvent({ type: "live", event: { type: "child-delta", text } }),
      });
      let assistant = reply.text || "(empty reply)";
      const used = reply.usage?.completion ?? estimateTokens(assistant);
      if (reply.killed || used >= settings.childMaxTokens) {
        const stamp = childKillStamp(settings.childMaxTokens, used);
        assistant += stamp;
        onEvent({ type: "live", event: { type: "child-delta", text: stamp } });
        void stopLocal(settings.apiUrl, settings.childModel);
      }
      history.push({ role: "assistant", content: assistant });
      turns.push({ user: userText, assistant, ms: performance.now() - t0 });
      if (wasKilled(assistant)) break;
    }
    out.push({ name: spec.name, turns });
    if (turns.some((t) => wasKilled(t.assistant))) break;
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

function emptyJudge(prev: ScenarioSpec[], reason: string): ParentReply {
  return {
    action: "revise",
    revertTo: null,
    systemPrompt: "",
    scenarios: prev,
    score: null,
    pass: false,
    rationale: reason,
    ledger: [],
  };
}

export async function runEngine(input: EngineInput) {
  const { settings, signal, onEvent, goal } = input;
  let versions = [...input.versions];
  let currentRev = input.currentRev;
  let nextRev = (versions.at(-1)?.rev ?? 0) + 1;
  let pendingScenarios: ScenarioSpec[] | null = null;
  let lastPlanned: ScenarioSpec[] = [];
  let ledger: RuleRecord[] = [];

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
          `GOAL:\n${goal}\n\nNo system prompt yet. Draft one. Then one scenario per critical rule; each rule gets ${settings.turns} turns. Only the FIRST user turn per scenario is required.`,
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
        pendingScenarios = focusScenarios(mergeScenarios(reply.scenarios, lastPlanned), ledger, false);
      } else if (!pendingScenarios?.length) {
        const cur = currentOf();
        reply = await parentCall(
          input,
          `GOAL:\n${goal}\n\nCURRENT SYSTEM PROMPT (rev ${cur?.rev}):\n${cur?.prompt ?? ""}\n\nREVISION LOG (full prompts + scores, oldest → newest):\n${historyBrief(versions)}\n\n${killFocusBlock(false, ledger)}\n\nDesign scenarios only for FAIL or new rules. Each of those gets ${settings.turns} turns. action should be "draft". Keep system_prompt unless it is clearly broken or scores have stalled. Only the FIRST user turn per scenario is required.`,
          (text) => onEvent({ type: "parent-delta", text }),
        );
        pendingScenarios = focusScenarios(mergeScenarios(reply.scenarios, lastPlanned), ledger, false);
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
      lastPlanned = scenarios;

      const tChild = performance.now();
      const results = await runScenarios(input, promptText, scenarios, i);
      childMs += performance.now() - tChild;

      throwIfAborted(signal);
      onEvent({ type: "phase", phase: "Parent judging…", iteration: i });
      onEvent({ type: "parent-delta", text: "" });
      const iterId = `iter-${i}`;
      const iterStartedAt = Date.now();
      onEvent({
        type: "iteration",
        record: {
          id: iterId,
          iteration: i,
          rev: currentRev ?? 0,
          startedAt: iterStartedAt,
          ms: performance.now() - iterStarted,
          score: null,
          rationale: "Parent judging…",
          action: "judging",
          scenarios: results,
          ledger,
          phaseMs: { parent: parentMs, child: childMs },
        },
      });
      const tJudge = performance.now();
      const killed = transcriptsKilled(results);
      let judged: ParentReply;
      try {
        judged = await parentCall(
          input,
          `GOAL:\n${goal}\n\nCURRENT SYSTEM PROMPT (rev ${currentRev}):\n${promptText}\n\nREVISION LOG (full prompts + scores, oldest → newest). Use it to see whether you are improving or degrading:\n${historyBrief(versions)}\n\nCHILD TRANSCRIPTS:\n${transcriptBlock(results)}\n\n${killFocusBlock(killed, ledger)}\n\nScore 1–10. If score >= ${settings.targetScore} AND there was no [ENGINE KILL], action="pass". If this score is below the best in the log, prefer action="revert" to that rev or a real rewrite — not a tiny edit of a loser. Otherwise revise the FULL system prompt. Fill rule_ledger. Only schedule scenarios for FAIL or new rules. Only the FIRST user turn per scenario is required.`,
          (text) => onEvent({ type: "parent-delta", text }),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        judged = emptyJudge(
          lastPlanned,
          err instanceof Error ? err.message : "Parent JSON failed; keeping prior scenarios",
        );
      }
      parentMs += performance.now() - tJudge;

      ledger = mergeLedger(ledger, judged.ledger);
      if (killed) {
        ledger = mergeLedger(ledger, [
          { name: "Runaway length", verdict: "fail", note: "ENGINE KILL — Child was cut off at the completion cap." },
        ]);
        judged = {
          ...judged,
          pass: false,
          score: judged.score == null ? 3 : Math.min(judged.score, 4),
        };
      }

      const score = judged.score ?? 0;
      const passed = !killed && (judged.pass || (judged.score != null && score >= settings.targetScore));

      if (currentRev != null) {
        onEvent({
          type: "version-update",
          rev: currentRev,
          patch: {
            score: judged.score,
            status: passed ? "champion" : "tested",
            rationale: judged.rationale || reply?.rationale || "",
          },
        });
        versions = versions.map((v) =>
          v.rev === currentRev
            ? {
                ...v,
                score: judged.score,
                status: passed ? "champion" : "tested",
                rationale: judged.rationale || v.rationale,
              }
            : passed && v.status === "champion" && v.rev !== currentRev
              ? { ...v, status: "tested" }
              : v,
        );
      }

      const record: IterationRecord = {
        id: iterId,
        iteration: i,
        rev: currentRev ?? 0,
        startedAt: iterStartedAt,
        ms: performance.now() - iterStarted,
        score: judged.score,
        rationale: judged.rationale,
        action: passed ? "pass" : judged.action,
        scenarios: results,
        ledger,
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
          pendingScenarios = focusScenarios(mergeScenarios(judged.scenarios, lastPlanned), ledger, killed);
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
      pendingScenarios = focusScenarios(mergeScenarios(judged.scenarios, lastPlanned), ledger, killed);
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
