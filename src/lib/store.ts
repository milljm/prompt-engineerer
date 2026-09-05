import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_GOAL,
  DEFAULT_SETTINGS,
  type ConnectionState,
  type IterationRecord,
  type PromptVersion,
  type RunStatus,
  type Settings,
} from "./types";

type EngineStore = {
  settings: Settings;
  goal: string;
  seedPrompt: string;
  versions: PromptVersion[];
  currentRev: number | null;
  iterations: IterationRecord[];
  status: RunStatus;
  phase: string;
  liveChild: string;
  liveParent: string;
  error: string | null;
  connection: ConnectionState;
  viewingRev: number | null;
  setSettings: (patch: Partial<Settings>) => void;
  setGoal: (goal: string) => void;
  setSeedPrompt: (prompt: string) => void;
  setConnection: (patch: Partial<ConnectionState>) => void;
  setRun: (patch: {
    status?: RunStatus;
    phase?: string;
    liveChild?: string;
    liveParent?: string;
    error?: string | null;
  }) => void;
  resetRun: () => void;
  addVersion: (version: PromptVersion) => void;
  updateVersion: (rev: number, patch: Partial<PromptVersion>) => void;
  setCurrentRev: (rev: number | null) => void;
  setViewingRev: (rev: number | null) => void;
  addIteration: (record: IterationRecord) => void;
  restoreRev: (rev: number) => number | null;
  abandonCurrent: () => number | null;
  currentPrompt: () => string;
};

const emptyConnection: ConnectionState = {
  edge: { ok: false, url: DEFAULT_SETTINGS.edgeUrl, error: null },
  xai: { ok: false, error: null },
  models: [],
  probing: false,
};

export const useEngineStore = create<EngineStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      goal: DEFAULT_GOAL,
      seedPrompt: "",
      versions: [],
      currentRev: null,
      iterations: [],
      status: "idle",
      phase: "",
      liveChild: "",
      liveParent: "",
      error: null,
      connection: emptyConnection,
      viewingRev: null,
      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setGoal: (goal) => set({ goal }),
      setSeedPrompt: (seedPrompt) => set({ seedPrompt }),
      setConnection: (patch) =>
        set((s) => ({ connection: { ...s.connection, ...patch } })),
      setRun: (patch) => set(patch),
      resetRun: () =>
        set({
          versions: [],
          currentRev: null,
          iterations: [],
          status: "idle",
          phase: "",
          liveChild: "",
          liveParent: "",
          error: null,
          viewingRev: null,
        }),
      addVersion: (version) =>
        set((s) => ({
          versions: [...s.versions, version],
          currentRev: version.rev,
          viewingRev: version.rev,
        })),
      updateVersion: (rev, patch) =>
        set((s) => ({
          versions: s.versions.map((v) => (v.rev === rev ? { ...v, ...patch } : v)),
        })),
      setCurrentRev: (rev) => set({ currentRev: rev, viewingRev: rev }),
      setViewingRev: (rev) => set({ viewingRev: rev }),
      addIteration: (record) =>
        set((s) => ({ iterations: [...s.iterations, record] })),
      restoreRev: (rev) => {
        const src = get().versions.find((v) => v.rev === rev);
        if (!src) return null;
        const nextRev = (get().versions.at(-1)?.rev ?? 0) + 1;
        const copy: PromptVersion = {
          rev: nextRev,
          prompt: src.prompt,
          rationale: `Restored from rev ${rev}`,
          score: null,
          status: "draft",
          createdAt: Date.now(),
          parentRev: rev,
        };
        set((s) => ({
          versions: [
            ...s.versions.map((v) =>
              v.status === "champion" ? v : v.rev === s.currentRev ? { ...v, status: "abandoned" as const } : v,
            ),
            copy,
          ],
          currentRev: nextRev,
          viewingRev: nextRev,
        }));
        return nextRev;
      },
      abandonCurrent: () => {
        const { versions, currentRev } = get();
        if (currentRev == null) return null;
        const champion = [...versions].reverse().find((v) => v.status === "champion");
        const previous = [...versions]
          .reverse()
          .find((v) => v.rev !== currentRev && v.status !== "abandoned");
        const target = champion ?? previous;
        set((s) => ({
          versions: s.versions.map((v) =>
            v.rev === currentRev ? { ...v, status: "abandoned" as const } : v,
          ),
          currentRev: target?.rev ?? null,
          viewingRev: target?.rev ?? null,
        }));
        return target?.rev ?? null;
      },
      currentPrompt: () => {
        const { versions, currentRev, seedPrompt } = get();
        const cur = versions.find((v) => v.rev === currentRev);
        return cur?.prompt ?? seedPrompt;
      },
    }),
    {
      name: "pe-engine",
      partialize: (s) => ({
        settings: s.settings,
        goal: s.goal,
        seedPrompt: s.seedPrompt,
        versions: s.versions,
        currentRev: s.currentRev,
        iterations: s.iterations.slice(-24),
      }),
    },
  ),
);
