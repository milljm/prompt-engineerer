import { useEffect, useRef } from "react";
import { Eraser, Square, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isPinnedToBottom, pinToBottom } from "@/lib/scroll";
import { useEngineStore } from "@/lib/store";
import type { IterationRecord } from "@/lib/types";
import { cn, formatMs } from "@/lib/utils";

export function RunPanel({
  onStart,
  onStop,
}: {
  onStart: () => void;
  onStop: () => void;
}) {
  const status = useEngineStore((s) => s.status);
  const phase = useEngineStore((s) => s.phase);
  const liveChild = useEngineStore((s) => s.liveChild);
  const error = useEngineStore((s) => s.error);
  const iterations = useEngineStore((s) => s.iterations);
  const settings = useEngineStore((s) => s.settings);
  const goal = useEngineStore((s) => s.goal);
  const resetRun = useEngineStore((s) => s.resetRun);
  const parentModel = settings.parentModel;
  const childModel = settings.childModel;

  const running = status === "running";
  const stopping = status === "stopping";
  const canStart = !running && !stopping && goal.trim().length > 8 && parentModel && childModel;

  const last = iterations.at(-1);
  const best = iterations.reduce<number | null>((acc, it) => {
    if (it.score == null) return acc;
    return acc == null ? it.score : Math.max(acc, it.score);
  }, null);
  const avgMs =
    iterations.length > 0
      ? iterations.reduce((a, it) => a + it.ms, 0) / iterations.length
      : 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-border lg:border-l lg:border-t-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 md:px-5">
        {running || stopping ? (
          <Button type="button" variant="destructive" onClick={onStop} className="h-10">
            <Square className="size-3.5 fill-current" />
            {stopping ? "Stopping" : "Stop"}
          </Button>
        ) : (
          <Button type="button" onClick={onStart} disabled={!canStart} className="h-10">
            <Swords className="size-4" />
            Engineer
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={running || stopping}
          onClick={() => resetRun()}
          title="Clear versions and iteration log"
        >
          <Eraser className="size-3.5" />
          New run
        </Button>
        <div className="min-w-0 flex-1">
          {running || stopping ? (
            <p className="shimmer-text truncate text-sm">{phase || "Working…"}</p>
          ) : status === "passed" ? (
            <p className="truncate text-sm text-ok">Quality target reached.</p>
          ) : status === "failed" ? (
            <p className="truncate text-sm text-destructive">{error ?? "Failed"}</p>
          ) : status === "stopped" ? (
            <p className="truncate text-sm text-muted-foreground">Stopped.</p>
          ) : (
            <p className="truncate text-sm text-muted-foreground">
              Parent writes. Child is thrown a scenario. Repeat until {settings.targetScore}/10.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
        <Stat label="Iteration" value={iterations.length ? `${iterations.length}` : "—"} />
        <Stat label="Last score" value={last?.score != null ? `${last.score}/10` : "—"} />
        <Stat label="Best" value={best != null ? `${best}/10` : "—"} />
        <Stat label="Avg loop" value={iterations.length ? formatMs(avgMs) : "—"} />
      </div>

      {iterations.length > 1 ? <ScoreStrip iterations={iterations} target={settings.targetScore} /> : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-4 py-4 md:px-5">
          {running && liveChild ? <LiveChild text={liveChild} /> : null}

          {!iterations.length && !running ? (
            <EmptyHint />
          ) : (
            [...iterations].reverse().map((it) => <IterationCard key={it.id} record={it} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function LiveChild({ text }: { text: string }) {
  const scroller = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !pinned.current) return;
    pinToBottom(el);
  }, [text]);

  return (
    <article className="flex h-72 min-h-0 flex-col overflow-hidden rounded-xl bg-secondary p-3 shadow-[var(--shadow-border)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Child, live
      </p>
      <pre
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (el) pinned.current = isPinnedToBottom(el);
        }}
        onWheel={(event) => {
          const el = event.currentTarget;
          const atTop = el.scrollTop <= 0 && event.deltaY < 0;
          const atBottom = isPinnedToBottom(el, 1) && event.deltaY > 0;
          if (!atTop && !atBottom) event.stopPropagation();
        }}
        className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground"
      >
        {text}
      </pre>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function ScoreStrip({
  iterations,
  target,
}: {
  iterations: IterationRecord[];
  target: number;
}) {
  return (
    <div className="flex items-end gap-1 border-b border-border px-4 py-2 md:px-5">
      {iterations.map((it) => {
        const score = it.score ?? 0;
        const h = 8 + score * 3;
        const hit = score >= target;
        return (
          <div key={it.id} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {it.score ?? "–"}
            </span>
            <div
              className={cn("w-full max-w-8 rounded-sm", hit ? "bg-ok" : "bg-hot/80")}
              style={{ height: h }}
              title={`iter ${it.iteration}: ${it.score ?? "—"}/10 · ${formatMs(it.ms)}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function IterationCard({ record }: { record: IterationRecord }) {
  const hit = (record.score ?? 0) >= 8 && record.action === "pass";
  return (
    <article className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          iter {record.iteration} · rev {record.rev}
        </p>
        {record.score != null ? (
          <Badge variant={hit ? "ok" : "outline"}>{record.score}/10</Badge>
        ) : null}
        <Badge variant="outline">{record.action}</Badge>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatMs(record.ms)}
        </span>
      </div>
      {record.rationale ? (
        <p className="mt-2 text-sm leading-relaxed text-foreground">{record.rationale}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono tabular-nums">parent {formatMs(record.phaseMs.parent)}</span>
        <span className="font-mono tabular-nums">child {formatMs(record.phaseMs.child)}</span>
        {record.scenarios.map((s) => (
          <span key={s.name}>
            {s.name} · {s.turns.length} turn{s.turns.length === 1 ? "" : "s"}
          </span>
        ))}
      </div>
      {record.scenarios[0]?.turns[0]?.assistant ? (
        <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-secondary p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {record.scenarios[0].turns[0].assistant.slice(0, 600)}
          {record.scenarios[0].turns[0].assistant.length > 600 ? "…" : ""}
        </pre>
      ) : null}
    </article>
  );
}

function EmptyHint() {
  return (
    <div className="rounded-xl bg-card px-4 py-8 text-center shadow-[var(--shadow-border)]">
      <p className="font-display text-xl italic">Ready to forge</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Describe the behavior you want. Parent drafts a system prompt, throws scenarios at Child —
        including extra turns — then scores the result and iterates.
      </p>
    </div>
  );
}
