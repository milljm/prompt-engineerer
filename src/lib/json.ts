/**
 * Pull a JSON object out of a model reply that may include fences or chatter.
 *
 * Parent is instructed to return raw JSON, but models often wrap it in
 * markdown fences or add a sentence. This recovers the object when possible.
 *
 * @param text - Raw model output.
 * @returns Parsed JSON value (typically an object).
 * @throws Error if the reply is empty or contains no parseable object.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty model reply");

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through */
  }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }

  throw new Error("Could not parse JSON from the parent model");
}
