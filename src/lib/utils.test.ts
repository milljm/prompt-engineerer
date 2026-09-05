import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clamp, formatMs, shortModel, uid } from "./utils.ts";

describe("shortModel", () => {
  it("keeps the last path segment", () => {
    assert.equal(shortModel("mlx-community/Qwen2.5-7B-Instruct-4bit"), "Qwen2.5-7B-Instruct-4bit");
  });

  it("truncates very long ids", () => {
    const long = "a".repeat(50);
    const out = shortModel(long);
    assert.equal(out.endsWith("…"), true);
    assert.equal(out.length, 35);
  });
});

describe("formatMs", () => {
  it("formats ms, seconds, and minutes", () => {
    assert.equal(formatMs(840), "840ms");
    assert.equal(formatMs(1200), "1.2s");
    assert.equal(formatMs(12_000), "12s");
    assert.equal(formatMs(125_000), "2m 5s");
  });

  it("returns an em dash for junk", () => {
    assert.equal(formatMs(-1), "—");
    assert.equal(formatMs(Number.NaN), "—");
  });
});

describe("clamp / uid", () => {
  it("clamps inclusive", () => {
    assert.equal(clamp(3, 5, 10), 5);
    assert.equal(clamp(12, 5, 10), 10);
    assert.equal(clamp(7, 5, 10), 7);
  });

  it("prefixes generated ids", () => {
    assert.match(uid("iter"), /^iter-[a-z0-9]+$/);
  });
});
