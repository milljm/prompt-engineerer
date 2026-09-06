import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fallbackScenarios,
  historyBrief,
  isMetaUserTurn,
  isOverlayScenarioName,
  parseFollowUp,
  parseParentReply,
  sanitizeTurns,
  scoreTrend,
} from "./parent-protocol.ts";
import type { PromptVersion } from "./types.ts";

describe("parseParentReply", () => {
  it("maps a complete Parent object", () => {
    const reply = parseParentReply(
      {
        action: "revise",
        revert_to: 2,
        system_prompt: " You are terse. ",
        scenarios: [{ name: "Probe", turns: [{ user: "Hi" }] }],
        score: 7.4,
        pass: false,
        rationale: "Drifted on turn 2.",
      },
      2,
    );
    assert.equal(reply.action, "revise");
    assert.equal(reply.revertTo, 2);
    assert.equal(reply.systemPrompt, "You are terse.");
    assert.equal(reply.score, 7);
    assert.equal(reply.pass, false);
    assert.equal(reply.scenarios[0]?.turns.length, 2);
  });

  it("drops overlay-only scenes once a behavior scene exists", () => {
    const reply = parseParentReply(
      {
        action: "draft",
        system_prompt: "Agency plus 400 words.",
        scenarios: [
          { name: "Player agency", turns: [{ user: "I walk in." }] },
          { name: "Word cap", turns: [{ user: "Write a lot." }] },
        ],
      },
      1,
    );
    assert.deepEqual(
      reply.scenarios.map((s) => s.name),
      ["Player agency"],
    );
  });

  it("accepts camelCase aliases and treats action=pass as pass", () => {
    const reply = parseParentReply(
      {
        action: "pass",
        revertTo: null,
        systemPrompt: "Stay in character.",
        scenarios: [],
        score: 10,
        rationale: "Holds.",
      },
      1,
    );
    assert.equal(reply.pass, true);
    assert.equal(reply.systemPrompt, "Stay in character.");
    assert.equal(reply.revertTo, null);
  });

  it("clamps scores, defaults unknown actions, and pads string turns", () => {
    const reply = parseParentReply(
      {
        action: "nope",
        score: 99,
        scenarios: [{ turns: ["Hello"] }],
      },
      3,
    );
    assert.equal(reply.action, "revise");
    assert.equal(reply.score, 10);
    assert.equal(reply.scenarios[0]?.name, "Scenario 1");
    assert.equal(reply.scenarios[0]?.turns.length, 3);
    for (const turn of reply.scenarios[0]?.turns ?? []) {
      assert.equal(isMetaUserTurn(turn.user), false);
    }
  });

  it("rejects a non-object", () => {
    assert.throws(() => parseParentReply(null, 1), /not an object/);
    assert.throws(() => parseParentReply("draft", 1), /not an object/);
  });
});

describe("isOverlayScenarioName", () => {
  it("flags word-cap scenes and leaves agency alone", () => {
    assert.equal(isOverlayScenarioName("Word cap"), true);
    assert.equal(isOverlayScenarioName("Word count"), true);
    assert.equal(isOverlayScenarioName("Player agency"), false);
  });
});

describe("historyBrief", () => {
  it("includes every full prompt, its score, and the trend", () => {
    const versions: PromptVersion[] = [
      {
        rev: 1,
        prompt: "Be helpful.\nAlways.",
        rationale: "first",
        score: 6,
        status: "tested",
        createdAt: 1,
        parentRev: null,
      },
      {
        rev: 2,
        prompt: "Be terse.",
        rationale: "worse",
        score: 4,
        status: "tested",
        createdAt: 2,
        parentRev: 1,
      },
    ];
    const brief = historyBrief(versions);
    assert.match(brief, /Score path: 6 → 4 \(degrading/);
    assert.match(brief, /Best so far: rev 1 at 6\/10/);
    assert.match(brief, /system prompt v1 \[tested\]:\nBe helpful\.\nAlways\.\nscore: 6\/10/);
    assert.match(brief, /system prompt v2 \[tested\]:\nBe terse\.\nscore: 4\/10/);
    assert.equal(historyBrief([]), "(none yet)");
  });
});

describe("scoreTrend", () => {
  it("calls out an improving path", () => {
    const versions: PromptVersion[] = [
      { rev: 1, prompt: "a", rationale: "", score: 5, status: "tested", createdAt: 1, parentRev: null },
      { rev: 2, prompt: "b", rationale: "", score: 8, status: "champion", createdAt: 2, parentRev: 1 },
    ];
    assert.match(scoreTrend(versions), /5 → 8 \(improving\)/);
  });
});

describe("fallbackScenarios", () => {
  it("builds the requested number of turns", () => {
    const specs = fallbackScenarios("a haiku bot", 3);
    assert.equal(specs.length, 2);
    assert.equal(specs[0]?.turns.length, 3);
    assert.equal(specs[1]?.turns.length, 3);
    assert.match(specs[0]?.turns[0]?.user ?? "", /haiku/);
    for (const spec of specs) {
      for (const turn of spec.turns) {
        assert.equal(isMetaUserTurn(turn.user), false);
      }
    }
  });
});

describe("sanitizeTurns", () => {
  it("replaces the old probe pad with an in-character follow-up", () => {
    const out = sanitizeTurns(
      [
        { user: "Help me write a test." },
        { user: "Follow up: probe whether the assistant still follows the system prompt." },
      ],
      2,
    );
    assert.equal(out.length, 2);
    assert.equal(out[0]?.user, "Help me write a test.");
    assert.notEqual(out[1]?.user, "Follow up: probe whether the assistant still follows the system prompt.");
    assert.equal(isMetaUserTurn(out[1]?.user ?? ""), false);
  });
});

describe("parseFollowUp", () => {
  it("keeps an in-character next turn", () => {
    const follow = parseFollowUp({ continue: true, user: "Do it shorter." });
    assert.equal(follow.continue, true);
    assert.equal(follow.user, "Do it shorter.");
  });

  it("drops a meta follow-up and treats continue=false as stop", () => {
    assert.equal(parseFollowUp({ continue: false, user: "ok" }).continue, false);
    const meta = parseFollowUp({
      continue: true,
      user: "Follow up: probe whether the assistant still follows the system prompt.",
    });
    assert.equal(isMetaUserTurn(meta.user), false);
    assert.equal(meta.continue, true);
  });
});
