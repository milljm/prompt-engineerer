/**
 * Line-level LCS diff used to highlight prompt revisions (red deletions,
 * green additions) and to brief the Parent LLM with compact unified diffs.
 */

export type DiffOp = {
  type: "eq" | "add" | "del";
  text: string;
};

/**
 * Diff `before` against `after` as whole lines.
 *
 * @param before - Baseline prompt (typically the previous rev).
 * @param after - Currently viewed or drafted prompt.
 */
export function diffLines(before: string, after: string): DiffOp[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "eq", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i += 1;
    } else {
      out.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ type: "del", text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ type: "add", text: b[j] });
    j += 1;
  }
  return out;
}

/**
 * True when the two prompts differ (so the UI should render a diff).
 *
 * @param before - Baseline prompt.
 * @param after - Currently viewed prompt.
 */
export function promptsDiffer(before: string, after: string): boolean {
  return before !== after;
}

/**
 * Mark each line of `after` as equal or added versus `before`.
 * Aligns 1:1 with `after.split("\\n")`.
 */
export function lineMarks(before: string, after: string): Array<"eq" | "add"> {
  const marks: Array<"eq" | "add"> = [];
  for (const op of diffLines(before, after)) {
    if (op.type === "del") continue;
    marks.push(op.type === "add" ? "add" : "eq");
  }
  return marks;
}

/**
 * Compact unified diff with a few lines of context. What we send the Parent
 * instead of reprinting every historical system prompt.
 *
 * @param before - Older prompt.
 * @param after - Newer prompt.
 * @param from - Label for the old side (`v1`).
 * @param to - Label for the new side (`v2`).
 * @param context - Unchanged lines to keep around each hunk.
 */
export function unifiedDiff(
  before: string,
  after: string,
  from = "a",
  to = "b",
  context = 2,
): string {
  const ops = diffLines(before, after);
  if (!ops.some((o) => o.type !== "eq")) return `(no changes ${from} → ${to})`;

  const keep = ops.map((o) => o.type !== "eq");
  for (let i = 0; i < ops.length; i++) {
    if (ops[i]?.type === "eq") continue;
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) {
      keep[k] = true;
    }
  }

  const lines = [`--- ${from}`, `+++ ${to}`];
  let i = 0;
  while (i < ops.length) {
    if (!keep[i]) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < ops.length && keep[i]) i += 1;
    lines.push("@@");
    for (let j = start; j < i; j++) {
      const op = ops[j];
      if (!op) continue;
      const prefix = op.type === "add" ? "+" : op.type === "del" ? "-" : " ";
      lines.push(`${prefix}${op.text}`);
    }
  }
  return lines.join("\n");
}
