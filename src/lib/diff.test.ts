import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffLines, lineMarks, promptsDiffer, unifiedDiff } from "./diff.ts";

describe("diffLines", () => {
  it("marks identical prompts as equal lines", () => {
    assert.deepEqual(diffLines("a\nb", "a\nb"), [
      { type: "eq", text: "a" },
      { type: "eq", text: "b" },
    ]);
  });

  it("marks inserted, deleted, and replaced lines", () => {
    const ops = diffLines("keep\ngone\nstay", "keep\nnew\nstay");
    assert.deepEqual(
      ops.map((o) => `${o.type}:${o.text}`),
      ["eq:keep", "del:gone", "add:new", "eq:stay"],
    );
  });

  it("handles empty baseline", () => {
    assert.deepEqual(diffLines("", "hello"), [
      { type: "del", text: "" },
      { type: "add", text: "hello" },
    ]);
  });
});

describe("lineMarks", () => {
  it("aligns with after lines and skips deletions", () => {
    assert.deepEqual(lineMarks("keep\ngone\nstay", "keep\nnew\nstay"), ["eq", "add", "eq"]);
  });
});

describe("unifiedDiff", () => {
  it("emits a compact hunk instead of the full prompt", () => {
    const before = "alpha\nBe helpful.\nAlways.\nomega";
    const after = "alpha\nBe terse.\nAlways.\nomega";
    const text = unifiedDiff(before, after, "v1", "v2", 1);
    assert.match(text, /^--- v1\n\+\+\+ v2\n@@/m);
    assert.match(text, /-Be helpful\./);
    assert.match(text, /\+Be terse\./);
    assert.match(text, / Always\./);
    assert.doesNotMatch(text, /omega/);
  });

  it("says so when nothing changed", () => {
    assert.equal(unifiedDiff("same", "same", "v1", "v2"), "(no changes v1 → v2)");
  });
});

describe("promptsDiffer", () => {
  it("is false for the same text", () => {
    assert.equal(promptsDiffer("x", "x"), false);
    assert.equal(promptsDiffer("x", "y"), true);
  });
});
