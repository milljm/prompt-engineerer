/**
 * Chat completions against any OpenAI-compatible `/v1` server.
 *
 * Loopback and LAN URLs are fetched from the browser. Public hosts go through
 * `/api/openai/*` so CORS and API keys stay off the page origin.
 */

import { estimateTokens } from "./child-cap.ts";
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
  if (!maxTokens) return false;
  if (usage && usage.completion >= maxTokens) return true;
  return estimateTokens(text) >= maxTokens;
}

async function readSseStream(
  res: Response,
  signal: AbortSignal | undefined,
  onDelta?: (text: string) => void,
  maxTokens?: number,
): Promise<ChatResult> {
  if (!res.body) throw new Error("Empty stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let text = "";
  let reasoning = "";
  let usage: ChatResult["usage"];
  let killed = false;

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
      if (chunk.choices?.[0]?.finish_reason === "length") killed = true;
      if (overCap(text, usage, maxTokens)) {
        killed = true;
        await reader.cancel().catch(() => undefined);
        return { text: text.trim(), reasoning: reasoning.trim() || undefined, usage, killed: true };
      }
    }
  }
  return { text: text.trim(), reasoning: reasoning.trim() || undefined, usage, killed };
}

async function readChatResponse(
  res: Response,
  signal: AbortSignal | undefined,
  onDelta?: (text: string) => void,
  maxTokens?: number,
): Promise<ChatResult> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream") || ct.includes("text/plain")) {
    return readSseStream(res, signal, onDelta, maxTokens);
  }
  const body = (await res.json()) as DeltaPayload;
  const text = contentFromMessage(body).trim();
  if (text) onDelta?.(text);
  const usage = body.usage
    ? { prompt: body.usage.prompt_tokens ?? 0, completion: body.usage.completion_tokens ?? 0 }
    : undefined;
  const killed = body.choices?.[0]?.finish_reason === "length" || overCap(text, usage, maxTokens);
  return { text, usage, killed };
}

function throwHttp(res: Response, body: string, code?: string) {
  if (res.status === 401 || res.status === 403) {
    throw new Error("Unauthorized. Check the API key.");
  }
  const err = new Error(body.slice(0, 280) || `HTTP ${res.status}`) as Error & { code?: string };
  if (code) err.code = code;
  throw err;
}

function parseProxyFailure(raw: string): { message: string; code?: string } {
  try {
    const parsed = JSON.parse(raw) as { error?: string; code?: string };
    return {
      message: parsed.error || raw,
      code: parsed.code,
    };
  } catch {
    return { message: raw };
  }
}

const DIRECT_HINT =
  "This API is on a private network, so your browser called it directly. Enable CORS on that server, or use http://127.0.0.1:<port>/v1.";

async function viaProxyOrDirect<T>(
  apiUrl: string,
  direct: () => Promise<T>,
  proxied: () => Promise<T>,
): Promise<T> {
  if (isBrowserDirectUrl(apiUrl)) return direct();
  try {
    return await proxied();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (!isPrivateHostError(err)) throw err;
    try {
      return await direct();
    } catch (directErr) {
      if (directErr instanceof DOMException && directErr.name === "AbortError") throw directErr;
      if (directErr instanceof TypeError) throw new Error(DIRECT_HINT);
      throw directErr;
    }
  }
}

async function chatDirect(req: ChatRequest): Promise<ChatResult> {
  const base = normalizeApiBase(req.apiUrl);
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: openaiHeaders(req.apiKey),
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
    throwHttp(res, err);
  }
  return readChatResponse(res, req.signal, req.onDelta, req.maxTokens);
}

async function chatProxied(req: ChatRequest): Promise<ChatResult> {
  const res = await fetch("/api/openai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: req.signal,
    body: JSON.stringify({
      baseUrl: req.apiUrl,
      apiKey: req.apiKey || undefined,
      model: req.model,
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxTokens ?? 1200,
      messages: req.messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    const parsed = parseProxyFailure(err);
    throwHttp(res, parsed.message, parsed.code);
  }
  return readChatResponse(res, req.signal, req.onDelta, req.maxTokens);
}

/**
 * Stream a chat completion from the configured OpenAI-compatible server.
 *
 * @param req - Model, messages, and the API address/key from settings.
 */
export async function chat(req: ChatRequest): Promise<ChatResult> {
  if (!req.model) throw new Error("No model selected");
  if (!req.apiUrl.trim()) throw new Error("Enter an OpenAI-compatible API address");
  if (apiUrlIsSelf(req.apiUrl)) {
    throw new Error("That URL is this app. Point it at an OpenAI-compatible server.");
  }
  try {
    return await viaProxyOrDirect(req.apiUrl, () => chatDirect(req), () => chatProxied(req));
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof TypeError) {
      throw new Error("Could not reach that API. Check the address and CORS.");
    }
    throw err;
  }
}

/**
 * Best-effort stop for local servers that implement `POST /v1/stop` (Edge).
 *
 * @param apiUrl - Local OpenAI-compatible base URL.
 * @param model - Optional model id some servers use to pick the worker.
 */
export async function stopLocal(apiUrl: string, model?: string) {
  if (!apiUrl.trim() || !isBrowserDirectUrl(apiUrl)) return;
  try {
    const base = normalizeApiBase(apiUrl);
    await fetch(`${base}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model ? { model } : {}),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    /* optional, Edge-style only */
  }
}

export function parseModelRows(body: {
  data?: { id?: string; owned_by?: string; context_length?: number; max_model_len?: number }[];
  models?: { id?: string; owned_by?: string; context_length?: number; max_model_len?: number }[];
}): ModelRec[] {
  const rows = body.data ?? body.models ?? [];
  const models: ModelRec[] = [];
  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    if (/imagine|image|tts|voice|embedding|whisper|dall-e|moderation/i.test(id)) continue;
    models.push({
      id,
      name: id.split("/").filter(Boolean).pop() || id,
      contextLength: row.context_length ?? row.max_model_len,
      ownedBy: row.owned_by,
    });
  }
  return models;
}

async function listDirect(apiUrl: string, apiKey?: string): Promise<ModelRec[]> {
  const base = normalizeApiBase(apiUrl);
  const res = await fetch(`${base}/models`, {
    headers: openaiHeaders(apiKey),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throwHttp(res, err);
  }
  return parseModelRows((await res.json()) as Parameters<typeof parseModelRows>[0]);
}

async function listProxied(apiUrl: string, apiKey?: string): Promise<ModelRec[]> {
  const res = await fetch("/api/openai/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ baseUrl: apiUrl, apiKey: apiKey || undefined }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    models?: { id?: string; owned_by?: string; context_length?: number; max_model_len?: number }[];
  };
  if (!res.ok) throwHttp(res, body.error || `HTTP ${res.status}`, body.code);
  if (body.error) throwHttp(res, body.error, body.code);
  return parseModelRows({ models: body.models });
}

export async function listModels(apiUrl: string, apiKey?: string): Promise<ModelRec[]> {
  if (!apiUrl.trim()) throw new Error("Enter an OpenAI-compatible API address");
  if (apiUrlIsSelf(apiUrl)) {
    throw new Error("That URL is this app. Point it at an OpenAI-compatible server.");
  }
  try {
    return await viaProxyOrDirect(
      apiUrl,
      () => listDirect(apiUrl, apiKey),
      () => listProxied(apiUrl, apiKey),
    );
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("Could not reach that API. Check the address and CORS.");
    }
    throw err;
  }
}

export function pickDefaultModels(models: ModelRec[]): { parent: string; child: string } {
  if (!models.length) return { parent: "", child: "" };
  const preferParent = (id: string) =>
    /grok-4|grok-3(?!-mini)|qwen.*72|qwen.*32|llama.*70|mistral.*large|minimax|opus|sonnet|gpt-4|gpt-5/i.test(
      id,
    );
  const parent = models.find((m) => preferParent(m.id)) ?? models[0];
  const child =
    models.find((m) => m.id !== parent.id && /mini|8b|7b|3b|instruct|small/i.test(m.id)) ??
    models.find((m) => m.id !== parent.id) ??
    parent;
  return { parent: parent.id, child: child.id };
}

export function uniqueModels(models: ModelRec[]): ModelRec[] {
  const seen = new Set<string>();
  const out: ModelRec[] = [];
  for (const m of models) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}
