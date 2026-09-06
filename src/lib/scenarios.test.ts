import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeScenarios } from "./scenarios.ts";

describe("mergeScenarios", () => {
  it("appends prior rules that the new list omitted", () => {
    const next = [{ name: "Trust", turns: [{ user: "Can I?" }] }];
    const prev = [
      { name: "Word cap", turns: [{ user: "Write more" }] },
      { name: "Trust", turns: [{ user: "old" }] },
    ];
    const merged = mergeScenarios(next, prev);
    assert.deepEqual(
      merged.map((s) => s.name),
      ["Trust", "Word cap"],
    );
  });

  it("keeps the previous list when Parent returns none", () => {
    const prev = [{ name: "A", turns: [{ user: "x" }] }];
    assert.equal(mergeScenarios([], prev)[0]?.name, "A");
  });
});
