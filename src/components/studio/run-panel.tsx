import { useEffect, useRef } from "react";
import { Eraser, Square, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isPinnedToBottom, pinToBottom } from "@/lib/scroll";
import { useEngineStore } from "@/lib/store";
import type { LiveLine } from "@/lib/live-transcript";
import type { IterationRecord, ScenarioTurn } from "@/lib/types";
import { cn, formatMs } from "@/lib/utils";
import { Markdown } from "./markdown";

export function RunToolbar({
  onStart,
  onStop,
}: {
  onStart: () => void;
  onStop: () => void;
}) {
  const status = useEngineStore((s) => s.status);
  const phase = useEngineStore((s) => s.phase);
  const error = useEngineStore((s) => s.error);
  const settings = useEngineStore((s) => s.settings);
  const goal = useEngineStore((s) => s.goal);
  const resetRun = useEngineStore((s) => s.resetRun);
  const parentModel = settings.parentModel;
  const childModel = settings.childModel;

  const running = status === "running";
  const stopping = status === "stopping";
  const canStart = !running && !stopping && goal.trim().length > 8 && parentModel && childModel;

  return (
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
          <p className="text-sm text-destructive">{error ?? "Failed"}</p>
        ) : status === "stopped" ? (
          <p className="truncate text-sm text-muted-foreground">Stopped.</p>
        ) : (
          <p className="truncate text-sm text-muted-foreground">
            Parent writes. Child is thrown a scenario. Repeat until {settings.targetScore}/10.
          </p>
        )}
      </div>
    </div>
  );
}

export function StatsBar() {
  const iterations = useEngineStore((s) => s.iterations);
  const target = useEngineStore((s) => s.settings.targetScore);
  const last = iterations.at(-1);
  const best = iterations.reduce<number | null>((acc, it) => {
    if (it.score == null) return acc;
    return acc == null ? it.score : Math.max(acc, it.score);
  }, null);
  const avgMs =
    iterations.length > 0 ? iterations.reduce((a, it) => a + it.ms, 0) / iterations.length : 0;

  return (
    <div className="shrink-0 border-b border-border">
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <Stat label="Iteration" value={iterations.length ? `${iterations.length}` : "—"} />
        <Stat label="Last score" value={last?.score != null ? `${last.score}/10` : "—"} />
        <Stat label="Best" value={best != null ? `${best}/10` : "—"} />
        <Stat label="Avg loop" value={iterations.length ? formatMs(avgMs) : "—"} />
      </div>
      {iterations.length > 0 ? <ScoreStrip iterations={iterations} target={target} /> : null}
    </div>
  );
}

export function LivePane() {
  const status = useEngineStore((s) => s.status);
  const liveLines = useEngineStore((s) => s.liveLines);
  const liveParent = useEngineStore((s) => s.liveParent);
  const iterations = useEngineStore((s) => s.iterations);
  const running = status === "running" || status === "stopping";
  const showLive = liveLines.length > 0;
  const showEmpty = !showLive && !iterations.length && !running;

  return (
    <div className="flex min-h-[22rem] min-w-0 shrink-0 flex-col border-t border-border xl:min-h-0 xl:flex-1 xl:border-l xl:border-t-0">
      {showEmpty ? (
        <EmptyHint />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {showLive ? (
            <div className="flex min-h-72 min-w-0 flex-1 flex-col p-4 xl:min-h-0 md:px-5">
              <LiveTranscript lines={liveLines} />
            </div>
          ) : null}
          {liveParent && (running || status === "failed") ? (
            <div className="shrink-0 px-4 pb-3 md:px-5">
              <LiveParent text={liveParent} />
            </div>
          ) : null}
          {iterations.length ? (
            <ScrollArea className={cn("min-h-0", showLive ? "max-h-[42%] shrink-0" : "flex-1")}>
              <div className="space-y-3 px-4 py-4 md:px-5">
                {[...iterations].reverse().map((it) => (
                  <IterationCard key={it.id} record={it} />
                ))}
              </div>
            </ScrollArea>
          ) : null}
        </div>
      )}
    </div>
  );
}

function LiveTranscript({ lines }: { lines: LiveLine[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !pinned.current) return;
    pinToBottom(el);
  }, [lines]);

  return (
    <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-secondary p-3 shadow-[var(--shadow-border)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Live test
      </p>
      <div
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
        className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {lines.map((line) => (
          <LiveLineView key={line.id} line={line} />
        ))}
      </div>
    </article>
  );
}

function LiveParent({ text }: { text: string }) {
  const scroller = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !pinned.current) return;
    pinToBottom(el);
  }, [text]);

  return (
    <article className="flex max-h-48 min-h-0 flex-col overflow-hidden rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Parent, live
      </p>
      <pre
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (el) pinned.current = isPinnedToBottom(el);
        }}
        className="mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground"
      >
        {text}
      </pre>
    </article>
  );
}

function LiveLineView({ line }: { line: LiveLine }) {
  if (line.role === "scenario") {
    return (
      <div className="my-2 rounded-md bg-accent px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-foreground">
        {line.text}
      </div>
    );
  }
  if (line.role === "separator") {
    return <TurnRule label={line.text} />;
  }
  const isParent = line.role === "parent";
  return (
    <div className="py-1.5">
      <Badge variant={isParent ? "parent" : "child"}>{isParent ? "Parent" : "Child"}</Badge>
      <p className="mt-1 text-sm leading-relaxed text-foreground">
        <Markdown text={line.text || (isParent ? "" : "…")} />
      </p>
    </div>
  );
}

function TurnRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="h-px min-w-4 flex-1 bg-border" />
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="h-px min-w-4 flex-1 bg-border" />
    </div>
  );
}

function TurnDialogue({ turn, index, of }: { turn: ScenarioTurn; index: number; of: number }) {
  return (
    <div>
      <TurnRule label={of > 1 ? `Turn ${index} of ${of}` : `Turn ${index}`} />
      <div className="py-1.5">
        <Badge variant="parent">Parent</Badge>
        <div className="mt-1 text-sm leading-relaxed text-foreground">
          <Markdown text={turn.user} />
        </div>
      </div>
      <div className="py-1.5">
        <Badge variant="child">Child</Badge>
        <div className="mt-1 text-sm leading-relaxed text-foreground">
          <Markdown text={turn.assistant} />
        </div>
      </div>
    </div>
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
    <div className="flex items-end gap-1 px-4 py-2 md:px-5">
      {iterations.map((it) => {
        const pending = it.action === "judging" || it.score == null;
        const score = it.score ?? 0;
        const h = pending ? 10 : 8 + score * 3;
        const hit = !pending && score >= target;
        return (
          <div key={it.id} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {it.score ?? "…"}
            </span>
            <div
              className={cn(
                "w-full max-w-8 rounded-sm",
                pending ? "bg-busy/70" : hit ? "bg-ok" : "bg-hot/80",
              )}
              style={{ height: h }}
              title={`iter ${it.iteration}: ${it.score ?? "judging"}/10 · ${formatMs(it.ms)}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function IterationCard({ record }: { record: IterationRecord }) {
  const judging = record.action === "judging";
  const hit = (record.score ?? 0) >= 8 && record.action === "pass";
  return (
    <article className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          iter {record.iteration} · rev {record.rev}
        </p>
        {record.score != null ? (
          <Badge variant={hit ? "ok" : "outline"}>{record.score}/10</Badge>
        ) : judging ? (
          <Badge variant="outline">judging</Badge>
        ) : null}
        <Badge variant="outline">{record.action}</Badge>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatMs(record.ms)}
        </span>
      </div>
      {record.rationale ? (
        <p className={cn("mt-2 text-sm leading-relaxed", judging ? "shimmer-text" : "text-foreground")}>
          {record.rationale}
        </p>
      ) : null}
      {record.ledger?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {record.ledger.map((row) => (
            <Badge key={row.name} variant={row.verdict === "pass" ? "ok" : "child"}>
              {row.name}: {row.verdict}
            </Badge>
          ))}
        </div>
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
      {record.scenarios.length ? (
        <div className="mt-3 max-h-64 overflow-auto rounded-md bg-secondary px-3 py-1">
          {record.scenarios.map((s) => (
            <div key={s.name} className="py-1">
              {record.scenarios.length > 1 ? (
                <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {s.name}
                </p>
              ) : null}
              {s.turns.map((turn, i) => (
                <TurnDialogue key={`${s.name}-${i}`} turn={turn} index={i + 1} of={s.turns.length} />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function EmptyHint() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
      <div className="max-w-sm text-center">
        <p className="font-display text-xl italic">The bout</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Parent and Child meet here. Parent throws the user turns. Child answers under the system
          prompt. Kills, pokes, and the wrangle play out in this pane.
        </p>
      </div>
    </div>
  );
}
