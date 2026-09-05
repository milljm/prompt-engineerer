/**
 * OpenAI-compatible base URL helpers shared by the browser client and the
 * server-side proxy. Normalizes user-entered addresses onto `/v1` and decides
 * whether a host must be called from the browser (LAN / loopback) or may be
 * proxied (public HTTPS APIs).
 */

/**
 * Parse a user-entered API address into a URL.
 *
 * Protocol is optional; `http://` is assumed when missing.
 *
 * @param raw - Address such as `https://api.openai.com/v1` or `127.0.0.1:8080`.
 * @returns A parsed URL with an http(s) protocol.
 * @throws Error if the value is empty, not a URL, or not http(s).
 */
export function parseApiUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter an OpenAI-compatible API address");
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error("API address must be http or https");
  }
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    throw new Error("That API address is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("API address must be http or https");
  }
  return parsed;
}

/**
 * Normalize an OpenAI-compatible base URL so it ends with `/v1`.
 *
 * Strips accidental `/chat/completions` or `/models` suffixes and a trailing
 * slash. `https://api.openai.com` becomes `https://api.openai.com/v1`.
 *
 * @param raw - User-entered API address.
 * @returns Origin plus `/v1` path, no trailing slash.
 */
export function normalizeApiBase(raw: string): string {
  const parsed = parseApiUrl(raw);
  let path = parsed.pathname.replace(/\/+$/, "");
  path = path.replace(/\/chat\/completions$/i, "").replace(/\/models$/i, "");
  path = path.replace(/\/+$/, "");
  if (!/\/v1$/i.test(path)) path = `${path}/v1`;
  return `${parsed.origin}${path}`;
}

/**
 * Return true when `hostname` is loopback or a well-known local alias.
 *
 * @param hostname - Host portion of a URL (IPv6 brackets optional).
 */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1" ||
    h === "host.docker.internal"
  );
}

/**
 * Return true when `hostname` is loopback, link-local, or RFC1918 private.
 *
 * Used both to send LAN traffic from the browser and to block those hosts
 * from the public proxy (SSRF).
 *
 * @param hostname - Host portion of a URL, or a resolved IP address.
 */
export function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isLoopbackHost(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

/**
 * Local / LAN hosts must be called from the browser — the app server cannot
 * reach the user's machine.
 *
 * @param raw - User-entered API address.
 * @returns True when chat/models should use `fetch` in the browser.
 */
export function isBrowserDirectUrl(raw: string): boolean {
  try {
    return isPrivateOrLocalHost(parseApiUrl(raw).hostname);
  } catch {
    return false;
  }
}

/**
 * Return true when `raw` points at the page currently serving this app.
 *
 * Prevents a default `127.0.0.1` URL from probing the studio itself.
 *
 * @param raw - User-entered API address.
 */
export function apiUrlIsSelf(raw: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const target = parseApiUrl(raw);
    return target.host === window.location.host;
  } catch {
    return false;
  }
}

/**
 * Headers for an OpenAI-compatible request.
 *
 * @param apiKey - Optional bearer token. Omitted entirely when blank so local
 *   servers that do not require auth are not sent a dummy header.
 */
export function openaiHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = apiKey?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}
