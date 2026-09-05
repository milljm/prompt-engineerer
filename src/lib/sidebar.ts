/**
 * Sidebar width helpers. The studio sidebar is user-resizable and will also
 * grow on its own so long model ids / API URLs are not clipped.
 */

import { clamp } from "./utils.ts";

/** Narrowest usable sidebar (px). Below this, sliders and selects collapse. */
export const SIDEBAR_MIN = 280;

/** Widest sidebar (px). Leaves room for the prompt + run columns. */
export const SIDEBAR_MAX = 640;

/** Comfortable default — wider than the old 20rem cap. */
export const SIDEBAR_DEFAULT = 400;

/**
 * Clamp a persisted or dragged width onto the allowed range.
 *
 * Non-finite values fall back to {@link SIDEBAR_DEFAULT}.
 *
 * @param n - Candidate width in CSS pixels.
 */
export function clampSidebarWidth(n: unknown): number {
  const value = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT;
  return clamp(Math.round(value), SIDEBAR_MIN, SIDEBAR_MAX);
}

/**
 * Suggest a width that fits the longest label (API URL or model id).
 *
 * Grows from {@link SIDEBAR_DEFAULT}; never shrinks below it so a short
 * catalog does not yank a comfortable layout closed.
 *
 * @param labels - Strings rendered in the sidebar (urls, model ids).
 */
export function suggestSidebarWidth(labels: string[]): number {
  const longest = labels.reduce((max, label) => Math.max(max, (label ?? "").trim().length), 0);
  // IBM Plex Mono 11px ≈ 7.2px / character, plus padding and parent/child badges.
  const fromChars = Math.round(longest * 7.2 + 72);
  return clampSidebarWidth(Math.max(SIDEBAR_DEFAULT, fromChars));
}
