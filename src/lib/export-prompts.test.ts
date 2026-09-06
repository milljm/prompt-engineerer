import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { versionsMarkdown } from "./export-prompts.ts";
import type { PromptVersion } from "./types.ts";

describe("versionsMarkdown", () => {
  it("renders every revision", () => {
    const versions: PromptVersion[] = [
      {
        rev: 1,
        prompt: "Be brief.",
        rationale: "",
        score: 6,
        status: "tested",
        createdAt: 1,
        parentRev: null,
      },
      {
        rev: 2,
        prompt: "Be briefer.",
        rationale: "",
        score: null,
        status: "draft",
        createdAt: 2,
        parentRev: 1,
      },
    ];
    const md = versionsMarkdown(versions);
    assert.match(md, /## v1 · tested · 6\/10/);
    assert.match(md, /Be brief\./);
    assert.match(md, /## v2 · draft · unscored/);
  });
});
