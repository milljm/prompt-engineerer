import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ENGINE_KILL_MARK } from "./child-cap.ts";
import {
  focusScenarios,
  killFocusBlock,
  mergeLedger,
  parseLedger,
  transcriptsKilled,
} from "./rule-ledger.ts";

describe("parseLedger", () => {
  it("reads verdict aliases and skips junk", () => {
    const rows = parseLedger({
      rule_ledger: [
        { name: "Player agency", verdict: "pass", note: "held" },
        { name: "Story-prose", status: "ok" },
        { name: "Runaway length", verdict: "fail", note: "killed" },
        { name: "" },
      ],
    });
    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.verdict, "pass");
    assert.equal(rows[1]?.verdict, "pass");
    assert.equal(rows[2]?.verdict, "fail");
  });
});

describe("focusScenarios", () => {
  const agency = { name: "Player agency", turns: [{ user: "I walk in." }] };
  const prose = { name: "Story-prose", turns: [{ user: "What do you see?" }] };
  const runaway = { name: "Runaway length", turns: [{ user: "Keep going." }] };

  it("drops passed rules when nothing was killed", () => {
    const ledger = [
      { name: "Player agency", verdict: "pass" as const, note: "" },
      { name: "Story-prose", verdict: "fail" as const, note: "purple" },
    ];
    const kept = focusScenarios([agency, prose], ledger, false);
    assert.deepEqual(
      kept.map((s) => s.name),
      ["Story-prose"],
    );
  });

  it("on ENGINE KILL keeps only runaway even if other rules passed", () => {
    const ledger = [
      { name: "Player agency", verdict: "pass" as const, note: "" },
      { name: "Story-prose", verdict: "pass" as const, note: "" },
    ];
    const kept = focusScenarios([agency, prose], ledger, true);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.name, "Runaway length");
  });

  it("on kill prefers an existing runaway scene", () => {
    const kept = focusScenarios([agency, runaway], [], true);
    assert.deepEqual(
      kept.map((s) => s.name),
      ["Runaway length"],
    );
  });
});

describe("transcriptsKilled", () => {
  it("detects the engine stamp", () => {
    assert.equal(
      transcriptsKilled([
        { name: "x", turns: [{ user: "hi", assistant: `once${ENGINE_KILL_MARK} cut`, ms: 1 }] },
      ]),
      true,
    );
    assert.equal(transcriptsKilled([{ name: "x", turns: [{ user: "hi", assistant: "fine", ms: 1 }] }]), false);
  });
});

describe("killFocusBlock", () => {
  it("forbids pass on a kill", () => {
    const text = killFocusBlock(true, [{ name: "Player agency", verdict: "pass", note: "" }]);
    assert.match(text, /HARD HALT/);
    assert.match(text, /cannot be "pass"/);
  });
});

describe("mergeLedger", () => {
  it("lets a later fail overwrite a pass", () => {
    const next = mergeLedger(
      [{ name: "Runaway length", verdict: "pass", note: "ok" }],
      [{ name: "Runaway length", verdict: "fail", note: "kill" }],
    );
    assert.equal(next[0]?.verdict, "fail");
  });
});
