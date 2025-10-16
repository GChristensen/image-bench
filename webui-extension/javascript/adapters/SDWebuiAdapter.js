/**
 * SDWebuiAdapter
 * SD WebUI/Forge-specific implementation of DOMAdapter
 */

import { DOMAdapter } from './DOMAdapter.js';
import { SELECTORS, getElementById, querySelector, querySelectorAll } from './selectors.js';

export class SDWebuiAdapter extends DOMAdapter {
    /**
     * Get the value of an input element
     * @param {string} selectorKey - Key from SELECTORS constant
     * @returns {string|number|null} The input value
     */
    getInputValue(selectorKey) {
        const selector = SELECTORS[selectorKey];
        const element = document.querySelector(selector);
        return element?.value ?? null;
    }

    /**
     * Set the value of an input element
     * @param {string} selectorKey - Key from SELECTORS constant
     * @param {string|number} value - The value to set
     * @param {boolean} triggerEvents - Whether to trigger input/blur events
     */
    setInputValue(selectorKey, value, triggerEvents = true) {
        const selector = SELECTORS[selectorKey];
        const element = document.querySelector(selector);
        
        if (!element) {
            console.log(`Input element ${selector} not found.`);
            return;
        }

        element.value = value;

        if (triggerEvents) {
            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            element.dispatchEvent(inputEvent);

            const blurEvent = new Event('blur', { bubbles: true, cancelable: true });
            element.dispatchEvent(blurEvent);
        }
    }

    /**
     * Set the value of a checkbox element
     * @param {string} selectorKey - Key from SELECTORS constant
     * @param {boolean} checked - Whether to check or uncheck
     */
    setCheckboxValue(selectorKey, checked) {
        const selector = SELECTORS[selectorKey];
        const element = document.querySelector(selector);
        
        if (!element) {
            console.log(`Checkbox element ${selector} not found.`);
            return;
        }

        if (element.checked !== checked) {
            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            element.dispatchEvent(inputEvent);

            const changeEvent = new Event('change', { bubbles: true, cancelable: true });
            element.dispatchEvent(changeEvent);

            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
            });

            element.dispatchEvent(clickEvent);
        }
    }

    /**
     * Set the value of a dropdown element
     * @param {string} selectorKey - Key from SELECTORS constant
     * @param {string} value - The value to select
     * @returns {Promise<void>}
     */
    async setDropdownValue(selectorKey, value) {
        const selector = SELECTORS[selectorKey];
        const element = document.querySelector(selector);
        
        if (!element) {
            console.log(`Dropdown element ${selector} not found.`);
            return;
        }

        if (element.value.includes(value)) {
            return;
        }

        element.value = value;

        const focusEvent = new Event('focus', { bubbles: true, cancelable: true });
        element.dispatchEvent(focusEvent);
        element.focus();

        await this.sleep(333);

        const optionList = element.closest(SELECTORS.DROPDOWN_BLOCK)?.querySelector(SELECTORS.DROPDOWN_LIST);

        if (optionList) {
            // Strip hash from model names
            value = value.replace(/ \[[^\]]+\]$/, '');

            const options = Array.from(optionList.querySelectorAll(SELECTORS.DROPDOWN_OPTION));

            for (const optionElement of options) {
                const optionName = optionElement.getAttribute('data-value')
                    || optionElement.getAttribute('aria-label');

                if (optionName?.includes(value)) {
                    const mousedownEvent = new MouseEvent('mousedown', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        button: 0
                    });

                    optionElement.dispatchEvent(mousedownEvent);
                    return;
                }
            }
        }
    }

    /**
     * Click a button element
     * @param {string} selectorKey - Key from SELECTORS constant
     * @returns {boolean} Whether the button was clicked
     */
    clickButton(selectorKey) {
        const element = this.getElement(selectorKey);
        
        if (element && this.isElementVisible(element)) {
            element.click();
            return true;
        }
        
        return false;
    }

    /**
     * Check if an element is visible
     * @param {HTMLElement} element - The element to check
     * @returns {boolean}
     */
    isElementVisible(element) {
        return element?.style?.display !== 'none';
    }

    /**
     * Get element by selector key
     * @param {string} selectorKey - Key from SELECTORS constant
     * @returns {HTMLElement|null}
     */
    getElement(selectorKey) {
        const selector = SELECTORS[selectorKey];
        
        // Handle both ID selectors (no #) and CSS selectors (with #)
        if (typeof selector === 'string' && !selector.startsWith('#') && !selector.startsWith('.')) {
            return getElementById(selector);
        }
        
        return querySelector(selector);
    }

    /**
     * Get all elements matching selector key
     * @param {string} selectorKey - Key from SELECTORS constant
     * @returns {NodeList|Array}
     */
    getAllElements(selectorKey) {
        const selector = SELECTORS[selectorKey];
        return querySelectorAll(selector);
    }

    /**
     * Toggle hires fix checkbox
     * @param {boolean} onlyEnable - Only enable, don't toggle off
     * @param {boolean} onlyDisable - Only disable, don't toggle on
     */
    toggleHiresFix(onlyEnable = false, onlyDisable = false) {
        const hrFixCheckbox = getElementById(SELECTORS.HIRES_CHECKBOX);
        
        if (!hrFixCheckbox) {
            return;
        }
        
        let toggle = true;

        if (onlyEnable) {
            toggle = !hrFixCheckbox.checked;
        }

        if (onlyDisable) {
            toggle = hrFixCheckbox.checked;
        }

        if (toggle) {
            const inputEvent = new Event('input', {
                bubbles: true,
                cancelable: true
            });

            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
            });

            hrFixCheckbox.dispatchEvent(clickEvent);
            hrFixCheckbox.dispatchEvent(inputEvent);
        }
    }

    /**
     * Check if currently on img2img tab
     * @returns {boolean}
     */
    isImg2ImgTab() {
        const txt2ImgButton = getElementById(SELECTORS.TXT2IMG_GENERATE);
        return txt2ImgButton?.offsetParent === null;
    }

    /**
     * Get current generation progress percentage
     * @returns {number|null} Progress from 0-100, or null if not available
     */
    getGenerationProgress() {
        const progressBar = querySelector(SELECTORS.PROGRESS_BAR);
        const progressBarText = progressBar?.textContent;
        const matches = progressBarText?.match(/(\d+)%/);

        if (matches) {
            return parseInt(matches[1]);
        }

        return null;
    }

    /**
     * Dispatch a mouse event on an element
     * @param {HTMLElement} element - Target element
     * @param {string} eventType - Event type (e.g., 'mousedown', 'click')
     */
    dispatchMouseEvent(element, eventType) {
        const mouseEvent = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0
        });

        element.dispatchEvent(mouseEvent);
    }

    /**
     * Check if Forge is being used (vs standard SD WebUI)
     * @returns {boolean}
     */
    isForge() {
        return !!querySelector(SELECTORS.FORGE_INDICATOR);
    }
}
