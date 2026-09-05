/**
 * Line-level LCS diff used to highlight prompt revisions (red deletions,
 * green additions) against the first version.
 */

export type DiffOp = {
  type: "eq" | "add" | "del";
  text: string;
};

/**
 * Diff `before` against `after` as whole lines.
 *
 * @param before - Baseline prompt (typically rev 1).
 * @param after - Currently viewed prompt.
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
