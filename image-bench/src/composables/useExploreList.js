import { ref, watch } from 'vue';
import { dialog } from '@/dialogs/useDialog.js';

/**
 * Composable for an explorable item list (checkpoints, LoRAs) with presets and per-item params
 * Presets and params are stored in a section of the shared explore presets object
 *
 * @param {Object} options
 * @param {Function} options.keyOf - Returns the unique key of an item
 * @param {Function} [options.labelOf] - Returns the displayed label of an item (defaults to the key)
 * @param {Function} options.section - Returns the (mutable) storage object of this list
 * @param {Object} options.keys - Property names in the section: { presets, lastPreset, params, selection }
 * @param {Function} options.save - Persists the explore presets object
 */
export function useExploreList({ keyOf, labelOf = keyOf, section, keys, save }) {
  const items = ref([]);
  const selected = ref(new Set());
  const presetNames = ref([]);
  const currentPreset = ref("");
  const params = ref({});
  const focusedKey = ref(null);

  let loaded = false;
  let saveSelectionTimeout = null;

  function getPresets() {
    const data = section();
    data[keys.presets] = data[keys.presets] || {};
    return data[keys.presets];
  }

  function getSelectedKeys() {
    return items.value.map(keyOf).filter(key => selected.value.has(key));
  }

  function selectKeys(selectedKeys) {
    const keySet = new Set(selectedKeys || []);
    selected.value = new Set(items.value.map(keyOf).filter(key => keySet.has(key)));
  }

  function selectPresetItems(presetName) {
    selectKeys(section()[keys.presets]?.[presetName]);
  }

  /**
   * Initialize state from the storage section; call after items are set
   * The last selection is restored if it was stored, otherwise the items of the last preset are selected
   */
  function load() {
    const data = section();

    params.value = data[keys.params] || {};
    presetNames.value = Object.keys(data[keys.presets] || {});
    currentPreset.value = data[keys.lastPreset] || "";

    if (Array.isArray(data[keys.selection]))
      selectKeys(data[keys.selection]);
    else
      selectPresetItems(currentPreset.value);

    focusedKey.value = getSelectedKeys()[0] ?? null;
    loaded = true;
  }

  // Persist the selection so that it survives restarts (debounced, checkbox toggles come in bursts)
  watch(selected, () => {
    if (!loaded)
      return;

    const selectedKeys = [...selected.value];
    const stored = section()[keys.selection];

    if (Array.isArray(stored) && stored.length === selectedKeys.length && stored.every(key => selected.value.has(key)))
      return;

    section()[keys.selection] = selectedKeys;
    clearTimeout(saveSelectionTimeout);
    saveSelectionTimeout = setTimeout(save, 500);
  });

  async function activatePreset(presetName) {
    selectPresetItems(presetName);
    currentPreset.value = presetName;
    section()[keys.lastPreset] = presetName;
    await save();
  }

  async function createPreset(presetName) {
    getPresets()[presetName] = getSelectedKeys();
    section()[keys.lastPreset] = presetName;
    currentPreset.value = presetName;

    if (!presetNames.value.includes(presetName))
      presetNames.value.push(presetName);

    await save();
  }

  async function saveCurrentPreset() {
    const presetName = currentPreset.value;

    if (!presetName) {
      await dialog.alert("No preset is selected.");
      return;
    }

    getPresets()[presetName] = getSelectedKeys();
    section()[keys.lastPreset] = presetName;
    await save();
  }

  async function deleteCurrentPreset() {
    const presetName = currentPreset.value;

    if (!presetName)
      return;

    presetNames.value = presetNames.value.filter(name => name !== presetName);
    delete getPresets()[presetName];

    if (presetNames.value.length)
      return activatePreset(presetNames.value[0]);

    currentPreset.value = "";
    section()[keys.lastPreset] = "";
    await save();
  }

  function clearSelection() {
    selected.value = new Set();
  }

  function toggle(key, checked) {
    const newSelected = new Set(selected.value);

    if (checked)
      newSelected.add(key);
    else
      newSelected.delete(key);

    selected.value = newSelected;
  }

  function setChecked(keys, checked) {
    const newSelected = new Set(selected.value);

    for (const key of keys) {
      if (checked)
        newSelected.add(key);
      else
        newSelected.delete(key);
    }

    selected.value = newSelected;
  }

  function focus(key) {
    focusedKey.value = key;
  }

  /**
   * Set params of an item; empty params remove the entry
   */
  async function setParams(key, itemParams) {
    const allParams = {...params.value};

    if (itemParams && Object.keys(itemParams).length)
      allParams[key] = itemParams;
    else
      delete allParams[key];

    params.value = allParams;
    section()[keys.params] = allParams;
    await save();
  }

  /**
   * Get plain copies of the selected items with their params attached
   */
  function getSelectedItems() {
    return items.value
      .filter(item => selected.value.has(keyOf(item)))
      .map(item => {
        const copy = JSON.parse(JSON.stringify(item));
        const itemParams = params.value[keyOf(item)];

        if (itemParams)
          copy.params = {...itemParams};

        return copy;
      });
  }

  return {
    // State
    items,
    selected,
    presetNames,
    currentPreset,
    params,
    focusedKey,

    // Methods
    keyOf,
    labelOf,
    load,
    activatePreset,
    createPreset,
    saveCurrentPreset,
    deleteCurrentPreset,
    clearSelection,
    toggle,
    setChecked,
    focus,
    setParams,
    getSelectedItems
  };
}
