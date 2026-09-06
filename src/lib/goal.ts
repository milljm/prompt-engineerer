/**
 * Height helpers for the "What you want" goal bubble.
 * User-resizable, auto-grows with content, never shrinks on its own.
 */

import { clamp } from "./utils.ts";

/** Shortest usable goal field (px). Matches Tailwind min-h-28. */
export const GOAL_MIN = 112;

/** Tallest goal field (px). Leaves room for the system prompt. */
export const GOAL_MAX = 640;

/** Default — three short lines of desire. */
export const GOAL_DEFAULT = 112;

/**
 * Clamp a persisted or dragged height onto the allowed range.
 *
 * Non-finite values fall back to {@link GOAL_DEFAULT}.
 *
 * @param n - Candidate height in CSS pixels.
 */
export function clampGoalHeight(n: unknown): number {
  const value = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(value)) return GOAL_DEFAULT;
  return clamp(Math.round(value), GOAL_MIN, GOAL_MAX);
}

/**
 * Height that fits the current text without exceeding {@link GOAL_MAX}.
 *
 * @param scrollHeight - textarea.scrollHeight after a height reset.
 */
export function fitGoalHeight(scrollHeight: number): number {
  return clampGoalHeight(scrollHeight);
}
