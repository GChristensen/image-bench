import {adapter} from "./adapters/adapter.js";

/**
 * Get input value by selector key
 * @param {string} selectorKey - Key from SELECTORS constant
 * @returns {string|number|null}
 */
export function getInputValue(selectorKey) {
    return adapter.getInputValue(selectorKey);
}

/**
 * Set input value by selector key
 * @param {string} selectorKey - Key from SELECTORS constant
 * @param {string|number} value - Value to set
 * @param {boolean} triggerEvents - Whether to trigger events
 */
export function setInputValue(selectorKey, value, triggerEvents = true) {
    adapter.setInputValue(selectorKey, value, triggerEvents);
}

/**
 * Set checkbox value by selector key
 * @param {string} selectorKey - Key from SELECTORS constant
 * @param {boolean} checked - Whether to check
 */
export function setCheckBoxValue(selectorKey, checked) {
    adapter.setCheckboxValue(selectorKey, checked);
}

/**
 * Set dropdown value by selector key
 * @param {string} selectorKey - Key from SELECTORS constant
 * @param {string} value - Value to select
 * @returns {Promise<void>}
 */
export async function setDropdownValue(selectorKey, value) {
    return adapter.setDropdownValue(selectorKey, value);
}

/**
 * Toggle hires fix
 * @param {boolean} onlyEnable - Only enable
 * @param {boolean} onlyDisable - Only disable
 */
export function toggleHiresFix(onlyEnable, onlyDisable) {
    adapter.toggleHiresFix(onlyEnable, onlyDisable);
}
