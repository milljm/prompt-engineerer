/** Merge Parent's new scenario list with the previous iteration's rules. */

import { SCENARIOS_MAX, type ScenarioSpec } from "./types.ts";

/**
 * Keep every newly named scenario, then append prior scenarios whose names
 * did not come back. Stops a truncated Parent reply from dropping old rules.
 *
 * @param next - Scenarios Parent just emitted.
 * @param prev - Scenarios that actually ran last iteration.
 */
export function mergeScenarios(next: ScenarioSpec[], prev: ScenarioSpec[]): ScenarioSpec[] {
  if (!next.length) return prev.slice(0, SCENARIOS_MAX);
  const seen = new Set(next.map((s) => s.name.trim().toLowerCase()));
  const out = [...next];
  for (const old of prev) {
    const key = old.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(old);
  }
  return out.slice(0, SCENARIOS_MAX);
}
