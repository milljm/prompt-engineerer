import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fallbackScenarios,
  historyBrief,
  isMetaUserTurn,
  isOverlayScenarioName,
  inCharacterFollowUp,
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
    assert.deepEqual(reply.ledger, []);
  });

  it("lifts a prose rule ledger out of the rationale", () => {
    const reply = parseParentReply(
      {
        action: "revise",
        system_prompt: "Cap every turn.",
        scenarios: [{ name: "THREE-CHANNEL RECOGNITION", turns: [{ user: "Hi" }] }],
        rationale: "Three-channel recognition: pass\nRunaway length: fail",
      },
      1,
    );
    assert.equal(reply.ledger.find((r) => r.name === "Three-channel recognition")?.verdict, "pass");
    assert.equal(reply.ledger.find((r) => r.name === "Runaway length")?.verdict, "fail");
  });

  it("keeps a Runaway length scene and parses the rule ledger", () => {
    const reply = parseParentReply(
      {
        action: "revise",
        system_prompt: "Stop after 400 words.",
        scenarios: [
          { name: "Player agency", turns: [{ user: "I walk in." }] },
          { name: "Runaway length", turns: [{ user: "Keep going." }] },
        ],
        rule_ledger: [
          { name: "Player agency", verdict: "pass", note: "held" },
          { name: "Runaway length", verdict: "fail", note: "kill" },
        ],
      },
      1,
    );
    assert.deepEqual(
      reply.scenarios.map((s) => s.name),
      ["Player agency", "Runaway length"],
    );
    assert.equal(reply.ledger[1]?.verdict, "fail");
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

  it("accepts a numeric score sent as a string", () => {
    const reply = parseParentReply(
      {
        action: "revise",
        system_prompt: "Be terse.",
        scenarios: [{ name: "Probe", turns: [{ user: "Hi" }] }],
        score: "7",
        rationale: "Held the cap.",
      },
      1,
    );
    assert.equal(reply.score, 7);
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
  it("sends unified diffs and scores, not every full prompt", () => {
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
    assert.match(brief, /v1 \[tested\] score 6\/10 \(initial/);
    assert.match(brief, /v1 → v2 \[tested\] score 4\/10/);
    assert.match(brief, /--- v1/);
    assert.match(brief, /\+Be terse\./);
    assert.doesNotMatch(brief, /system prompt v1 \[tested\]:\nBe helpful/);
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

  it("opens a scene instead of 'I'm not following' when there is no seed", () => {
    const open = inCharacterFollowUp("", 0);
    assert.match(open, /look around|Anyone notice|catch her eye|We need to talk/i);
    assert.equal(/not following|stay in role|harder case/i.test(open), false);
  });

  it("never coaches Child about role or difficulty", () => {
    const pads = [
      inCharacterFollowUp("", 0),
      inCharacterFollowUp("I walk in.", 0),
      inCharacterFollowUp("I walk in.", 2),
    ];
    for (const line of pads) {
      assert.equal(isMetaUserTurn(line), false, line);
      assert.equal(/stay in role|harder case|don't dump|system prompt/i.test(line), false, line);
    }
    assert.equal(
      isMetaUserTurn("Do it again for a slightly harder case. Stay in role."),
      true,
    );
    const cleaned = sanitizeTurns(
      [{ user: "I push the tavern door." }, { user: "Do it again for a slightly harder case. Stay in role." }],
      2,
    );
    assert.equal(cleaned[0]?.user, "I push the tavern door.");
    assert.equal(isMetaUserTurn(cleaned[1]?.user ?? ""), false);
    assert.match(cleaned[1]?.user ?? "", /glance around|step closer|arms folded|And then/);
  });
});

describe("parseFollowUp", () => {
  it("keeps an in-character next turn", () => {
    const follow = parseFollowUp({ continue: true, user: "I glance at her. \"Go on.\"" });
    assert.equal(follow.continue, true);
    assert.equal(follow.user, "I glance at her. \"Go on.\"");
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
