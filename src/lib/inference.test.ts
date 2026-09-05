import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseModelRows, pickDefaultModels, uniqueModels } from "./inference.ts";
import type { ModelRec } from "./types.ts";

function model(id: string): ModelRec {
  return { id, name: id };
}

describe("parseModelRows", () => {
  it("reads OpenAI data[] and drops media models", () => {
    const models = parseModelRows({
      data: [
        { id: "gpt-4.1", owned_by: "openai", context_length: 128000 },
        { id: "text-embedding-3-small" },
        { id: "dall-e-3" },
        { id: "" },
      ],
    });
    assert.deepEqual(
      models.map((m) => m.id),
      ["gpt-4.1"],
    );
    assert.equal(models[0]?.contextLength, 128000);
  });

  it("accepts a models[] alias", () => {
    const models = parseModelRows({ models: [{ id: "grok-4" }] });
    assert.equal(models[0]?.id, "grok-4");
  });
});

describe("pickDefaultModels", () => {
  it("returns empty ids when the catalog is empty", () => {
    assert.deepEqual(pickDefaultModels([]), { parent: "", child: "" });
  });

  it("prefers a large parent and a distinct mini child", () => {
    const picked = pickDefaultModels([
      model("llama-8b-instruct"),
      model("grok-4"),
      model("whisper-1"),
    ]);
    assert.equal(picked.parent, "grok-4");
    assert.equal(picked.child, "llama-8b-instruct");
  });

  it("falls back to the same model when only one is listed", () => {
    const picked = pickDefaultModels([model("qwen2.5-32b")]);
    assert.equal(picked.parent, "qwen2.5-32b");
    assert.equal(picked.child, "qwen2.5-32b");
  });
});

describe("uniqueModels", () => {
  it("keeps the first row per id", () => {
    const rows = uniqueModels([model("a"), model("b"), { id: "a", name: "A-dup" }]);
    assert.deepEqual(
      rows.map((m) => m.name),
      ["a", "b"],
    );
  });
});
