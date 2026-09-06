import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractJsonObject } from "./json.ts";

describe("extractJsonObject", () => {
  it("parses a bare object", () => {
    assert.deepEqual(extractJsonObject('{"action":"pass","score":9}'), {
      action: "pass",
      score: 9,
    });
  });

  it("unwraps a markdown fence", () => {
    const text = "Here you go:\n```json\n{\"action\":\"revise\"}\n```\n";
    assert.deepEqual(extractJsonObject(text), { action: "revise" });
  });

  it("recovers an object buried in chatter", () => {
    const text = 'Sure. {"system_prompt":"Be brief","score":7} hope that helps';
    assert.deepEqual(extractJsonObject(text), { system_prompt: "Be brief", score: 7 });
  });

  it("rejects empty and non-json replies", () => {
    assert.throws(() => extractJsonObject("   "), /Empty model reply/);
    assert.throws(() => extractJsonObject("no object here"), /Could not parse JSON/);
  });

  it("repairs illegal apostrophe escapes", () => {
    const raw = `{"rationale":"Child didn't hold the persona."}`;
    const illegal = `{"rationale":"Child didn\\'t hold the persona."}`;
    assert.deepEqual(extractJsonObject(illegal), extractJsonObject(raw));
  });
});
