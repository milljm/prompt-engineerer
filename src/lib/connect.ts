/**
 * Probe the configured OpenAI-compatible API and refresh the model list.
 */

import { listModels, pickDefaultModels, uniqueModels } from "./inference";
import { useEngineStore } from "./store";
import type { ModelRec } from "./types";

/**
 * Hit `/v1/models` for the saved API address and update the store.
 *
 * Empty URL clears the list without error. On success, Parent/Child are
 * filled in when missing or stale.
 *
 * @returns Connection flags plus the models shown in the sidebar.
 */
export async function probeConnection() {
  const { settings, setConnection, setSettings } = useEngineStore.getState();
  const url = settings.apiUrl.trim();

  if (!url) {
    setConnection({
      probing: false,
      ok: false,
      url: "",
      error: null,
      models: [],
    });
    return { ok: false, models: [] as ModelRec[] };
  }

  setConnection({ probing: true, url });

  let models: ModelRec[] = [];
  let error: string | null = null;
  let ok = false;
  try {
    models = uniqueModels(await listModels(url, settings.apiKey));
    ok = models.length > 0;
    if (!ok) error = "Connected, but no chat models were listed.";
  } catch (err) {
    error = err instanceof Error ? err.message : "API unreachable";
  }

  setConnection({
    probing: false,
    models,
    ok,
    url,
    error,
  });

  const { parentModel, childModel } = useEngineStore.getState().settings;
  const ids = new Set(models.map((m) => m.id));
  if (!parentModel || !ids.has(parentModel) || !childModel || !ids.has(childModel)) {
    const picked = pickDefaultModels(models);
    setSettings({
      parentModel: ids.has(parentModel) ? parentModel : picked.parent,
      childModel: ids.has(childModel) ? childModel : picked.child,
    });
  }

  return { ok, models };
}
