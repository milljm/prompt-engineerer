/**
 * Server-only helpers for the OpenAI-compatible proxy.
 *
 * Public hosts are resolved and rejected if they land on a private address
 * (SSRF). LAN / loopback URLs are never proxied — the browser calls those.
 */

import { lookup } from "node:dns/promises";
import {
  PRIVATE_HOST_CODE,
  PrivateHostError,
  isPrivateOrLocalHost,
  normalizeApiBase,
  openaiHeaders,
  parseApiUrl,
} from "./openai-url.ts";

/**
 * Validate a user-supplied upstream URL for proxying.
 *
 * @param raw - User-entered API address.
 * @returns Normalized `/v1` base URL.
 * @throws PrivateHostError if the host is local/private or DNS-resolves to one.
 */
export async function resolveProxyBase(raw: string): Promise<string> {
  const parsed = parseApiUrl(raw);
  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw new PrivateHostError(
      "Local API addresses are called from your browser, not through this app.",
    );
  }
  const results = await lookup(parsed.hostname, { all: true });
  if (results.some((row) => isPrivateOrLocalHost(row.address))) {
    throw new PrivateHostError();
  }
  return normalizeApiBase(raw);
}

/**
 * Forwarding headers for the upstream OpenAI-compatible server.
 *
 * @param apiKey - Optional bearer token from the client (never logged).
 */
export function upstreamHeaders(apiKey?: string) {
  return openaiHeaders(apiKey);
}

/**
 * Map an upstream / validation error onto a JSON Response.
 *
 * Client mistakes (bad URL, private host) become 400; transport failures 502.
 *
 * @param err - Thrown value from the proxy.
 * @param fallback - Message used when `err` is not an Error.
 */
export function proxyErrorResponse(err: unknown, fallback = "Upstream error") {
  const message = err instanceof Error ? err.message : fallback;
  const privateHost = err instanceof PrivateHostError || /private address|private network|local api/i.test(message);
  const status = privateHost || /not a valid url|must be http|enter an openai/i.test(message) ? 400 : 502;
  return Response.json(
    {
      error: message.slice(0, 280),
      ...(privateHost ? { code: PRIVATE_HOST_CODE } : {}),
    },
    { status },
  );
}
