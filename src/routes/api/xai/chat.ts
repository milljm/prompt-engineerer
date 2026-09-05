import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  model: z.string().min(1).max(120),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(16).max(4000).optional(),
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

export const Route = createFileRoute("/api/xai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "xAI is not available" }, { status: 503 });
        }

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

        const { model, messages, temperature, max_tokens } = parsed.data;
        const upstream = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: request.signal,
          body: JSON.stringify({
            model,
            stream: true,
            temperature: temperature ?? 0.4,
            max_tokens: max_tokens ?? 1200,
            messages,
          }),
        }).catch(() => null);

        if (!upstream) {
          return Response.json({ error: "Could not reach xAI" }, { status: 502 });
        }
        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text().catch(() => "");
          return Response.json(
            {
              error:
                upstream.status === 429
                  ? "xAI is busy. Try again in a moment."
                  : errText.slice(0, 240) || `xAI HTTP ${upstream.status}`,
            },
            { status: upstream.status === 429 ? 429 : 502 },
          );
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
