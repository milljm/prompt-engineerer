import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyLiveEvent, turnLabel, type LiveLine } from "./live-transcript.ts";

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("turnLabel", () => {
  it("omits the of-N when there is a single turn", () => {
    assert.equal(turnLabel("Socratic", 1, 1), "Turn 1 · Socratic");
  });

  it("includes of-N for multi-turn scenarios", () => {
    assert.equal(turnLabel("Drift", 2, 3), "Turn 2 of 3 · Drift");
  });
});

describe("applyLiveEvent", () => {
  it("builds a two-turn Parent/Child transcript", () => {
    const id = ids();
    let lines: LiveLine[] = [];
    lines = applyLiveEvent(lines, { type: "clear" }, id);
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
        "separator:Turn 1 of 2 · Tutor",
        "parent:What test first?",
        "child:A failing unit test.",
        "separator:Turn 2 of 2 · Tutor",
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
