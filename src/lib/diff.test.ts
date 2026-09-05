import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffLines, promptsDiffer } from "./diff.ts";

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

describe("promptsDiffer", () => {
  it("is false for the same text", () => {
    assert.equal(promptsDiffer("x", "x"), false);
    assert.equal(promptsDiffer("x", "y"), true);
  });
});
