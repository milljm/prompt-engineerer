/** Pass/fail ledger so Parent stops retesting rules that already hold. */

import { wasKilled } from "./child-cap.ts";
import type { RuleRecord, RuleVerdict, ScenarioResult, ScenarioSpec } from "./types.ts";

export function ruleKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function transcriptsKilled(results: ScenarioResult[]): boolean {
  return results.some((s) => s.turns.some((t) => wasKilled(t.assistant)));
}

export function parseLedger(raw: unknown): RuleRecord[] {
  const src = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as { rule_ledger?: unknown; ledger?: unknown }).rule_ledger ??
        (raw as { ledger?: unknown }).ledger)
      : [];
  const rows = Array.isArray(src) ? src : [];
  const out: RuleRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { name?: unknown; verdict?: unknown; status?: unknown; note?: unknown };
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) continue;
    const key = ruleKey(name);
    if (!key || seen.has(key)) continue;
    const token = String(rec.verdict ?? rec.status ?? "").toLowerCase();
    const verdict: RuleVerdict = token === "pass" || token === "passed" || token === "ok" ? "pass" : "fail";
    const note = typeof rec.note === "string" ? rec.note.trim() : "";
    seen.add(key);
    out.push({ name, verdict, note });
  }
  return out;
}

export function mergeLedger(prev: RuleRecord[], next: RuleRecord[]): RuleRecord[] {
  const map = new Map<string, RuleRecord>();
  for (const row of prev) map.set(ruleKey(row.name), row);
  for (const row of next) map.set(ruleKey(row.name), row);
  return [...map.values()];
}

export function ledgerBrief(ledger: RuleRecord[]): string {
  if (!ledger.length) return "(empty — no rules scored yet)";
  return ledger
    .map((r) => `${r.name}: ${r.verdict.toUpperCase()}${r.note ? ` — ${r.note}` : ""}`)
    .join("\n");
}

export function passedKeys(ledger: RuleRecord[]): Set<string> {
  return new Set(ledger.filter((r) => r.verdict === "pass").map((r) => ruleKey(r.name)));
}

export function failedKeys(ledger: RuleRecord[]): Set<string> {
  return new Set(ledger.filter((r) => r.verdict === "fail").map((r) => ruleKey(r.name)));
}

export function isRunawayName(name: string): boolean {
  return /runaway|engine kill|token cap|word\s*(cap|count|limit)|^\s*(runaway )?length\s*$/i.test(name);
}

function isOverlayName(name: string): boolean {
  if (/runaway|engine kill/i.test(name)) return false;
  return /word\s*(cap|count|limit)|token\s*(cap|limit)|^\s*length\s*$|concise|be brief|format only/i.test(name);
}

/**
 * Drop scenarios for rules that already passed. On ENGINE KILL, drop
 * everything except runaway/length (and any explicit fails).
 */
export function focusScenarios(
  scenarios: ScenarioSpec[],
  ledger: RuleRecord[],
  killed: boolean,
): ScenarioSpec[] {
  const pass = passedKeys(ledger);
  const fail = failedKeys(ledger);
  let kept = scenarios.filter((s) => {
    const key = ruleKey(s.name);
    if (killed) {
      return isRunawayName(s.name) || fail.has(key);
    }
    if (pass.has(key)) return false;
    if (isOverlayName(s.name)) return false;
    return true;
  });
  if (killed && !kept.some((s) => isRunawayName(s.name))) {
    kept = [runawayScenario(), ...kept];
  }
  return kept;
}

export function runawayScenario(): ScenarioSpec {
  return {
    name: "Runaway length",
    turns: [{ user: "Alright — pick up right where you left off. Same scene, keep going." }],
  };
}

export function killFocusBlock(killed: boolean, ledger: RuleRecord[]): string {
  const brief = ledgerBrief(ledger);
  if (!killed) {
    return `RULE LEDGER (do not retest PASS entries; only schedule scenarios for FAIL or new rules):\n${brief}`;
  }
  return (
    `HARD HALT: Child was CUT OFF with [ENGINE KILL]. This is a system-prompt failure.\n` +
    `Do not score truncated prose as success. action cannot be "pass".\n` +
    `Ignore every PASS in the ledger. Do not emit scenarios for those rules.\n` +
    `Your only job this iteration is to stop the runaway: add or tighten a hard stop ` +
    `(token/word/turn cap the Child actually obeys) and emit ONE scenario named ` +
    `"Runaway length" that continues a normal scene — not "write me a novel".\n\n` +
    `RULE LEDGER:\n${brief}`
  );
}
