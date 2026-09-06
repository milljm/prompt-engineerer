import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFenceInfo } from "./artifacts.ts";

describe("parseFenceInfo", () => {
  it("reads lang and filename from a fence info string", () => {
    assert.deepEqual(parseFenceInfo("python hello.py"), { lang: "python", file: "hello.py" });
    assert.deepEqual(parseFenceInfo("js"), { lang: "js", file: null });
    assert.deepEqual(parseFenceInfo("python filename=src/lib/md.ts"), {
      lang: "python",
      file: "src/lib/md.ts",
    });
  });
});
