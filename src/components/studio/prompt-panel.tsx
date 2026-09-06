import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { ArrowLeft, Copy, Download, RotateCcw, Save, ScrollText, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { diffLines } from "@/lib/diff";
import { copyText, downloadText, versionsMarkdown } from "@/lib/export-prompts";
import { PARENT_PROMPT_CATALOG, type ParentPromptKey } from "@/lib/parent-protocol";
import { useEngineStore } from "@/lib/store";
import type { IterationRecord, PromptVersion } from "@/lib/types";
import { cn } from "@/lib/utils";

function scoreForRev(rev: number, version: PromptVersion | undefined, iterations: IterationRecord[]): number | null {
  if (version?.score != null) return version.score;
  const hits = iterations.filter((it) => it.rev === rev && it.score != null);
  return hits.at(-1)?.score ?? null;
}

export function PromptPanel() {
  const [pane, setPane] = useState<"child" | "parent">("child");
  const goal = useEngineStore((s) => s.goal);
  const seedPrompt = useEngineStore((s) => s.seedPrompt);
  const versions = useEngineStore((s) => s.versions);
  const iterations = useEngineStore((s) => s.iterations);
  const currentRev = useEngineStore((s) => s.currentRev);
  const viewingRev = useEngineStore((s) => s.viewingRev);
  const status = useEngineStore((s) => s.status);
  const setGoal = useEngineStore((s) => s.setGoal);
  const setSeedPrompt = useEngineStore((s) => s.setSeedPrompt);
  const setViewingRev = useEngineStore((s) => s.setViewingRev);
  const restoreRev = useEngineStore((s) => s.restoreRev);
  const abandonCurrent = useEngineStore((s) => s.abandonCurrent);
  const chipScroller = useRef<HTMLDivElement>(null);
  const activeChip = useRef<HTMLButtonElement>(null);

  const running = status === "running" || status === "stopping";
  const viewed =
    versions.find((v) => v.rev === viewingRev) ??
    versions.find((v) => v.rev === currentRev) ??
    null;
  const viewedScore = viewed ? scoreForRev(viewed.rev, viewed, iterations) : null;
  const baseline = versions.reduce<PromptVersion | null>(
    (best, v) => (best == null || v.rev < best.rev ? v : best),
    null,
  );
  const promptValue = viewed ? viewed.prompt : seedPrompt;
  const canEditSeed = !running && versions.length === 0;
  const showDiff =
    Boolean(viewed && baseline && viewed.rev !== baseline.rev && viewed.prompt !== baseline.prompt);

  useEffect(() => {
    activeChip.current?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [viewingRev, currentRev, versions.length]);

  if (pane === "parent") {
    return <ParentPromptsPane onBack={() => setPane("child")} running={running} />;
  }

  return (
    <div className="flex min-h-[32rem] min-w-0 flex-1 flex-col lg:min-h-0">
      <header className="border-b border-border px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            What you want
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setPane("parent")}
            title="Edit the Parent LLM system prompts"
          >
            <ScrollText className="size-3.5" />
            Parent prompts
          </Button>
        </div>
        <div className="relative mt-2">
          <Textarea
            value={goal}
            disabled={running}
            onChange={(e) => setGoal(e.target.value)}
            aria-label="Desired behavior"
            className={cn("min-h-28 bg-card", !goal.trim() && "caret-foreground text-transparent")}
          />
          {!goal.trim() ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-3">
              <p className="font-display text-lg italic leading-tight text-foreground">Ready to forge</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Describe the behavior you want. Parent drafts a system prompt, throws scenarios at
                Child — including extra turns — then scores the result and iterates.
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2 md:px-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          System prompt
        </p>
        {currentRev != null ? (
          <Badge variant="outline">rev {currentRev}</Badge>
        ) : (
          <Badge variant="outline">seed</Badge>
        )}
        {viewedScore != null ? (
          <Badge variant={viewedScore >= 8 ? "ok" : "outline"}>{viewedScore}/10</Badge>
        ) : viewed ? (
          <Badge variant="outline">unscored</Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!promptValue.trim()}
            onClick={async () => {
              const ok = await copyText(promptValue);
              if (ok) toast.success("Copied this revision");
              else toast.error("Could not copy");
            }}
            title="Copy this system prompt"
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!versions.length && !promptValue.trim()}
            onClick={() => {
              const body = versions.length
                ? versionsMarkdown(versions)
                : `# Seed\n\n${promptValue || "(empty)"}\n`;
              downloadText("prompt-engineerer-revs.md", body);
            }}
            title="Download all revisions as Markdown"
          >
            <Download className="size-3.5" />
            Download
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={running || viewingRev == null}
            onClick={() => viewingRev != null && restoreRev(viewingRev)}
            title="Restore this revision as current"
          >
            <RotateCcw className="size-3.5" />
            Restore
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={running || currentRev == null}
            onClick={() => abandonCurrent()}
            title="Abandon the current revision"
          >
            <Undo2 className="size-3.5" />
            Abandon
          </Button>
        </div>
      </div>

      {versions.length > 0 ? (
        <div className="min-w-0 border-b border-border">
          <div
            ref={chipScroller}
            className="chip-scroll flex flex-nowrap gap-1.5 overflow-x-auto overflow-y-visible overscroll-x-contain px-4 py-2 md:px-5"
            aria-label="Prompt revisions"
          >
            {versions.map((v) => (
              <VersionChip
                key={v.rev}
                version={v}
                score={scoreForRev(v.rev, v, iterations)}
                judging={iterations.some((it) => it.rev === v.rev && it.action === "judging")}
                active={v.rev === (viewingRev ?? currentRev)}
                current={v.rev === currentRev}
                innerRef={v.rev === (viewingRev ?? currentRev) ? activeChip : undefined}
                onClick={() => setViewingRev(v.rev)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-3 md:px-5">
          {canEditSeed ? (
            <Textarea
              value={promptValue}
              onChange={(e) => setSeedPrompt(e.target.value)}
              aria-label="System prompt under test"
              placeholder="Leave blank and Parent will draft the first system prompt."
              className="min-h-56 font-mono text-[13px] leading-relaxed bg-card"
            />
          ) : showDiff && viewed && baseline ? (
            <PromptDiff before={baseline.prompt} after={viewed.prompt} fromRev={baseline.rev} toRev={viewed.rev} />
          ) : (
            <pre className="min-h-56 whitespace-pre-wrap rounded-md bg-card p-3 font-mono text-[13px] leading-relaxed text-foreground shadow-[var(--shadow-border)]">
              {promptValue || "Leave blank and Parent will draft the first system prompt."}
            </pre>
          )}
          {viewed?.rationale ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{viewed.rationale}</p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Parent owns this prompt once a run starts. Restore or abandon any revision from the
              timeline — Parent sees every full prompt and its score.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function PromptDiff({
  before,
  after,
  fromRev,
  toRev,
}: {
  before: string;
  after: string;
  fromRev: number;
  toRev: number;
}) {
  const ops = useMemo(() => diffLines(before, after), [before, after]);
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Diff v{fromRev} → v{toRev}
        <span className="ml-2 normal-case tracking-normal">
          <span className="text-ok">green added</span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="text-destructive">red removed</span>
        </span>
      </p>
      <pre className="min-h-56 overflow-x-auto whitespace-pre-wrap rounded-md bg-card p-3 font-mono text-[13px] leading-relaxed shadow-[var(--shadow-border)]">
        {ops.map((op, i) => (
          <span
            key={`${op.type}-${i}-${op.text.slice(0, 24)}`}
            className={cn(
              "block",
              op.type === "add" && "bg-ok/15 text-ok",
              op.type === "del" && "bg-destructive/15 text-destructive",
            )}
          >
            {op.type === "add" ? "+ " : op.type === "del" ? "− " : "  "}
            {op.text || " "}
          </span>
        ))}
      </pre>
    </div>
  );
}

function VersionChip({
  version,
  score,
  judging,
  active,
  current,
  onClick,
  innerRef,
}: {
  version: PromptVersion;
  score: number | null;
  judging: boolean;
  active: boolean;
  current: boolean;
  onClick: () => void;
  innerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {score != null ? (
        <Badge variant={score >= 8 ? "ok" : score <= 4 ? "child" : "outline"}>{score}/10</Badge>
      ) : judging ? (
        <Badge variant="outline">…</Badge>
      ) : (
        <span className="h-[22px] font-mono text-[10px] leading-[22px] text-muted-foreground">—</span>
      )}
      <button
        ref={innerRef}
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-[background-color,box-shadow] duration-[var(--motion-quick)]",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-muted-foreground hover:text-foreground",
          version.status === "abandoned" && !active && "opacity-50 line-through",
        )}
      >
        <span>v{version.rev}</span>
        {version.status === "champion" ? <span>best</span> : null}
        {current && !active ? <span className="size-1.5 rounded-full bg-hot" /> : null}
      </button>
    </div>
  );
}

function ParentPromptsPane({ onBack, running }: { onBack: () => void; running: boolean }) {
  const saved = useEngineStore((s) => s.parentPrompts);
  const setParentPrompt = useEngineStore((s) => s.setParentPrompt);
  const restoreParentPrompt = useEngineStore((s) => s.restoreParentPrompt);
  const [tab, setTab] = useState<ParentPromptKey>("draft");
  const [drafts, setDrafts] = useState<Record<ParentPromptKey, string>>({ ...saved });

  useEffect(() => {
    setDrafts({ ...saved });
  }, [saved]);

  const meta = PARENT_PROMPT_CATALOG.find((c) => c.key === tab)!;
  const dirty = drafts[tab] !== saved[tab];

  return (
    <div className="flex min-h-[32rem] min-w-0 flex-1 flex-col lg:min-h-0">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3 md:px-5">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
          Back
        </Button>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Parent system prompts
        </p>
      </header>
      <div className="min-w-0 border-b border-border">
        <div className="chip-scroll flex flex-nowrap gap-1.5 overflow-x-auto px-4 py-2 md:px-5" aria-label="Parent prompts">
          {PARENT_PROMPT_CATALOG.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setTab(c.key)}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-full px-3 text-[11px] font-medium",
                tab === c.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 md:px-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{meta.label}</p>
        {dirty ? <Badge variant="outline">unsaved</Badge> : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={running || !dirty}
            onClick={() => {
              setParentPrompt(tab, drafts[tab]);
              toast.success(`Saved ${meta.label}`);
            }}
          >
            <Save className="size-3.5" />
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={running}
            onClick={() => {
              restoreParentPrompt(tab);
              setDrafts((d) => ({ ...d, [tab]: meta.factory }));
              toast.success(`Restored original ${meta.label}`);
            }}
            title="Restore the factory Parent prompt"
          >
            <RotateCcw className="size-3.5" />
            Restore
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-3 md:px-5">
          <Textarea
            value={drafts[tab]}
            disabled={running}
            onChange={(e) => setDrafts((d) => ({ ...d, [tab]: e.target.value }))}
            aria-label={meta.label}
            className="min-h-[28rem] font-mono text-[13px] leading-relaxed bg-card"
          />
          <p className="mt-3 text-xs text-muted-foreground">
            These are the system prompts Parent itself receives. Save applies to the next call.
            Restore puts back the shipped original. A run in progress keeps using the prompt it started with.
          </p>
        </div>
      </ScrollArea>
    </div>
  );
}

