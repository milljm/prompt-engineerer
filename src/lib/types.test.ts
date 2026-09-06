import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, TURNS_MAX, clampTurns, migrateSettings } from "./types.ts";

describe("migrateSettings", () => {
  it("returns defaults for empty storage", () => {
    assert.deepEqual(migrateSettings(undefined), DEFAULT_SETTINGS);
  });

  it("copies edgeUrl onto apiUrl and drops the backend picker", () => {
    const next = migrateSettings({
      edgeUrl: " http://127.0.0.1:1234 ",
      backend: "auto",
      parentModel: "grok-4",
      targetScore: 9,
    });
    assert.equal(next.apiUrl, "http://127.0.0.1:1234");
    assert.equal(next.parentModel, "grok-4");
    assert.equal(next.targetScore, 9);
    assert.equal("backend" in next, false);
    assert.equal("edgeUrl" in next, false);
  });

  it("prefers an already-migrated apiUrl", () => {
    const next = migrateSettings({
      apiUrl: "https://api.openai.com/v1",
      edgeUrl: "http://127.0.0.1:8080",
      apiKey: "sk-test",
    });
    assert.equal(next.apiUrl, "https://api.openai.com/v1");
    assert.equal(next.apiKey, "sk-test");
  });

  it("fills a missing sidebar width and clamps a huge one", () => {
    assert.equal(migrateSettings({}).sidebarWidth, DEFAULT_SETTINGS.sidebarWidth);
    assert.equal(migrateSettings({ sidebarAuto: false }).sidebarAuto, false);
    const huge = migrateSettings({ sidebarWidth: 4000 });
    assert.ok(huge.sidebarWidth < 4000);
    assert.equal(huge.sidebarAuto, true);
  });

  it("clamps turns into 1–20", () => {
    assert.equal(migrateSettings({ turns: 99 }).turns, TURNS_MAX);
    assert.equal(migrateSettings({ turns: 0 }).turns, 1);
  });
});

describe("clampTurns", () => {
  it("defaults junk to 2 and caps at 20", () => {
    assert.equal(clampTurns(undefined), 2);
    assert.equal(clampTurns(20), 20);
    assert.equal(clampTurns(21), 20);
  });
});
