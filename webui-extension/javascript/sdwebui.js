import {getGenerationState, setGenerationState} from "./shared/state.js";
import {messageBus} from "./shared/messaging/MessageBus.js";
import {sleep} from "./shared/utils.js";
import {SELECTORS, getElementById, querySelector, querySelectorAll} from "./adapters/selectors.js";
import {adapter} from "./adapters/adapter.js";

// Dependencies injected from core.js
let sendPopupMessage;
let checkWebSocketConnection;

export function hookIntoSDWebUI(sendPopupFn, checkWebSocketFn) {
    // Store dependencies
    sendPopupMessage = sendPopupFn;
    checkWebSocketConnection = checkWebSocketFn;
    const txt2ImgGenerateButton = getElementById(SELECTORS.TXT2IMG_GENERATE);
    txt2ImgGenerateButton.addEventListener("mousedown", onGenerateMousedown);

    const img2ImgGenerateButton = getElementById(SELECTORS.IMG2IMG_GENERATE);
    img2ImgGenerateButton.addEventListener("mousedown", onGenerateMousedown);

    const interruptButton = getElementById(SELECTORS.TXT2IMG_INTERRUPT);
    interruptButton.addEventListener("mousedown", onInterruptMousedown);
    listenInterruptButtonMutations();

    const promptInput = querySelector(SELECTORS.TXT2IMG_PROMPT);
    promptInput.addEventListener("change", onPromptChange);

    const negativePromptInput = querySelector(SELECTORS.TXT2IMG_NEG_PROMPT);
    negativePromptInput.addEventListener("change", onNegativePromptChange);

    const sendToTxt2ImgButton = querySelector(SELECTORS.SEND_TO_TXT2IMG);
    sendToTxt2ImgButton.addEventListener("click", onSendToTxt2ImgButtonClick);
}

function listenInterruptButtonMutations() {
    const txt2imgInterrupt = getElementById(SELECTORS.TXT2IMG_INTERRUPT);
    const img2imgInterrupt = getElementById(SELECTORS.IMG2IMG_INTERRUPT);

    setMutationListener(txt2imgInterrupt);
    setMutationListener(img2imgInterrupt);

    function setMutationListener(element) {
        const config = { attributes: true, attributeFilter: ['style'] };
        const callback = async function(mutationsList, observer) {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    if (mutation.target.style.cssText.includes("display: none"))
                        if (getGenerationState() === "BATCH_GENERATION") {
                            messageBus.publish('BATCH_GENERATION_FINISHED');
                        }
                }
            }
        };

        const observer = new MutationObserver(callback);

        observer.observe(element, config);
    }
}

export function initializePopupPrompts(sendPopupFn) {
    // Use injected dependency if provided (for direct calls)
    const messageSender = sendPopupFn || sendPopupMessage;
    const promptInput = querySelector(SELECTORS.TXT2IMG_PROMPT);
    const negativePromptInput = querySelector(SELECTORS.TXT2IMG_NEG_PROMPT);
    onPromptChange({target: promptInput}, messageSender);
    onNegativePromptChange({target: negativePromptInput}, messageSender);
}

function onGenerateMousedown(e) {
    checkWebSocketConnection();
    setGenerationState("BATCH_GENERATION");
    sendPopupMessage({type: "BEGIN_PROCESSING"});
}

async function onInterruptMousedown(e) {
    // Request to finish current active strategy via message bus
    messageBus.publish('STRATEGY_FINISH_REQUEST');
}

function onPromptChange(e, messageSender) {
    const sender = messageSender || sendPopupMessage;
    sender({type: "PROMPT_CHANGE", text: e.target.value});
}

function onNegativePromptChange(e, messageSender) {
    const sender = messageSender || sendPopupMessage;
    sender({type: "NEGATIVE_PROMPT_CHANGE", text: e.target.value});
}

function onSendToTxt2ImgButtonClick(e) {
    messageBus.publish('EXPLORATION_INVALIDATE');
}

export async function stopGeneration() {
    const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0
    });

    const txt2ImgInterruptButton = getElementById(SELECTORS.TXT2IMG_INTERRUPT);
    const img2ImgInterruptButton = getElementById(SELECTORS.IMG2IMG_INTERRUPT);
    const interruptButton = txt2ImgInterruptButton.offsetParent === null
        ? img2ImgInterruptButton
        : txt2ImgInterruptButton;

    interruptButton.dispatchEvent(mousedownEvent);
    if (adapter.isElementVisible(interruptButton))
        interruptButton.click();

    await sleep(333);

    if (adapter.isElementVisible(interruptButton))
        interruptButton.click();
}

export async function repositionConfigPresetsDropdown(kind) {
    const configPresetsDiv = getElementById(SELECTORS.CONFIG_PRESET_WRAPPER(kind));

    if (configPresetsDiv) {
        const resultsDiv = getElementById(SELECTORS.RESULTS_DIV(kind));

        configPresetsDiv.parentNode.removeChild(configPresetsDiv);
        resultsDiv.insertBefore(configPresetsDiv, resultsDiv.firstChild);
    }
}

export async function setConfigPreset(preset) {
    const presetDropdown = querySelector(SELECTORS.CONFIG_PRESET_TXT2IMG_DROPDOWN);

    if (presetDropdown) {
        if (presetDropdown.value === preset) {
            await adapter.setDropdownValue('CONFIG_PRESET_TXT2IMG_DROPDOWN', "None");
            await sleep(333);
        }

        await adapter.setDropdownValue('CONFIG_PRESET_TXT2IMG_DROPDOWN', preset);
    }
}

export async function setImageSeed(options) {
    if (!options.parameters)
        return;

    const params = options.parameters;

    adapter.setInputValue('TXT2IMG_SEED', params["seed"]);

    if ("variation seed" in params)
        adapter.setInputValue('TXT2IMG_SUBSEED', params["variation seed"]);
}

export async function setImageParams(options) {
    const params = options.parameters;

    if (!params)
        return;

    if ("model" in params)
        await adapter.setDropdownValue('MODEL_CHECKPOINT', params["model"]);

    if ("vae" in params)
        await adapter.setDropdownValue('SD_VAE', params["vae"]);

    if ("prompt" in params)
        adapter.setInputValue('TXT2IMG_PROMPT', params["prompt"]);
    else
        adapter.setInputValue('TXT2IMG_PROMPT', "");

    if ("negative prompt" in params)
        adapter.setInputValue('TXT2IMG_NEG_PROMPT', params["negative prompt"]);
    else
        adapter.setInputValue('TXT2IMG_NEG_PROMPT', "");

    if ("sampler" in params)
        await adapter.setDropdownValue('TXT2IMG_SAMPLING', params["sampler"]);

    if ("schedule type" in params)
        await adapter.setDropdownValue('TXT2IMG_SCHEDULER', params["schedule type"]);

    if ("steps" in params)
        adapter.setInputValue('TXT2IMG_STEPS', params["steps"]);

    if ("cfg scale" in params)
        adapter.setInputValue('TXT2IMG_CFG_SCALE', params["cfg scale"]);

    if ("seed" in params)
        adapter.setInputValue('TXT2IMG_SEED', params["seed"]);

    if ("variation seed" in params) {
        adapter.setInputValue('TXT2IMG_SUBSEED', params["variation seed"]);
        adapter.setInputValue('TXT2IMG_SUBSEED_STRENGTH', params["variation seed strength"]);
    }

    if ("size" in params && params["size"].includes("x")) {
        const sizes = params["size"].split("x");
        adapter.setInputValue('TXT2IMG_WIDTH', sizes[0]);
        adapter.setInputValue('TXT2IMG_HEIGHT', sizes[1]);
    }

    if ("clip skip" in params)
        adapter.setInputValue('CLIP_SKIP', params["clip skip"]);

    if ("denoising strength" in params)
        adapter.setInputValue('TXT2IMG_DENOISING', params["denoising strength"]);

    if ("hires steps" in params)
        adapter.setInputValue('HIRES_SCALE', params["hires steps"]);

    if ("hires upscale" in params) {
        adapter.setInputValue('HIRES_SCALE', params["hires upscale"]);
        adapter.toggleHiresFix(true);
    }
}

export async function saveControlnetImages(generationId) {
    let controlNetThumbs = querySelectorAll(SELECTORS.TXT2IMG_GALLERY);
    controlNetThumbs = Array.from(controlNetThumbs);

    if (controlNetThumbs.length) {
        let controlNetImages = new Set(controlNetThumbs.map(t => t.src));
        controlNetImages = Array.from(controlNetImages);

        const body = {
            generation_id: generationId,
            images: []
        };

        for (const image of controlNetImages) {
            if (image.includes("file=")) {
                let imagePath = image.split("file=").at(-1);
                imagePath = imagePath.replace(/\?.*$/, "");
                body.images.push(imagePath);
            }
        }

        await fetch("/image-bench/save_controlnet_images", {method: "post", body: JSON.stringify(body)});
    }
}
