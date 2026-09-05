/**
 * Proxy `POST /v1/chat/completions` for public OpenAI-compatible hosts.
 * Local/LAN addresses are rejected; the browser calls those directly.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { proxyErrorResponse, resolveProxyBase, upstreamHeaders } from "@/lib/openai-proxy.server";

const Body = z.object({
  baseUrl: z.string().min(1).max(500),
  apiKey: z.string().max(512).optional(),
  model: z.string().min(1).max(200),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(16).max(8000).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().max(48_000),
      }),
    )
    .min(1)
    .max(40),
});

export const Route = createFileRoute("/api/openai/chat")({
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
          return Response.json({ error: "Invalid chat request" }, { status: 400 });
        }

        const { baseUrl, apiKey, model, messages, temperature, max_tokens } = parsed.data;
        let base: string;
        try {
          base = await resolveProxyBase(baseUrl);
        } catch (err) {
          return proxyErrorResponse(err, "Invalid API address");
        }

        const upstream = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: upstreamHeaders(apiKey),
          signal: request.signal,
          redirect: "error",
          body: JSON.stringify({
            model,
            stream: true,
            temperature: temperature ?? 0.4,
            max_tokens: max_tokens ?? 1200,
            messages,
          }),
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Could not reach that API";
          return { error: msg } as const;
        });

        if ("error" in upstream) {
          return Response.json({ error: upstream.error.slice(0, 240) }, { status: 502 });
        }
        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text().catch(() => "");
          return Response.json(
            {
              error:
                upstream.status === 401 || upstream.status === 403
                  ? "Unauthorized. Check the API key."
                  : errText.slice(0, 240) || `Upstream HTTP ${upstream.status}`,
            },
            { status: upstream.status === 401 || upstream.status === 403 ? upstream.status : 502 },
          );
        }

        const contentType = upstream.headers.get("content-type") || "text/event-stream; charset=utf-8";
        return new Response(upstream.body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
