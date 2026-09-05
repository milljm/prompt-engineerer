export type BackendKind = "auto" | "edge" | "xai";
export type ResolvedBackend = "edge" | "xai";

export type ModelRec = {
  id: string;
  name: string;
  backend: ResolvedBackend;
  contextLength?: number;
  ownedBy?: string;
};

export type ConnectionState = {
  edge: { ok: boolean; url: string; error: string | null };
  xai: { ok: boolean; error: string | null };
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
  action: "draft" | "revise" | "revert" | "pass";
  scenarios: ScenarioResult[];
  phaseMs: { parent: number; child: number };
};

export type RunStatus =
  | "idle"
  | "running"
  | "stopping"
  | "passed"
  | "stopped"
  | "failed";

export type Settings = {
  edgeUrl: string;
  backend: BackendKind;
  parentModel: string;
  childModel: string;
  targetScore: number;
  turns: number;
  maxIterations: number;
  childTemperature: number;
};

export const DEFAULT_EDGE_URL = "http://127.0.0.1:8080";

export const DEFAULT_SETTINGS: Settings = {
  edgeUrl: DEFAULT_EDGE_URL,
  backend: "auto",
  parentModel: "",
  childModel: "",
  targetScore: 8,
  turns: 2,
  maxIterations: 6,
  childTemperature: 0.7,
};

export const DEFAULT_GOAL =
  "A coding tutor that never dumps the finished solution. It asks Socratic questions, hints at the next step, and only shows a small snippet when the student is stuck. Stay in character across multiple turns.";
