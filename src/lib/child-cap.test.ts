import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHILD_TOKENS_DEFAULT,
  ENGINE_KILL_MARK,
  childKillStamp,
  clampChildMaxTokens,
  completionUsed,
  estimateTokens,
  overTokenCap,
  stripKillStamp,
  wasKilled,
  wireMaxTokens,
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

describe("stripKillStamp", () => {
  it("keeps the truncated prose and drops the engine notice", () => {
    const body = "The dragon reared back, fire pooling—";
    const stamped = `${body}${childKillStamp(600, 600)}`;
    assert.equal(stripKillStamp(stamped), body);
    assert.equal(stripKillStamp(body), body);
  });
});

describe("completionUsed", () => {
  it("counts visible text only, never reasoning/session usage", () => {
    const short = "I stay where I am. What happens next?";
    const fromText = estimateTokens(short);
    assert.equal(completionUsed(short, { completion: 200 }), fromText);
    assert.equal(overTokenCap(short, { completion: 200 }, 200), false);
    assert.equal(overTokenCap(short, { completion: 49 }, 200), false);
    assert.equal(overTokenCap("a".repeat(900), undefined, 200), true);
  });
});

describe("wireMaxTokens", () => {
  it("adds reasoning headroom above the visible cap", () => {
    assert.ok(wireMaxTokens(200) > 200);
    assert.ok(wireMaxTokens(200) >= 200 + 1536);
    assert.ok(wireMaxTokens(2000) <= 8000);
  });
});
