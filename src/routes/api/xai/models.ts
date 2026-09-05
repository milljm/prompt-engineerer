import { createFileRoute } from "@tanstack/react-router";

const FALLBACK = ["grok-4.5", "grok-4", "grok-3", "grok-3-mini"];

export const Route = createFileRoute("/api/xai/models")({
  server: {
    handlers: {
      GET: async () => {
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) {
          return Response.json(
            { error: "xAI is not available in this environment", models: [] },
            { status: 503 },
          );
        }
        try {
          const res = await fetch("https://api.x.ai/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) {
            return Response.json({
              models: FALLBACK.map((id) => ({ id })),
              warning: `xAI models HTTP ${res.status}`,
            });
          }
          const body = (await res.json()) as { data?: { id?: string }[] };
          const ids = (body.data ?? [])
            .map((row) => String(row.id || "").trim())
            .filter((id) => id && !/imagine|image|tts|voice|embedding/i.test(id));
          const unique = [...new Set(ids.length ? ids : FALLBACK)];
          unique.sort((a, b) => {
            const rank = (id: string) =>
              id.includes("4.5") ? 0 : id.includes("grok-4") ? 1 : id.includes("grok-3") ? 2 : 3;
            return rank(a) - rank(b) || a.localeCompare(b);
          });
          return Response.json({ models: unique.map((id) => ({ id })) });
        } catch {
          return Response.json({ models: FALLBACK.map((id) => ({ id })) });
        }
      },
    },
  },
});
