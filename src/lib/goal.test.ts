import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GOAL_DEFAULT, GOAL_MAX, GOAL_MIN, clampGoalHeight, fitGoalHeight } from "./goal.ts";

describe("clampGoalHeight", () => {
  it("returns the default for junk", () => {
    assert.equal(clampGoalHeight(undefined), GOAL_DEFAULT);
    assert.equal(clampGoalHeight("nope"), GOAL_DEFAULT);
    assert.equal(clampGoalHeight(Number.NaN), GOAL_DEFAULT);
  });

  it("clamps to the allowed range", () => {
    assert.equal(clampGoalHeight(GOAL_MIN - 40), GOAL_MIN);
    assert.equal(clampGoalHeight(GOAL_MAX + 80), GOAL_MAX);
    assert.equal(clampGoalHeight(180.4), 180);
  });
});

describe("fitGoalHeight", () => {
  it("grows to the content and stops at the max", () => {
    assert.equal(fitGoalHeight(80), GOAL_MIN);
    assert.equal(fitGoalHeight(200), 200);
    assert.equal(fitGoalHeight(GOAL_MAX + 50), GOAL_MAX);
  });
});
