import { listEdgeModels, listXaiModels, pickDefaultModels } from "./inference";
import { useEngineStore } from "./store";
import type { BackendKind, ModelRec, ResolvedBackend } from "./types";

function normalizeHost(url: string) {
  try {
    const parsed = new URL(url.includes("://") ? url : `http://${url}`);
    return parsed.host;
  } catch {
    return "";
  }
}

function isLoopback(host: string) {
  return host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0" || host === "[::1]";
}

function edgeUrlIsSelf(edgeUrl: string) {
  if (typeof window === "undefined") return false;
  const edgeHost = normalizeHost(edgeUrl);
  if (!edgeHost) return false;
  return edgeHost === window.location.host;
}

/** Skip probing Edge when this page *is* the App Builder preview on 8080/8081. */
function skipEdgeAutoProbe(edgeUrl: string) {
  if (typeof window === "undefined") return true;
  if (edgeUrlIsSelf(edgeUrl)) return true;
  try {
    const parsed = new URL(edgeUrl.includes("://") ? edgeUrl : `http://${edgeUrl}`);
    const here = window.location;
    if (!isLoopback(parsed.hostname) || !isLoopback(here.hostname)) return false;
    const edgePort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const herePort = here.port || (here.protocol === "https:" ? "443" : "80");
    return edgePort === "8080" && (herePort === "8080" || herePort === "8081");
  } catch {
    return false;
  }
}

function uniqueModels(models: ModelRec[]) {
  const seen = new Set<string>();
  const out: ModelRec[] = [];
  for (const m of models) {
    const key = `${m.backend}:${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export async function probeConnection() {
  const { settings, setConnection, setSettings } = useEngineStore.getState();
  setConnection({ probing: true });

  let edgeModels: ModelRec[] = [];
  let edgeError: string | null = null;
  let edgeOk = false;
  const skipEdge = settings.backend !== "edge" && skipEdgeAutoProbe(settings.edgeUrl);
  if (skipEdge) {
    edgeOk = false;
    edgeError = null;
  } else if (edgeUrlIsSelf(settings.edgeUrl)) {
    edgeError = "That URL is this app. Point it at Edge (your MLX studio).";
  } else {
    try {
      edgeModels = await listEdgeModels(settings.edgeUrl);
      edgeOk = true;
    } catch (err) {
      edgeError = err instanceof Error ? err.message : "Edge unreachable";
    }
  }

  let xaiModels: ModelRec[] = [];
  let xaiError: string | null = null;
  let xaiOk = false;
  try {
    xaiModels = await listXaiModels();
    xaiOk = xaiModels.length > 0;
  } catch (err) {
    xaiError = err instanceof Error ? err.message : "xAI unavailable";
  }

  const prefer = resolveBackend(settings.backend, edgeOk, xaiOk);
  const models = prefer === "edge" && edgeOk ? edgeModels : xaiOk ? xaiModels : edgeModels;
  const shown = uniqueModels(
    settings.backend === "edge"
      ? edgeModels
      : settings.backend === "xai"
        ? xaiModels
        : models.length
          ? models
          : [...edgeModels, ...xaiModels],
  );

  setConnection({
    probing: false,
    models: shown,
    edge: { ok: edgeOk, url: settings.edgeUrl, error: edgeError },
    xai: { ok: xaiOk, error: xaiError },
  });

  const { parentModel, childModel } = useEngineStore.getState().settings;
  const ids = new Set(shown.map((m) => m.id));
  if (!parentModel || !ids.has(parentModel) || !childModel || !ids.has(childModel)) {
    const picked = pickDefaultModels(shown);
    setSettings({
      parentModel: ids.has(parentModel) ? parentModel : picked.parent,
      childModel: ids.has(childModel) ? childModel : picked.child,
    });
  }

  return { edgeOk, xaiOk, models: shown };
}

export function resolveBackend(
  pref: BackendKind,
  edgeOk: boolean,
  xaiOk: boolean,
): ResolvedBackend | null {
  if (pref === "edge") return edgeOk ? "edge" : null;
  if (pref === "xai") return xaiOk ? "xai" : null;
  if (edgeOk) return "edge";
  if (xaiOk) return "xai";
  return null;
}

export function backendForModel(
  modelId: string,
  models: ModelRec[],
  fallback: ResolvedBackend | null,
): ResolvedBackend | null {
  return models.find((m) => m.id === modelId)?.backend ?? fallback;
}
