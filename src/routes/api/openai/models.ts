/**
 * Proxy `GET /v1/models` for public OpenAI-compatible hosts.
 * The client POSTs `{ baseUrl, apiKey }` so the key is not put on the query string.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { proxyErrorResponse, resolveProxyBase, upstreamHeaders } from "@/lib/openai-proxy.server";

const Body = z.object({
  baseUrl: z.string().min(1).max(500),
  apiKey: z.string().max(512).optional(),
});

export const Route = createFileRoute("/api/openai/models")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = Body.safeParse(json);
        if (!parsed.success) {
          return Response.json({ error: "Invalid models request" }, { status: 400 });
        }

        let base: string;
        try {
          base = await resolveProxyBase(parsed.data.baseUrl);
        } catch (err) {
          return proxyErrorResponse(err, "Invalid API address");
        }

        try {
          const res = await fetch(`${base}/models`, {
            headers: upstreamHeaders(parsed.data.apiKey),
            signal: AbortSignal.timeout(8000),
            redirect: "error",
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            const error =
              res.status === 401 || res.status === 403
                ? "Unauthorized. Check the API key."
                : errText.slice(0, 200) || `Upstream HTTP ${res.status}`;
            return Response.json({ error, models: [] }, { status: res.status === 401 || res.status === 403 ? res.status : 502 });
          }
          const body = (await res.json()) as {
            data?: { id?: string; owned_by?: string; context_length?: number; max_model_len?: number }[];
            models?: { id?: string }[];
          };
          const rows = body.data ?? body.models ?? [];
          const models = rows
            .map((row) => ({
              id: String(row.id || "").trim(),
              owned_by: "owned_by" in row ? row.owned_by : undefined,
              context_length: "context_length" in row ? row.context_length : undefined,
              max_model_len: "max_model_len" in row ? row.max_model_len : undefined,
            }))
            .filter((row) => row.id && !/imagine|image|tts|voice|embedding|whisper|dall-e|moderation/i.test(row.id));
          return Response.json({ models });
        } catch (err) {
          return proxyErrorResponse(err, "Could not list models");
        }
      },
    },
  },
});
