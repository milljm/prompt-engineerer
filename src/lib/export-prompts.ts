/** Copy / download helpers for system-prompt versions. */

import type { PromptVersion } from "./types.ts";

export function versionsMarkdown(versions: PromptVersion[]): string {
  if (!versions.length) return "# Prompt Engineerer\n\n(no revisions yet)\n";
  const ordered = [...versions].sort((a, b) => a.rev - b.rev);
  const blocks = ordered.map((v) => {
    const score = v.score == null ? "unscored" : `${v.score}/10`;
    return `## v${v.rev} · ${v.status} · ${score}\n\n${v.prompt.trim() || "(empty)"}\n`;
  });
  return `# Prompt Engineerer revisions\n\n${blocks.join("\n---\n\n")}`;
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
