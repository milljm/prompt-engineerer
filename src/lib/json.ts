/**
 * Pull a JSON object out of a model reply that may include fences, chatter,
 * or illegal escapes (models love `\'`, which JSON rejects).
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

  const sliced = sliceObject(candidate) ?? candidate;
  const attempts = [sliced, repairJson(sliced)];
  let last: unknown;
  for (const body of attempts) {
    try {
      return JSON.parse(body);
    } catch (err) {
      last = err;
    }
  }

  const reason = last instanceof Error ? last.message : "invalid JSON";
  throw new Error(`Could not parse JSON from the parent model (${reason})`);
}

function sliceObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

/**
 * Repair the illegal JSON-ish that LLMs emit: `\'`, other unknown escapes,
 * and trailing commas. Valid JSON is left alone.
 *
 * @param text - Candidate object text.
 */
export function repairJson(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        if ('"\\/bfnrtu'.includes(ch)) out += `\\${ch}`;
        else if (ch === "'") out += "'";
        else out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    out += ch;
  }
  if (escaped) out += "\\";
  return out.replace(/,\s*([}\]])/g, "$1");
}
