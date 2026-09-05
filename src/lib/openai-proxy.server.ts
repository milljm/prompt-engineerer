/**
 * Server-only helpers for the OpenAI-compatible proxy.
 *
 * Public hosts are resolved and rejected if they land on a private address
 * (SSRF). LAN / loopback URLs are never proxied — the browser calls those.
 */

import { lookup } from "node:dns/promises";
import { isPrivateOrLocalHost, normalizeApiBase, openaiHeaders, parseApiUrl } from "./openai-url.ts";

/**
 * Validate a user-supplied upstream URL for proxying.
 *
 * @param raw - User-entered API address.
 * @returns Normalized `/v1` base URL.
 * @throws Error if the host is local/private or DNS-resolves to a private IP.
 */
export async function resolveProxyBase(raw: string): Promise<string> {
  const parsed = parseApiUrl(raw);
  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw new Error("Local API addresses are called from your browser, not through this app.");
  }
  const { address } = await lookup(parsed.hostname);
  if (isPrivateOrLocalHost(address)) {
    throw new Error("That host resolves to a private address and cannot be proxied.");
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
  const status = /not a valid url|must be http|enter an openai|private address|local api/i.test(
    message,
  )
    ? 400
    : 502;
  return Response.json({ error: message.slice(0, 280) }, { status });
}
