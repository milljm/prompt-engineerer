import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fallbackScenarios,
  historyBrief,
  parseParentReply,
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
  });

  it("rejects a non-object", () => {
    assert.throws(() => parseParentReply(null, 1), /not an object/);
    assert.throws(() => parseParentReply("draft", 1), /not an object/);
  });
});

describe("historyBrief", () => {
  it("summarizes recent revisions", () => {
    const versions: PromptVersion[] = [
      {
        rev: 1,
        prompt: "Be helpful.\nAlways.",
        rationale: "",
        score: 6,
        status: "tested",
        createdAt: 1,
        parentRev: null,
      },
    ];
    assert.match(historyBrief(versions), /rev 1 \[tested, 6\/10\]: Be helpful\. Always\./);
    assert.equal(historyBrief([]), "(none yet)");
  });
});

describe("fallbackScenarios", () => {
  it("builds the requested number of turns", () => {
    const specs = fallbackScenarios("a haiku bot", 3);
    assert.equal(specs.length, 2);
    assert.equal(specs[0]?.turns.length, 3);
    assert.equal(specs[1]?.turns.length, 3);
    assert.match(specs[0]?.turns[0]?.user ?? "", /haiku/);
  });
});
