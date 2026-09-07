/** Pass/fail ledger so Parent stops retesting rules that already hold. */

import { wasKilled } from "./child-cap.ts";
import type { RuleRecord, RuleVerdict, ScenarioResult, ScenarioSpec } from "./types.ts";

export function ruleKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function transcriptsKilled(results: ScenarioResult[]): boolean {
  return results.some((s) => s.turns.some((t) => wasKilled(t.assistant)));
}

const LEDGER_SKIP = /^(score|action|rev|iteration|note|rationale|pass|status|system prompt)$/i;

export function parseLedger(raw: unknown): RuleRecord[] {
  const src = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as { rule_ledger?: unknown; ledger?: unknown }).rule_ledger ??
        (raw as { ledger?: unknown }).ledger)
      : [];
  const rows = Array.isArray(src) ? src : [];
  return dedupeRows(
    rows.map((row) => {
      if (!row || typeof row !== "object") return null;
      const rec = row as { name?: unknown; verdict?: unknown; status?: unknown; note?: unknown };
      const name = typeof rec.name === "string" ? rec.name.trim() : "";
      if (!name) return null;
      const token = String(rec.verdict ?? rec.status ?? "").toLowerCase();
      const verdict: RuleVerdict = token === "pass" || token === "passed" || token === "ok" ? "pass" : "fail";
      const note = typeof rec.note === "string" ? rec.note.trim() : "";
      return { name, verdict, note };
    }),
  );
}

/**
 * Parent often dumps the ledger as prose (`Three-channel recognition: pass`)
 * instead of JSON. Pull those rows so the engine can still drop them.
 */
export function parseLedgerFromText(text: string): RuleRecord[] {
  if (!text.trim()) return [];
  const re = /^[\s>*-]*([^:\n]{2,80}?)\s*[:—-]\s*(pass|fail|passed|failed|ok)\b/gim;
  const rows: Array<RuleRecord | null> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = (m[1] ?? "").trim();
    if (!name || LEDGER_SKIP.test(name) || /engine kill failure/i.test(name)) continue;
    const token = (m[2] ?? "").toLowerCase();
    const verdict: RuleVerdict = token === "pass" || token === "passed" || token === "ok" ? "pass" : "fail";
    rows.push({ name, verdict, note: "" });
  }
  return dedupeRows(rows);
}

function dedupeRows(rows: Array<RuleRecord | null>): RuleRecord[] {
  const out: RuleRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row) continue;
    const key = ruleKey(row.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function mergeLedger(prev: RuleRecord[], next: RuleRecord[]): RuleRecord[] {
  const map = new Map<string, RuleRecord>();
  for (const row of prev) map.set(ruleKey(row.name), row);
  for (const row of next) map.set(ruleKey(row.name), row);
  return [...map.values()];
}

/** Names and verdicts only. Notes quote old Child and leak into the next judge. */
export function ledgerBrief(ledger: RuleRecord[]): string {
  if (!ledger.length) return "(empty — no rules scored yet)";
  return ledger.map((r) => `${r.name}: ${r.verdict.toUpperCase()}`).join("\n");
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

/** True when two labels are the same rule, even if Parent renamed the scene. */
export function namesMatch(a: string, b: string): boolean {
  const left = ruleKey(a);
  const right = ruleKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const lt = left.split(" ").filter((t) => t.length > 2);
  const rt = new Set(right.split(" ").filter((t) => t.length > 2));
  if (!lt.length || !rt.size) return false;
  const hit = lt.filter((t) => rt.has(t)).length;
  return hit >= Math.min(2, lt.length, rt.size);
}

function hits(name: string, rows: RuleRecord[]): boolean {
  return rows.some((r) => namesMatch(name, r.name));
}

export function ledgerWantsKillHalt(ledger: RuleRecord[]): boolean {
  return ledger.some((r) => stickyKillFail(r));
}

/** Fail rows that exist only because of a prior ENGINE KILL stamp. */
export function stickyKillFail(row: RuleRecord): boolean {
  if (row.verdict !== "fail") return false;
  if (/engine kill/i.test(row.note) || /engine kill/i.test(row.name)) return true;
  return /runaway/i.test(row.name);
}

/**
 * A clean round (no kill stamp in THESE transcripts) must not inherit
 * last round's ENGINE KILL fail.
 */
export function clearStickyKillFails(ledger: RuleRecord[], killed: boolean): RuleRecord[] {
  if (killed) return ledger;
  return ledger.map((r) =>
    stickyKillFail(r)
      ? {
          ...r,
          verdict: "pass" as const,
          note: "Held this round — no ENGINE KILL in these transcripts.",
        }
      : r,
  );
}

export const RUNAWAY_OPEN =
  "I push open the tavern door and look around. Anyone here I should know about?";
export const RUNAWAY_CONTINUE = "I stay where I am. What happens next?";

export function isOrphanContinue(user: string): boolean {
  return /pick up|left off|same scene, keep going|resume from|continue from (there|the last)|no prior scene/i.test(
    user,
  );
}

export function runawayScenario(hasPrior = false): ScenarioSpec {
  return {
    name: "Runaway length",
    turns: [{ user: hasPrior ? RUNAWAY_CONTINUE : RUNAWAY_OPEN }],
  };
}

export function scenariosFromFails(ledger: RuleRecord[], halt: boolean): ScenarioSpec[] {
  if (halt || ledgerWantsKillHalt(ledger)) return [runawayScenario()];
  return ledger
    .filter((r) => r.verdict === "fail" && !isOverlayName(r.name))
    .map((r) => ({
      name: r.name,
      turns: [{ user: "Continue the same scene. Stay in character." }],
    }));
}

/**
 * Drop scenarios for rules that already passed. On ENGINE KILL / runaway fail,
 * keep exactly one runaway scene — nothing that already passed.
 */
export function focusScenarios(
  scenarios: ScenarioSpec[],
  ledger: RuleRecord[],
  killed: boolean,
): ScenarioSpec[] {
  const halt = killed || ledgerWantsKillHalt(ledger);
  const pass = ledger.filter((r) => r.verdict === "pass");
  const fail = ledger.filter((r) => r.verdict === "fail");
  if (halt) {
    const existing = scenarios.find((s) => isRunawayName(s.name));
    return [existing ?? runawayScenario()];
  }
  let kept = scenarios.filter((s) => {
    if (hits(s.name, pass)) return false;
    if (isOverlayName(s.name) && !isRunawayName(s.name)) return false;
    if (fail.length && !hits(s.name, fail)) {
      // Brand-new scene (not in the ledger yet) is allowed once.
      return !hits(s.name, ledger);
    }
    return true;
  });
  if (!kept.length) kept = scenariosFromFails(ledger, false);
  return kept;
}

/**
 * Next iteration's plan: Parent's new list if it has any, else last round,
 * then strip PASS / force runaway. Never let last round's passing scenes
 * sneak back in.
 */
export function planNextScenarios(
  incoming: ScenarioSpec[],
  prior: ScenarioSpec[],
  ledger: RuleRecord[],
  killed: boolean,
): ScenarioSpec[] {
  const halt = killed || ledgerWantsKillHalt(ledger);
  if (halt) return [runawayScenario()];
  const source = incoming.length ? incoming : prior;
  const kept = focusScenarios(source, ledger, false);
  return kept.length ? kept : scenariosFromFails(ledger, false);
}

export function killFocusBlock(killed: boolean, ledger: RuleRecord[]): string {
  const brief = ledgerBrief(ledger);
  if (!killed) {
    return (
      `RULE LEDGER — this is binding, not a suggestion.\n` +
      `Do NOT emit a scenario for any PASS row. The engine will drop them if you do.\n` +
      `Only FAIL rows (and brand-new rules not listed) get scenarios this round.\n` +
      `Verdicts are for THIS round's transcripts only. A prior ENGINE KILL does not ` +
      `make this round a fail if Child stayed under the cap. If there is no [ENGINE KILL] ` +
      `in THIS transcript, Runaway length must be PASS.\n` +
      `Ledger rows are name + verdict only. They are not quotes from this transcript.\n` +
      `${brief}`
    );
  }
  return (
    `HARD HALT: Child was CUT OFF with [ENGINE KILL] in THIS round's transcripts.\n` +
    `Do not score truncated prose as success. action cannot be "pass".\n` +
    `Ignore every PASS in the ledger. Do not emit scenarios for those rules.\n` +
    `Your only job this iteration is to stop the runaway: add or tighten a hard stop ` +
    `(token/word/turn cap the Child actually obeys) and emit ONE scenario named ` +
    `"Runaway length" and ZERO others. The engine will discard extras.\n\n` +
    `RULE LEDGER:\n${brief}`
  );
}
