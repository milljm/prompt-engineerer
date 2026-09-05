import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampSidebarWidth,
  suggestSidebarWidth,
} from "./sidebar.ts";

describe("clampSidebarWidth", () => {
  it("returns the default for junk", () => {
    assert.equal(clampSidebarWidth(undefined), SIDEBAR_DEFAULT);
    assert.equal(clampSidebarWidth("nope"), SIDEBAR_DEFAULT);
    assert.equal(clampSidebarWidth(Number.NaN), SIDEBAR_DEFAULT);
  });

  it("clamps to the allowed range", () => {
    assert.equal(clampSidebarWidth(SIDEBAR_MIN - 80), SIDEBAR_MIN);
    assert.equal(clampSidebarWidth(SIDEBAR_MAX + 200), SIDEBAR_MAX);
    assert.equal(clampSidebarWidth(412.6), 413);
  });
});

describe("suggestSidebarWidth", () => {
  it("stays at the default for short labels", () => {
    assert.equal(suggestSidebarWidth(["http://127.0.0.1:8080/v1", "llama"]), SIDEBAR_DEFAULT);
  });

  it("grows for long model ids and never exceeds the max", () => {
    const long = "mlx-community/" + "Qwen2.5-72B-Instruct-4bit-and-then-some-extra".repeat(3);
    const width = suggestSidebarWidth([long]);
    assert.ok(width > SIDEBAR_DEFAULT);
    assert.ok(width <= SIDEBAR_MAX);
  });
});
