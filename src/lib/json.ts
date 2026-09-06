/**
 * Pull a JSON object out of a model reply that may include fences, chatter,
 * illegal escapes, or a mid-array cutoff when the model hits max tokens.
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
  const attempts = [sliced, repairJson(sliced), closeTruncatedJson(repairJson(sliced))];
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
  if (start < 0) return null;
  const end = text.lastIndexOf("}");
  if (end > start) return text.slice(start, end + 1);
  return text.slice(start);
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

/**
 * Close strings / arrays / objects left open when generation hit the token cap.
 * Turns `{"scenarios":[{"name":"A"` into a parseable object so earlier
 * complete scenarios survive.
 *
 * @param text - Possibly truncated JSON object.
 */
export function closeTruncatedJson(text: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let extra = "";
  if (escaped) extra += " ";
  if (inString) extra += '"';
  extra += stack.reverse().join("");
  return text.replace(/,\s*$/, "") + extra;
}
