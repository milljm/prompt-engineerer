import { useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { diffLines, lineMarks } from "@/lib/diff";
import { cn } from "@/lib/utils";

/**
 * Editable system prompt that paints a live line-diff against a baseline.
 * Deleted lines sit above the textarea (red); the textarea itself is
 * overlayed so added lines glow green as you type.
 */
export function LivePromptEditor({
  baseline,
  value,
  onChange,
  fromLabel,
  toLabel,
  editable,
  unsaved = false,
}: {
  baseline: string;
  value: string;
  onChange?: (next: string) => void;
  fromLabel: string;
  toLabel: string;
  editable: boolean;
  unsaved?: boolean;
}) {
  const ops = useMemo(() => diffLines(baseline, value), [baseline, value]);
  const marks = useMemo(() => lineMarks(baseline, value), [baseline, value]);
  const lines = value.split("\n");
  const removed = ops.filter((o) => o.type === "del" && o.text !== "");
  const added = ops.filter((o) => o.type === "add" && o.text !== "").length;
  const changed = baseline !== value;
  const preRef = useRef<HTMLPreElement>(null);

  function syncScroll(top: number) {
    if (preRef.current) preRef.current.scrollTop = top;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-2 flex shrink-0 flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Live diff {fromLabel} → {toLabel}
        {unsaved ? <Badge variant="outline">unsaved</Badge> : null}
        {added ? <Badge variant="ok">+{added}</Badge> : null}
        {removed.length ? <Badge variant="child">−{removed.length}</Badge> : null}
        <span className="ml-auto normal-case tracking-normal">
          <span className="text-ok">green added</span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="text-destructive">red removed</span>
        </span>
      </p>
      {removed.length ? (
        <pre className="mb-2 max-h-32 shrink-0 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-3 font-mono text-[13px] leading-relaxed text-destructive shadow-[var(--shadow-border)]">
          {removed.map((op, i) => (
            <span key={`del-${i}-${op.text.slice(0, 24)}`} className="block">
              − {op.text || " "}
            </span>
          ))}
        </pre>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <pre
          ref={preRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-card p-3 font-mono text-[13px] leading-relaxed text-foreground"
        >
          {lines.map((line, i) => (
            <span
              key={`ln-${i}`}
              className={cn("block", marks[i] === "add" && changed && "bg-ok/15 text-ok")}
            >
              {line || " "}
            </span>
          ))}
        </pre>
        <Textarea
          value={value}
          readOnly={!editable}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={(e) => syncScroll(e.currentTarget.scrollTop)}
          aria-label="System prompt under test"
          spellCheck={false}
          className="absolute inset-0 h-full min-h-0 resize-none overflow-auto bg-transparent font-mono text-[13px] leading-relaxed text-transparent caret-foreground"
        />
      </div>
    </div>
  );
}
