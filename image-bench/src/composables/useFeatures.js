import {hostHas} from "@/host.js";

/**
 * Feature check of a view: the host supports the feature (src/host.js) and the host page does not report it
 * missing. The host page may send a `features` map ({name: boolean}); a feature it does not list is available,
 * so WebUI, which sends none, shows everything.
 * @param {string} scope - generate, controlnet or images
 * @param {() => Object|null} getFeatures - Reactive getter of the features reported by the host page
 * @returns {(name: string) => boolean}
 */
export function useFeatures(scope, getFeatures = () => null) {
  return name => hostHas(scope, name) && (getFeatures()?.[name] ?? true);
}
