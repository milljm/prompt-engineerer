/**
 * Structured live transcript of a Child test: turn separators, the Parent's
 * user prompt (what it is throwing at Child), then Child's streamed reply.
 */

import { uid } from "./utils.ts";

export type LiveRole = "separator" | "parent" | "child";

export type LiveLine = {
  id: string;
  role: LiveRole;
  text: string;
};

export type LiveEvent =
  | { type: "clear" }
  | { type: "separator"; scenario: string; turn: number; of: number }
  | { type: "parent"; text: string }
  | { type: "child-start" }
  | { type: "child-delta"; text: string };

/**
 * Label for a turn rule in the live pane.
 *
 * @param scenario - Scenario name from Parent.
 * @param turn - 1-based turn index.
 * @param of - Planned turns in this scenario.
 */
export function turnLabel(scenario: string, turn: number, of: number): string {
  const name = scenario.trim() || "Scenario";
  return of > 1 ? `Turn ${turn} of ${of} · ${name}` : `Turn ${turn} · ${name}`;
}

/**
 * Apply a live-transcript event. Child deltas append to the last Child line.
 *
 * @param lines - Current transcript.
 * @param event - Engine live event.
 * @param nextId - Id factory (inject in tests).
 */
export function applyLiveEvent(
  lines: LiveLine[],
  event: LiveEvent,
  nextId: () => string = () => uid("live"),
): LiveLine[] {
  switch (event.type) {
    case "clear":
      return [];
    case "separator":
      return [...lines, { id: nextId(), role: "separator", text: turnLabel(event.scenario, event.turn, event.of) }];
    case "parent":
      return [...lines, { id: nextId(), role: "parent", text: event.text }];
    case "child-start":
      return [...lines, { id: nextId(), role: "child", text: "" }];
    case "child-delta": {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].role === "child") {
          const next = lines.slice();
          next[i] = { ...lines[i], text: lines[i].text + event.text };
          return next;
        }
      }
      return [...lines, { id: nextId(), role: "child", text: event.text }];
    }
    default:
      return lines;
  }
}
