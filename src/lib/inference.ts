import type { ChatMessage, ModelRec, ResolvedBackend } from "./types";

export type ChatResult = {
  text: string;
  reasoning?: string;
  usage?: { prompt: number; completion: number };
};

export type ChatRequest = {
  backend: ResolvedBackend;
  edgeUrl: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
};

function normalizeEdgeUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "http://127.0.0.1:8080";
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
}

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

async function readSseStream(
  res: Response,
  signal: AbortSignal | undefined,
  onDelta?: (text: string) => void,
): Promise<ChatResult> {
  if (!res.body) throw new Error("Empty stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let text = "";
  let reasoning = "";
  let usage: ChatResult["usage"];

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException("Aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    const { events, rest } = sseChunks(carry);
    carry = rest;
    for (const payload of events) {
      if (!payload || payload === "[DONE]") continue;
      let chunk: DeltaPayload;
      try {
        chunk = JSON.parse(payload) as DeltaPayload;
      } catch {
        continue;
      }
      const { content, reasoning: think } = readDelta(chunk);
      if (content) {
        text += content;
        onDelta?.(content);
      }
      if (think) reasoning += think;
      if (chunk.usage) {
        usage = {
          prompt: chunk.usage.prompt_tokens ?? 0,
          completion: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
  }
  return { text: text.trim(), reasoning: reasoning.trim() || undefined, usage };
}

async function chatEdge(req: ChatRequest): Promise<ChatResult> {
  const base = normalizeEdgeUrl(req.edgeUrl);
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: req.signal,
    body: JSON.stringify({
      model: req.model,
      stream: true,
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxTokens ?? 1200,
      messages: req.messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err.slice(0, 280) || `Edge HTTP ${res.status}`);
  }
  return readSseStream(res, req.signal, req.onDelta);
}

async function chatXai(req: ChatRequest): Promise<ChatResult> {
  const res = await fetch("/api/xai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: req.signal,
    body: JSON.stringify({
      model: req.model,
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxTokens ?? 1200,
      messages: req.messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err.slice(0, 280) || `xAI HTTP ${res.status}`);
  }
  return readSseStream(res, req.signal, req.onDelta);
}

export async function chat(req: ChatRequest): Promise<ChatResult> {
  if (!req.model) throw new Error("No model selected");
  return req.backend === "edge" ? chatEdge(req) : chatXai(req);
}

export async function stopEdge(edgeUrl: string, model?: string) {
  const base = normalizeEdgeUrl(edgeUrl);
  try {
    await fetch(`${base}/v1/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model ? { model } : {}),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    /* ignore */
  }
}

export async function listEdgeModels(edgeUrl: string): Promise<ModelRec[]> {
  const base = normalizeEdgeUrl(edgeUrl);
  const res = await fetch(`${base}/v1/models`, {
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`Edge HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: {
      id?: string;
      owned_by?: string;
      context_length?: number;
      max_model_len?: number;
    }[];
  };
  const models: ModelRec[] = [];
  for (const row of body.data ?? []) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    models.push({
      id,
      name: id.split("/").filter(Boolean).pop() || id,
      backend: "edge",
      contextLength: row.context_length ?? row.max_model_len,
      ownedBy: row.owned_by,
    });
  }
  return models;
}

export async function listXaiModels(): Promise<ModelRec[]> {
  const res = await fetch("/api/xai/models", { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err.slice(0, 200) || `xAI HTTP ${res.status}`);
  }
  const body = (await res.json()) as { models?: { id: string }[]; error?: string };
  if (body.error) throw new Error(body.error);
  return (body.models ?? []).map((row) => ({
    id: row.id,
    name: row.id,
    backend: "xai" as const,
  }));
}

export function modelBackend(id: string, models: ModelRec[]): ResolvedBackend | null {
  return models.find((m) => m.id === id)?.backend ?? null;
}

export function pickDefaultModels(models: ModelRec[]): { parent: string; child: string } {
  if (!models.length) return { parent: "", child: "" };
  const preferParent = (id: string) =>
    /grok-4|grok-3(?!-mini)|qwen.*72|qwen.*32|llama.*70|mistral.*large|minimax|opus|sonnet/i.test(
      id,
    );
  const parent = models.find((m) => preferParent(m.id)) ?? models[0];
  const child =
    models.find((m) => m.id !== parent.id) ??
    models.find((m) => /mini|8b|7b|3b|instruct/i.test(m.id)) ??
    parent;
  return { parent: parent.id, child: child.id };
}
