import { RotateCcw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useEngineStore } from "@/lib/store";
import type { PromptVersion } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PromptPanel() {
  const goal = useEngineStore((s) => s.goal);
  const seedPrompt = useEngineStore((s) => s.seedPrompt);
  const versions = useEngineStore((s) => s.versions);
  const currentRev = useEngineStore((s) => s.currentRev);
  const viewingRev = useEngineStore((s) => s.viewingRev);
  const status = useEngineStore((s) => s.status);
  const setGoal = useEngineStore((s) => s.setGoal);
  const setSeedPrompt = useEngineStore((s) => s.setSeedPrompt);
  const setViewingRev = useEngineStore((s) => s.setViewingRev);
  const restoreRev = useEngineStore((s) => s.restoreRev);
  const abandonCurrent = useEngineStore((s) => s.abandonCurrent);

  const running = status === "running" || status === "stopping";
  const viewed =
    versions.find((v) => v.rev === viewingRev) ??
    versions.find((v) => v.rev === currentRev) ??
    null;
  const promptValue = viewed ? viewed.prompt : seedPrompt;
  const canEditSeed = !running && versions.length === 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="border-b border-border px-4 py-3 md:px-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          What you want
        </p>
        <Textarea
          value={goal}
          disabled={running}
          onChange={(e) => setGoal(e.target.value)}
          aria-label="Desired behavior"
          className="mt-2 min-h-28 bg-card"
        />
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
        <div className="ml-auto flex items-center gap-1">
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
        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2 md:px-5">
          {versions.map((v) => (
            <VersionChip
              key={v.rev}
              version={v}
              active={v.rev === (viewingRev ?? currentRev)}
              current={v.rev === currentRev}
              onClick={() => setViewingRev(v.rev)}
            />
          ))}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-3 md:px-5">
          <Textarea
            value={promptValue}
            disabled={running || !canEditSeed}
            onChange={(e) => {
              if (canEditSeed) setSeedPrompt(e.target.value);
            }}
            aria-label="System prompt under test"
            placeholder="Leave blank and Parent will draft the first system prompt."
            className="min-h-56 font-mono text-[13px] leading-relaxed bg-card"
          />
          {viewed?.rationale ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{viewed.rationale}</p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Parent owns this prompt once a run starts. Restore or abandon any revision from the
              timeline — Parent sees that history too.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function VersionChip({
  version,
  active,
  current,
  onClick,
}: {
  version: PromptVersion;
  active: boolean;
  current: boolean;
  onClick: () => void;
}) {
  const score = version.score;
  return (
    <button
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
      {score != null ? (
        <span className={cn("tabular-nums", active ? "opacity-80" : "text-foreground")}>
          {score}/10
        </span>
      ) : null}
      {version.status === "champion" ? <span>best</span> : null}
      {current && !active ? <span className="size-1.5 rounded-full bg-hot" /> : null}
    </button>
  );
}
