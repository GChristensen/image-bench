import {dialog} from "@/dialogs/useDialog.js";

// Query string -> found or not-found result; errors and the current checkpoint are not cached
const cache = new Map();

/**
 * Civitai info of a model through the backend, which hashes the local file if needed
 * @param {{kind?: "checkpoint"|"lora", name?: string, hash?: string}} query
 *   Without name and hash: the checkpoint selected in SD WebUI
 * @returns {Promise<Object>} {found, url, modelName, versionName, type, baseModel, trainedWords, previewUrl,
 *   name, searchUrl} or {found: false, searchUrl?, error?}
 */
export async function fetchModelInfo({kind = "checkpoint", name = "", hash = ""} = {}) {
  const query = new URLSearchParams({kind, name, hash}).toString();
  const cacheable = !!(name || hash);

  if (cacheable && cache.has(query))
    return cache.get(query);

  try {
    const response = await fetch(`/image-bench/civitai/model_info?${query}`);

    if (!response.ok)
      return {found: false, error: `Request failed: ${response.status} ${response.statusText}`};

    const info = await response.json();

    if (cacheable && !info.error)
      cache.set(query, info);

    return info;
  } catch (e) {
    return {found: false, error: `Request failed: ${e.message}`};
  }
}

/**
 * Show the Civitai info dialog of a model; offer a search by name if Civitai does not know it
 * @param {{kind?: "checkpoint"|"lora", name?: string, hash?: string}} query
 * @param {{actions?: {id: string, label: string}[], info?: Object}} options
 *   Extra dialog buttons; info already fetched with fetchModelInfo()
 * @returns {Promise<{action: string, info: Object}|null>} The chosen extra action, null otherwise
 */
export async function showModelInfo(query, {actions = [], info = null} = {}) {
  info = info || await fetchModelInfo(query);

  if (info.error) {
    await dialog.alert(info.error, {title: "Civitai"});
    return null;
  }

  if (!info.found) {
    const message = `'${info.name || query.name || "The model"}' is not found on Civitai.`;

    if (!info.searchUrl)
      await dialog.alert(message, {title: "Civitai"});
    else if (await dialog.confirm(`${message} Search by name?`, {title: "Civitai", okText: "Search"}))
      window.open(info.searchUrl, "_blank");

    return null;
  }

  const action = await dialog.modelInfo(info, {actions});

  if (action === "open")
    window.open(info.url, "_blank");

  return action && action !== "open" ? {action, info} : null;
}
