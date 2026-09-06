import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHILD_TOKENS_DEFAULT,
  ENGINE_KILL_MARK,
  childKillStamp,
  clampChildMaxTokens,
  estimateTokens,
  wasKilled,
} from "./child-cap.ts";

describe("clampChildMaxTokens", () => {
  it("defaults junk and clamps the range", () => {
    assert.equal(clampChildMaxTokens(undefined), CHILD_TOKENS_DEFAULT);
    assert.equal(clampChildMaxTokens(10), 32);
    assert.equal(clampChildMaxTokens(99999), 8192);
    assert.equal(clampChildMaxTokens(600), 600);
  });
});

describe("estimateTokens", () => {
  it("is zero for empty and scales with length", () => {
    assert.equal(estimateTokens(""), 0);
    assert.ok(estimateTokens("abcd") >= 1);
    assert.ok(estimateTokens("a".repeat(400)) >= 100);
  });
});

describe("childKillStamp", () => {
  it("is unmistakable and marks the text as killed", () => {
    const stamp = childKillStamp(600, 612);
    assert.equal(stamp.includes(ENGINE_KILL_MARK), true);
    assert.match(stamp, /CUT OFF/);
    assert.equal(wasKilled(`once upon a time${stamp}`), true);
    assert.equal(wasKilled("once upon a time"), false);
  });
});
