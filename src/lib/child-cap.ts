/** Hard Child completion cap helpers. */

export const CHILD_TOKENS_MIN = 32;
export const CHILD_TOKENS_MAX = 8192;
export const CHILD_TOKENS_DEFAULT = 600;

export const ENGINE_KILL_MARK = "[ENGINE KILL]";

/**
 * Cheap completion-token estimate (chars / 4). Good enough to cut a runaway.
 *
 * @param text - Generated Child text so far.
 */
export function estimateTokens(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length / 4));
}

/**
 * Clamp the user-entered Child completion cap.
 *
 * @param n - Raw value from settings or an input.
 */
export function clampChildMaxTokens(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : CHILD_TOKENS_DEFAULT;
  return Math.max(CHILD_TOKENS_MIN, Math.min(CHILD_TOKENS_MAX, v));
}

/**
 * Abrupt notice appended to a killed Child turn. Parent must treat this as
 * a cage failure and add or tighten a rule.
 *
 * @param cap - Configured token cap.
 * @param used - Estimated or reported completion tokens.
 */
export function childKillStamp(cap: number, used: number): string {
  return (
    `\n\n${ENGINE_KILL_MARK} Child hit the hard completion cap (${used} ≥ ${cap} tokens) and was CUT OFF mid-reply. ` +
    `This is a system-prompt failure. Add or tighten a rule that stops the runaway. ` +
    `Do not score the truncated prose as success.`
  );
}

export function wasKilled(text: string): boolean {
  return text.includes(ENGINE_KILL_MARK);
}
