import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Menu, PanelLeft, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { probeConnection } from "@/lib/connect";
import { runEngine, type EngineEvent } from "@/lib/engine";
import { SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_RAIL, clampSidebarWidth, shouldCollapseSidebar, suggestSidebarWidth } from "@/lib/sidebar";
import { useEngineStore } from "@/lib/store";
import { PromptPanel } from "./prompt-panel";
import { LivePane, RunToolbar, StatsBar } from "./run-panel";
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
      liveParent: "",
      liveLines: [],
      error: null,
    });

    await runEngine({
      goal: state.goal,
      seedPrompt: state.seedPrompt,
      versions: useEngineStore.getState().versions,
      currentRev: useEngineStore.getState().currentRev,
      settings: useEngineStore.getState().settings,
      parentSystem: useEngineStore.getState().parentPrompts.draft,
      parentFollowupSystem: useEngineStore.getState().parentPrompts.followup,
      getLivePrompt: () => useEngineStore.getState().currentPrompt(),
      signal: ac.signal,
      onEvent: (event: EngineEvent) => {
        const store = useEngineStore.getState();
        switch (event.type) {
          case "phase":
            store.setRun({ phase: event.phase, liveParent: "" });
            if (/^Parent judging/i.test(event.phase) || /^Scenario /i.test(event.phase)) {
              const rev = useEngineStore.getState().currentRev;
              if (rev != null) store.setViewingRev(rev);
            }
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
          case "live":
            store.applyLive(event.event);
            break;
          case "version":
            store.addVersion(event.version);
            break;
          case "version-update":
            store.updateVersion(event.rev, event.patch);
            break;
          case "iteration":
            store.addIteration(event.record);
            if (event.record.rev && event.record.score != null) {
              store.updateVersion(event.record.rev, {
                score: event.record.score,
                status: event.record.action === "pass" ? "champion" : "tested",
              });
            }
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
        <DesktopSidebar />

        {navOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-background/70"
              aria-label="Close settings"
              onClick={() => setNavOpen(false)}
            />
            <MobileDrawer onClose={() => setNavOpen(false)} />
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
          </div>
          {/*
            3-pane  xl+      (≥1280): sidebar | goal/prompt | bout
            2-pane  md–xl    (768–1279): sidebar | stacked studio
            1-pane  <md      (<768): hamburger + stacked studio
          */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <RunToolbar onStart={() => void onStart()} onStop={onStop} />
              <StatsBar />
              <PromptPanel />
            </div>
            <LivePane />
          </div>
        </div>
      </div>
      <ThemeToaster />
    </TooltipProvider>
  );
}

function useSidebarWidth() {
  const width = useEngineStore((s) => s.settings.sidebarWidth);
  const auto = useEngineStore((s) => s.settings.sidebarAuto);
  const apiUrl = useEngineStore((s) => s.settings.apiUrl);
  const models = useEngineStore((s) => s.connection.models);
  const setSettings = useEngineStore((s) => s.setSettings);

  useEffect(() => {
    if (!auto) return;
    const next = suggestSidebarWidth([apiUrl, ...models.map((m) => m.id)]);
    if (next !== width) setSettings({ sidebarWidth: next });
  }, [auto, apiUrl, models, setSettings, width]);

  return { width, setSettings, apiUrl, models };
}

function DesktopSidebar() {
  const { width, setSettings, apiUrl, models } = useSidebarWidth();
  const collapsed = useEngineStore((s) => s.settings.sidebarCollapsed);
  const [dragging, setDragging] = useState(false);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  const liveRef = useRef<number | null>(null);
  const collapseRef = useRef(false);
  const displayWidth = collapsed ? SIDEBAR_RAIL : (liveWidth ?? width);

  useEffect(() => {
    document.documentElement.classList.toggle("is-sidebar-resizing", dragging);
    if (!dragging) return;
    const block = (event: Event) => event.preventDefault();
    document.addEventListener("selectstart", block);
    document.addEventListener("dragstart", block);
    return () => {
      document.documentElement.classList.remove("is-sidebar-resizing");
      document.removeEventListener("selectstart", block);
      document.removeEventListener("dragstart", block);
    };
  }, [dragging]);

  function expand() {
    setSettings({ sidebarCollapsed: false });
  }

  function fit() {
    setSettings({
      sidebarWidth: suggestSidebarWidth([apiUrl, ...models.map((m) => m.id)]),
      sidebarAuto: true,
      sidebarCollapsed: false,
    });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startW: collapsed ? SIDEBAR_RAIL : displayWidth };
    liveRef.current = collapsed ? SIDEBAR_RAIL : displayWidth;
    collapseRef.current = collapsed;
    document.documentElement.classList.add("is-sidebar-resizing");
    window.getSelection()?.removeAllRanges();
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const session = drag.current;
    if (!session) return;
    const raw = session.startW + event.clientX - session.startX;
    collapseRef.current = shouldCollapseSidebar(raw);
    const next = collapseRef.current ? SIDEBAR_RAIL : clampSidebarWidth(raw);
    liveRef.current = next;
    setLiveWidth(next);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const next = liveRef.current;
    const snapShut = collapseRef.current;
    drag.current = null;
    liveRef.current = null;
    collapseRef.current = false;
    setDragging(false);
    setLiveWidth(null);
    if (snapShut) {
      setSettings({ sidebarCollapsed: true, sidebarAuto: false });
    } else if (next != null) {
      setSettings({
        sidebarCollapsed: false,
        sidebarAuto: false,
        sidebarWidth: clampSidebarWidth(next),
      });
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (width <= SIDEBAR_MIN) setSettings({ sidebarCollapsed: true, sidebarAuto: false });
      else setSettings({ sidebarWidth: clampSidebarWidth(width - 16), sidebarAuto: false });
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (collapsed) expand();
      else setSettings({ sidebarWidth: clampSidebarWidth(width + 16), sidebarAuto: false });
    } else if (event.key === "Home" || event.key === "Enter") {
      event.preventDefault();
      fit();
    }
  }

  if (collapsed && !dragging) {
    return (
      <aside className="relative hidden w-11 shrink-0 flex-col items-center border-r border-border md:flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-3"
          aria-label="Expand settings"
          onClick={expand}
        >
          <PanelLeft className="size-4" />
        </Button>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Expand sidebar"
          tabIndex={0}
          className="sidebar-resizer"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={fit}
          onKeyDown={onKeyDown}
        />
      </aside>
    );
  }

  return (
    <aside
      className="relative hidden shrink-0 overflow-hidden border-r border-border md:block"
      style={{ width: displayWidth }}
    >
      <Sidebar />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={displayWidth}
        tabIndex={0}
        className="sidebar-resizer"
        data-active={dragging ? "true" : "false"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fit}
        onKeyDown={onKeyDown}
      />
    </aside>
  );
}

function MobileDrawer({ onClose }: { onClose: () => void }) {
  const { width } = useSidebarWidth();
  return (
    <div
      className="relative h-full max-w-[92vw] border-r border-border bg-card paper shadow-[var(--shadow-border)]"
      style={{ width }}
    >
      <div className="absolute right-2 top-2 z-10">
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <Sidebar onNavigate={onClose} />
    </div>
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
