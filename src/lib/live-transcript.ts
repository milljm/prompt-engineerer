/**
 * Structured live transcript of a Child test: turn separators, the Parent's
 * user prompt (what it is throwing at Child), then Child's streamed reply.
 */

import { uid } from "./utils.ts";

export type LiveRole = "separator" | "scenario" | "parent" | "child";

export type LiveLine = {
  id: string;
  role: LiveRole;
  text: string;
};

export type LiveEvent =
  | { type: "clear" }
  | { type: "scenario"; name: string; index: number; of: number }
  | { type: "separator"; scenario: string; turn: number; of: number }
  | { type: "parent"; text: string }
  | { type: "child-start" }
  | { type: "child-delta"; text: string };

/**
 * Banner when a new scenario starts (so turn 1 after turn N is not a reset).
 *
 * @param name - Scenario name.
 * @param index - 1-based scenario index.
 * @param of - Total scenarios this Child pass (judgement after the last).
 */
export function scenarioLabel(name: string, index: number, of: number): string {
  const n = name.trim() || "Scenario";
  if (of <= 1) return `Scenario · ${n}`;
  const rest = of - index;
  const tail =
    rest > 0 ? ` · ${rest} more before judgement` : " · last one, then judgement";
  return `Scenario ${index} of ${of} · ${n}${tail}`;
}

/**
 * Label for a turn rule in the live pane.
 *
 * @param _scenario - Unused; scenario is shown on its own banner.
 * @param turn - 1-based turn index.
 * @param of - Planned turns in this scenario.
 */
export function turnLabel(_scenario: string, turn: number, of: number): string {
  return of > 1 ? `Turn ${turn} of ${of}` : `Turn ${turn}`;
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
    case "scenario":
      return [
        ...lines,
        { id: nextId(), role: "scenario", text: scenarioLabel(event.name, event.index, event.of) },
      ];
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
