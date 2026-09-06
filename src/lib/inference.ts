/**
 * Chat completions against any OpenAI-compatible `/v1` server.
 *
 * Loopback and LAN URLs are fetched from the browser. Public hosts go through
 * `/api/openai/*` so CORS and API keys stay off the page origin.
 */

import { overTokenCap } from "./child-cap.ts";
import { apiUrlIsSelf, isBrowserDirectUrl, isPrivateHostError, normalizeApiBase, openaiHeaders } from "./openai-url.ts";
import type { ChatMessage, ModelRec } from "./types.ts";

export type ChatResult = {
  text: string;
  reasoning?: string;
  usage?: { prompt: number; completion: number };
  killed?: boolean;
};

export type ChatRequest = {
  apiUrl: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
};

function sseChunks(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const events: string[] = [];
  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    events.push(trimmed.slice(5).trim());
  }
  return { events, rest };
}

type DeltaPayload = {
  choices?: {
    delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown };
    message?: { content?: unknown };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function readDelta(payload: DeltaPayload): { content: string; reasoning: string } {
  const delta = payload.choices?.[0]?.delta;
  const content = typeof delta?.content === "string" ? delta.content : "";
  const reasoning =
    (typeof delta?.reasoning_content === "string" ? delta.reasoning_content : "") ||
    (typeof delta?.reasoning === "string" ? delta.reasoning : "");
  return { content, reasoning };
}

function contentFromMessage(payload: DeltaPayload): string {
  const content = payload.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function overCap(text: string, usage: ChatResult["usage"], maxTokens?: number): boolean {
  return overTokenCap(text, usage, maxTokens);
}
