import {sleep} from "./utils.js";

export function getInputValue(inputElementSelector) {
    const inputElement = document.querySelector(inputElementSelector);
    if (inputElement)
        return inputElement.value;
}

export function setInputValue(inputElementSelector, value, blur = true) {
    const inputElement = document.querySelector(inputElementSelector);
    if (!inputElement) {
        console.log(`Input element ${inputElementSelector} not found.`);
        return;
    }
    inputElement.value = value;

    const inputEvent = new Event('input', {bubbles: true, cancelable: true});
    inputElement.dispatchEvent(inputEvent);

    if (blur) {
        const blurEvent = new Event('blur', {bubbles: true, cancelable: true});
        inputElement.dispatchEvent(blurEvent);
    }
}

export async function setDropdownValue(inputElementSelector, value, blur = true) {
    const inputElement = document.querySelector(inputElementSelector);
    if (!inputElement) {
        console.log(`Input element ${inputElementSelector} not found.`);
        return;
    }

    if (inputElement.value.includes(value))
        return;

    inputElement.value = value;

    const focusEvent = new Event("focus", {bubbles: true, cancelable: true});
    inputElement.dispatchEvent(focusEvent);
    inputElement.focus();

    await sleep(333);

    const optionList = inputElement.closest(".block").querySelector("ul");

    if (optionList) {
        const options = Array.from(optionList.querySelectorAll("li"));

        for (const optionElement of options) {
            if (optionElement.getAttribute("data-value").includes(value)) {
                const mousedownEvent = new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0
                });

                optionElement.dispatchEvent(mousedownEvent)
                return;
            }
        }
    }
}

export function toggleHiresFix(onlyEnable) {
    const hrFixCheckbox = document.getElementById("txt2img_hr-visible-checkbox");
    let toggle = true;

    if (onlyEnable)
        toggle = !hrFixCheckbox.checked;

    if (toggle) {
        var inputEvent = new Event('input', {
            'bubbles': true,
            'cancelable': true
        });

        var clickEvent = new MouseEvent('click', {
            'view': window,
            'bubbles': true,
            'cancelable': true,
            'buttons': 1
        });

        hrFixCheckbox.dispatchEvent(clickEvent);
        hrFixCheckbox.dispatchEvent(inputEvent);
    }
}