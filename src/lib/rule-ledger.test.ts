import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ENGINE_KILL_MARK } from "./child-cap.ts";
import {
  focusScenarios,
  killFocusBlock,
  ledgerWantsKillHalt,
  mergeLedger,
  namesMatch,
  parseLedger,
  parseLedgerFromText,
  planNextScenarios,
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

describe("parseLedgerFromText", () => {
  it("reads the prose dump Parent puts in the rationale", () => {
    const rows = parseLedgerFromText(`
ENGINE KILL failure persists. Added a turn limit.

Word/token cap: fail
First-person narration: pass
Three-channel recognition: pass
NPC perception limits: pass
OOC handling: pass
Runaway length: fail
`);
    assert.equal(rows.find((r) => r.name === "Three-channel recognition")?.verdict, "pass");
    assert.equal(rows.find((r) => r.name === "Runaway length")?.verdict, "fail");
    assert.equal(rows.find((r) => r.name === "Word/token cap")?.verdict, "fail");
    assert.equal(rows.some((r) => /engine kill failure/i.test(r.name)), false);
  });
});

describe("namesMatch", () => {
  it("treats THREE-CHANNEL RECOGNITION as Three-channel recognition", () => {
    assert.equal(namesMatch("THREE-CHANNEL RECOGNITION", "Three-channel recognition"), true);
    assert.equal(namesMatch("Player agency", "Runaway length"), false);
  });
});

describe("focusScenarios", () => {
  const agency = { name: "Player agency", turns: [{ user: "I walk in." }] };
  const prose = { name: "Story-prose", turns: [{ user: "What do you see?" }] };
  const runaway = { name: "Runaway length", turns: [{ user: "Keep going." }] };
  const three = { name: "THREE-CHANNEL RECOGNITION", turns: [{ user: "I enter the tavern." }] };

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

  it("drops a passing rule even when Parent restyles the scene name", () => {
    const first = { name: "First-person narration", turns: [{ user: "I look around." }] };
    const ledger = [
      { name: "Three-channel recognition", verdict: "pass" as const, note: "" },
      { name: "First-person narration", verdict: "fail" as const, note: "slipped" },
    ];
    const kept = focusScenarios([three, first], ledger, false);
    assert.deepEqual(
      kept.map((s) => s.name),
      ["First-person narration"],
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

describe("planNextScenarios", () => {
  it("does not let last round's passing scenes sneak back in", () => {
    const prior = [
      { name: "THREE-CHANNEL RECOGNITION", turns: [{ user: "Any adventurers here?" }] },
      { name: "Runaway length", turns: [{ user: "Keep going." }] },
    ];
    const incoming = [
      { name: "Three-channel recognition", turns: [{ user: "I enter the tavern." }] },
      { name: "NPC perception limits", turns: [{ user: "I hide." }] },
    ];
    const ledger = [
      { name: "Three-channel recognition", verdict: "pass" as const, note: "" },
      { name: "NPC perception limits", verdict: "pass" as const, note: "" },
      { name: "Runaway length", verdict: "fail" as const, note: "ENGINE KILL" },
    ];
    const kept = planNextScenarios(incoming, prior, ledger, false);
    assert.deepEqual(
      kept.map((s) => s.name),
      ["Runaway length"],
    );
  });
});

describe("ledgerWantsKillHalt", () => {
  it("halts when runaway is failing even without a fresh stamp", () => {
    assert.equal(
      ledgerWantsKillHalt([{ name: "Runaway length", verdict: "fail", note: "" }]),
      true,
    );
    assert.equal(
      ledgerWantsKillHalt([{ name: "Player agency", verdict: "pass", note: "" }]),
      false,
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
