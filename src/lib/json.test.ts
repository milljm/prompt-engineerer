import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { closeTruncatedJson, extractJsonObject } from "./json.ts";

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

  it("closes a truncated scenarios array", () => {
    const raw =
      '{"action":"revise","system_prompt":"Be terse.","scenarios":[{"name":"Word cap","turns":[{"user":"Write a lot"}]},{"name":"Trust"';
    const parsed = extractJsonObject(raw) as {
      action: string;
      scenarios: { name: string }[];
    };
    assert.equal(parsed.action, "revise");
    assert.equal(parsed.scenarios[0]?.name, "Word cap");
  });
});

describe("closeTruncatedJson", () => {
  it("adds the missing brackets", () => {
    const closed = closeTruncatedJson('{"scenarios":[{"name":"A"');
    assert.doesNotThrow(() => JSON.parse(closed));
  });
});
