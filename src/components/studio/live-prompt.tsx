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
}: {
  baseline: string;
  value: string;
  onChange?: (next: string) => void;
  fromLabel: string;
  toLabel: string;
  editable: boolean;
}) {
  const ops = useMemo(() => diffLines(baseline, value), [baseline, value]);
  const marks = useMemo(() => lineMarks(baseline, value), [baseline, value]);
  const lines = value.split("\n");
  const removed = ops.filter((o) => o.type === "del" && o.text !== "");
  const added = ops.filter((o) => o.type === "add" && o.text !== "").length;
  const dirty = baseline !== value;
  const preRef = useRef<HTMLPreElement>(null);

  function syncScroll(top: number) {
    if (preRef.current) preRef.current.scrollTop = top;
  }

  return (
    <div>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Live diff {fromLabel} → {toLabel}
        {dirty ? <Badge variant="outline">unsaved</Badge> : null}
        {added ? <Badge variant="ok">+{added}</Badge> : null}
        {removed.length ? <Badge variant="child">−{removed.length}</Badge> : null}
        <span className="ml-auto normal-case tracking-normal">
          <span className="text-ok">green added</span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="text-destructive">red removed</span>
        </span>
      </p>
      {removed.length ? (
        <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-3 font-mono text-[13px] leading-relaxed text-destructive shadow-[var(--shadow-border)]">
          {removed.map((op, i) => (
            <span key={`del-${i}-${op.text.slice(0, 24)}`} className="block">
              − {op.text || " "}
            </span>
          ))}
        </pre>
      ) : null}
      <div className="relative">
        <pre
          ref={preRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-card p-3 font-mono text-[13px] leading-relaxed text-foreground"
        >
          {lines.map((line, i) => (
            <span
              key={`ln-${i}`}
              className={cn("block", marks[i] === "add" && dirty && "bg-ok/15 text-ok")}
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
          className={cn(
            "relative min-h-56 overflow-auto bg-transparent font-mono text-[13px] leading-relaxed caret-foreground",
            editable ? "text-transparent" : "text-transparent",
          )}
        />
      </div>
    </div>
  );
}
