import { useEffect, useRef, useState } from "react";
import { Menu, Square, Swords, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { probeConnection } from "@/lib/connect";
import { runEngine, type EngineEvent } from "@/lib/engine";
import { useEngineStore } from "@/lib/store";
import { PromptPanel } from "./prompt-panel";
import { RunPanel } from "./run-panel";
import { Sidebar } from "./sidebar";

export function AppShell() {
  const [ready, setReady] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const api = useEngineStore.persist;
    const boot = async () => {
      try {
        if (api?.rehydrate && !api.hasHydrated?.()) await Promise.resolve(api.rehydrate());
      } catch {
        /* seed is fine */
      }
      setReady(true);
      if (useEngineStore.getState().settings.apiUrl.trim()) void probeConnection();
    };
    void boot();
  }, []);

  async function onStart() {
    const state = useEngineStore.getState();
    if (state.status === "running") return;
    if (!state.goal.trim()) {
      toast.error("Describe the behavior you want first.");
      return;
    }
    if (!state.settings.apiUrl.trim()) {
      toast.error("Enter an OpenAI-compatible API address.");
      return;
    }
    const conn = state.connection;
    if (!conn.ok || !conn.models.length) {
      toast.error("Connect the API first — enter the address and refresh.");
      return;
    }
    if (!state.settings.parentModel || !state.settings.childModel) {
      toast.error("Pick a parent and a child model.");
      return;
    }
    const ids = new Set(conn.models.map((m) => m.id));
    if (!ids.has(state.settings.parentModel) || !ids.has(state.settings.childModel)) {
      toast.error("Selected models are not on this API. Refresh and pick again.");
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    useEngineStore.setState({
      status: "running",
      phase: "Starting…",
      liveChild: "",
      liveParent: "",
      error: null,
    });

    let liveChild = "";
    await runEngine({
      goal: state.goal,
      seedPrompt: state.seedPrompt,
      versions: useEngineStore.getState().versions,
      currentRev: useEngineStore.getState().currentRev,
      settings: useEngineStore.getState().settings,
      signal: ac.signal,
      onEvent: (event: EngineEvent) => {
        const store = useEngineStore.getState();
        switch (event.type) {
          case "phase":
            liveChild = "";
            store.setRun({ phase: event.phase, liveChild: "", liveParent: "" });
            break;
          case "parent-delta":
            if (!event.text) {
              store.setRun({ liveParent: "" });
            } else {
              store.setRun({
                liveParent: (useEngineStore.getState().liveParent || "") + event.text,
              });
            }
            break;
          case "child-delta":
            if (!event.text) {
              liveChild = "";
              store.setRun({ liveChild: "" });
            } else {
              liveChild += event.text;
              store.setRun({ liveChild });
            }
            break;
          case "version":
            store.addVersion(event.version);
            break;
          case "version-update":
            store.updateVersion(event.rev, event.patch);
            break;
          case "iteration":
            store.addIteration(event.record);
            break;
          case "done":
            store.setRun({
              status:
                event.reason === "pass"
                  ? "passed"
                  : event.reason === "stop"
                    ? "stopped"
                    : event.reason === "error"
                      ? "failed"
                      : "idle",
              phase: event.message ?? "",
              error: event.reason === "error" ? event.message ?? "Failed" : null,
            });
            if (event.reason === "pass") toast.success(event.message ?? "Target reached");
            if (event.reason === "error") toast.error(event.message ?? "Engine failed");
            break;
        }
      },
    });
  }

  function onStop() {
    useEngineStore.getState().setRun({ status: "stopping", phase: "Stopping…" });
    abortRef.current?.abort();
  }

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        <p className="font-display text-2xl italic">Prompt Engineerer</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="relative flex h-dvh overflow-hidden bg-background paper text-foreground">
        <aside className="hidden w-[min(20rem,32vw)] shrink-0 border-r border-border md:block">
          <Sidebar />
        </aside>

        {navOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-background/70"
              aria-label="Close settings"
              onClick={() => setNavOpen(false)}
            />
            <div className="relative h-full w-[min(20rem,88vw)] border-r border-border bg-card paper shadow-[var(--shadow-border)]">
              <div className="absolute right-2 top-2 z-10">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  onClick={() => setNavOpen(false)}
                >
                  <X />
                </Button>
              </div>
              <Sidebar onNavigate={() => setNavOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open settings"
              onClick={() => setNavOpen(true)}
            >
              <Menu />
            </Button>
            <span className="font-display text-lg italic">Engineerer</span>
            <div className="ml-auto flex items-center gap-1">
              <MobileRun onStart={() => void onStart()} onStop={onStop} />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <PromptPanel />
            <RunPanel onStart={() => void onStart()} onStop={onStop} />
          </div>
        </div>
      </div>
      <ThemeToaster />
    </TooltipProvider>
  );
}

function MobileRun({ onStart, onStop }: { onStart: () => void; onStop: () => void }) {
  const status = useEngineStore((s) => s.status);
  if (status === "running" || status === "stopping") {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={onStop}>
        <Square className="size-3 fill-current" />
        Stop
      </Button>
    );
  }
  return (
    <Button type="button" size="sm" onClick={onStart}>
      <Swords className="size-3.5" />
      Engineer
    </Button>
  );
}

function ThemeToaster() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document === "undefined"
      ? "dark"
      : document.documentElement.dataset.theme === "light"
        ? "light"
        : "dark",
  );
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset.theme === "light" ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return (
    <Toaster
      theme={theme}
      position="top-center"
      toastOptions={{
        className: "bg-popover text-popover-foreground shadow-[var(--shadow-border)] border-0",
      }}
    />
  );
}
