/**
 * Shared domain types for Prompt Engineerer: models, settings, versions, and
 * iteration records. Persisted settings live in localStorage via the store.
 */

import { clampChildMaxTokens, CHILD_TOKENS_DEFAULT } from "./child-cap.ts";
import { SIDEBAR_DEFAULT, clampSidebarWidth } from "./sidebar.ts";

/** A chat model listed by an OpenAI-compatible `/v1/models` endpoint. */
export type ModelRec = {
  id: string;
  name: string;
  contextLength?: number;
  ownedBy?: string;
};

/** Live connection probe against the user-entered API address. */
export type ConnectionState = {
  ok: boolean;
  url: string;
  error: string | null;
  models: ModelRec[];
  probing: boolean;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ScenarioSpec = {
  name: string;
  turns: { user: string }[];
};

export type ScenarioTurn = {
  user: string;
  assistant: string;
  ms: number;
};

export type ScenarioResult = {
  name: string;
  turns: ScenarioTurn[];
};

export type RuleVerdict = "pass" | "fail";

export type RuleRecord = {
  name: string;
  verdict: RuleVerdict;
  note: string;
};

export type PromptVersion = {
  rev: number;
  prompt: string;
  rationale: string;
  score: number | null;
  status: "draft" | "tested" | "abandoned" | "champion";
  createdAt: number;
  parentRev: number | null;
};

export type IterationRecord = {
  id: string;
  iteration: number;
  rev: number;
  startedAt: number;
  ms: number;
  score: number | null;
  rationale: string;
  action: "draft" | "revise" | "revert" | "pass" | "judging";
  scenarios: ScenarioResult[];
  ledger: RuleRecord[];
  phaseMs: { parent: number; child: number };
};

/** Insert or replace an iteration by id so a judging stub can fill in later. */
export function upsertIteration(
  list: IterationRecord[],
  record: IterationRecord,
): IterationRecord[] {
  const idx = list.findIndex((it) => it.id === record.id);
  if (idx < 0) return [...list, record];
  const next = list.slice();
  next[idx] = record;
  return next;
}

export type RunStatus =
  | "idle"
  | "running"
  | "stopping"
  | "passed"
  | "stopped"
  | "failed";

export type Settings = {
  apiUrl: string;
  apiKey: string;
  parentModel: string;
  childModel: string;
  targetScore: number;
  turns: number;
  maxIterations: number;
  childTemperature: number;
  childMaxTokens: number;
  sidebarWidth: number;
  sidebarAuto: boolean;
  sidebarCollapsed: boolean;
};

/** Pre-v2 persisted settings that still used the Edge/xAI backend picker. */
export type LegacySettings = Partial<Settings> & { edgeUrl?: string; backend?: string };

export const TURNS_MIN = 1;
export const TURNS_MAX = 20;
export const SCENARIOS_MAX = 20;

export function clampTurns(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 2;
  return Math.max(TURNS_MIN, Math.min(TURNS_MAX, v));
}

export const DEFAULT_SETTINGS: Settings = {
  apiUrl: "",
  apiKey: "",
  parentModel: "",
  childModel: "",
  targetScore: 8,
  turns: 2,
  maxIterations: 6,
  childTemperature: 0.7,
  childMaxTokens: CHILD_TOKENS_DEFAULT,
  sidebarWidth: SIDEBAR_DEFAULT,
  sidebarAuto: true,
  sidebarCollapsed: false,
};

export const DEFAULT_GOAL =
  "A coding tutor that never dumps the finished solution. It asks Socratic questions, hints at the next step, and only shows a small snippet when the student is stuck. Stay in character across multiple turns.";

/**
 * Lift persisted settings from the old Edge/xAI picker onto `apiUrl` / `apiKey`.
 *
 * @param raw - Partial settings as stored in localStorage (any version).
 */
export function migrateSettings(raw: LegacySettings | undefined): Settings {
  const src = { ...(raw ?? {}) };
  const fromEdge = src.edgeUrl;
  delete src.edgeUrl;
  delete src.backend;
  return {
    ...DEFAULT_SETTINGS,
    ...src,
    apiUrl: (src.apiUrl || fromEdge || "").trim(),
    apiKey: src.apiKey ?? "",
    turns: clampTurns(src.turns ?? DEFAULT_SETTINGS.turns),
    childMaxTokens: clampChildMaxTokens(src.childMaxTokens ?? DEFAULT_SETTINGS.childMaxTokens),
    sidebarWidth: clampSidebarWidth(src.sidebarWidth ?? DEFAULT_SETTINGS.sidebarWidth),
    sidebarAuto: src.sidebarAuto !== false,
    sidebarCollapsed: src.sidebarCollapsed === true,
  };
}
