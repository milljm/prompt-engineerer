import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyLiveEvent, scenarioLabel, turnLabel, type LiveLine } from "./live-transcript.ts";

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("turnLabel", () => {
  it("omits the of-N when there is a single turn", () => {
    assert.equal(turnLabel("Socratic", 1, 1), "Turn 1");
  });

  it("includes of-N for multi-turn scenarios", () => {
    assert.equal(turnLabel("Drift", 2, 3), "Turn 2 of 3");
  });
});

describe("scenarioLabel", () => {
  it("says when judgement is coming", () => {
    assert.match(scenarioLabel("Pressure", 1, 2), /Scenario 1 of 2 · Pressure · 1 more before judgement/);
    assert.match(scenarioLabel("Pressure", 2, 2), /last one, then judgement/);
  });

  it("strips a redundant Scenario N prefix from the name", () => {
    assert.match(scenarioLabel("Scenario 3: A Test of Trust", 3, 3), /^Scenario 3 of 3 · A Test of Trust/);
  });
});

describe("applyLiveEvent", () => {
  it("builds a two-turn Parent/Child transcript", () => {
    const id = ids();
    let lines: LiveLine[] = [];
    lines = applyLiveEvent(lines, { type: "clear" }, id);
    lines = applyLiveEvent(lines, { type: "scenario", name: "Tutor", index: 1, of: 2 }, id);
    lines = applyLiveEvent(lines, { type: "separator", scenario: "Tutor", turn: 1, of: 2 }, id);
    lines = applyLiveEvent(lines, { type: "parent", text: "What test first?" }, id);
    lines = applyLiveEvent(lines, { type: "child-start" }, id);
    lines = applyLiveEvent(lines, { type: "child-delta", text: "A failing " }, id);
    lines = applyLiveEvent(lines, { type: "child-delta", text: "unit test." }, id);
    lines = applyLiveEvent(lines, { type: "separator", scenario: "Tutor", turn: 2, of: 2 }, id);
    lines = applyLiveEvent(lines, { type: "parent", text: "Still no solution." }, id);
    lines = applyLiveEvent(lines, { type: "child-start" }, id);
    lines = applyLiveEvent(lines, { type: "child-delta", text: "What have you tried?" }, id);

    assert.deepEqual(
      lines.map((l) => `${l.role}:${l.text}`),
      [
        "scenario:Scenario 1 of 2 · Tutor · 1 more before judgement",
        "separator:Turn 1 of 2",
        "parent:What test first?",
        "child:A failing unit test.",
        "separator:Turn 2 of 2",
        "parent:Still no solution.",
        "child:What have you tried?",
      ],
    );
  });

  it("clears the transcript", () => {
    const id = ids();
    let lines = applyLiveEvent([], { type: "parent", text: "Hi" }, id);
    lines = applyLiveEvent(lines, { type: "clear" }, id);
    assert.deepEqual(lines, []);
  });
});
