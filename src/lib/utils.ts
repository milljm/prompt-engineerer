/**
 * Small presentational helpers used across the studio UI.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, last conflicting utility wins.
 *
 * @param inputs - Class values accepted by `clsx`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Shorten a model id to the last path segment, truncated for selects.
 *
 * @param id - Full model id such as `mlx-community/Qwen2.5-7B-Instruct`.
 */
export function shortModel(id: string) {
  const name = id.split("/").filter(Boolean).pop() || id;
  return name.length > 36 ? `${name.slice(0, 34)}…` : name;
}

/**
 * Format a millisecond duration for the stats strip.
 *
 * @param ms - Elapsed time in milliseconds.
 * @returns A compact string such as `840ms`, `1.2s`, or `2m 3s`.
 */
export function formatMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

/**
 * Clamp `n` into `[min, max]`.
 *
 * @param n - Value to clamp.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 */
export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Generate a short opaque id for iteration records.
 *
 * @param prefix - Leading token, default `id`.
 */
export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
