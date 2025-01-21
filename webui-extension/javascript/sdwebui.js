import {getGenerationState, setGenerationState} from "./state.js";
import {finishProcessing, isProcessingActive} from "./processing.js";
import {finishExploring, invalidateExplore} from "./explore.js";
import {setDropdownValue, setInputValue, toggleHiresFix} from "./utils_input.js";
import {checkWebSocketConnection} from "./websocket.js";
import {closePopup, sendPopupMessage} from "./popup.js";
import {isButtonVisible, sleep} from "./utils.js";
import {setupGeneration, finishGeneration} from "./generation.js";

export let isForge = false;

addEventListener("pagehide", () => {
    closePopup();
    fetch("/image-bench/close_websocket", {keepalive: true});
});

export function hookIntoSDWebUI() {
    isForge = !!document.querySelector("[id^='forge']");

    const txt2ImgGenerateButton = document.getElementById("txt2img_generate");
    txt2ImgGenerateButton.addEventListener("mousedown", onGenerateMousedown);

    const img2ImgGenerateButton = document.getElementById("img2img_generate");
    img2ImgGenerateButton.addEventListener("mousedown", onGenerateMousedown);

    const interruptButton = document.getElementById("txt2img_interrupt");
    interruptButton.addEventListener("mousedown", onInterruptMousedown);
    listenInterruptButtonMutations();

    const promptInput = document.querySelector("#txt2img_prompt textarea");
    promptInput.addEventListener("change", onPromptChange);

    const negativePromptInput = document.querySelector("#txt2img_neg_prompt textarea");
    negativePromptInput.addEventListener("change", onNegativePromptChange);

    const sendToTxt2ImgButton = document.querySelector("#tab_pnginfo #txt2img_tab");
    sendToTxt2ImgButton.addEventListener("click", onSendToTxt2ImgButtonClick);
}

function listenInterruptButtonMutations() {
    const txt2imgInterrupt = document.getElementById('txt2img_interrupt');
    const img2imgInterrupt = document.getElementById('img2img_interrupt');

    setMutationListener(txt2imgInterrupt);
    setMutationListener(img2imgInterrupt);

    function setMutationListener(element) {
        const config = { attributes: true, attributeFilter: ['style'] };
        const callback = async function(mutationsList, observer) {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    if (mutation.target.style.cssText.includes("display: none"))
                        if (getGenerationState() === "BATCH_GENERATION") {
                            await finishGeneration();
                            sendPopupMessage({type: "GENERATION_FINISHED"});
                        }
                }
            }
        };

        const observer = new MutationObserver(callback);

        observer.observe(element, config);
    }
}

export function initializePopupPrompts() {
    const promptInput = document.querySelector("#txt2img_prompt textarea");
    const negativePromptInput = document.querySelector("#txt2img_neg_prompt textarea");
    onPromptChange({target: promptInput});
    onNegativePromptChange({target: negativePromptInput});
}

function onGenerateMousedown(e) {
    checkWebSocketConnection();
    setupGeneration({img2img: e.target.id.includes("img2img")});
}

async function onInterruptMousedown(e) {
    const generationState = getGenerationState();

    if (isProcessingActive()) {
        await finishProcessing();
    }
    else if (generationState === "EXPLORE_MODELS") {
        await finishExploring();
    }

    setGenerationState("BATCH_GENERATION");
}

function onPromptChange(e) {
    sendPopupMessage({type: "PROMPT_CHANGE", text: e.target.value});
}

function onNegativePromptChange(e) {
    sendPopupMessage({type: "NEGATIVE_PROMPT_CHANGE", text: e.target.value});
}

function onSendToTxt2ImgButtonClick(e) {
    invalidateExplore();
}

export async function stopGeneration() {
    const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0
    });

    const txt2ImgInterruptButton = document.getElementById("txt2img_interrupt");
    const img2ImgInterruptButton = document.getElementById("img2img_interrupt");
    const interruptButton = txt2ImgInterruptButton.offsetParent === null
        ? img2ImgInterruptButton
        : txt2ImgInterruptButton;

    interruptButton.dispatchEvent(mousedownEvent);
    if (isButtonVisible(interruptButton))
        interruptButton.click();
    await sleep(333);
    if (isButtonVisible(interruptButton))
        interruptButton.click();
}

export async function repositionConfigPresetsDropdown(kind) {
    const configPresetsDiv = document.getElementById(`config_preset_wrapper_${kind}`);

    if (configPresetsDiv) {
        const resultsDiv = document.getElementById(`${kind}_results`);

        configPresetsDiv.parentNode.removeChild(configPresetsDiv);
        resultsDiv.insertBefore(configPresetsDiv, resultsDiv.firstChild);
    }
}

export async function setConfigPreset(preset) {
    const presetDropdown = document.querySelector("#config_preset_txt2img_dropdown input");

    if (presetDropdown) {
        if (presetDropdown.value === preset) {
            await setDropdownValue("#config_preset_txt2img_dropdown input", "None");
            await sleep(333);
        }

        await setDropdownValue("#config_preset_txt2img_dropdown input", preset);
    }
}

export async function setImageSeed(options) {
    if (!options.parameters)
        return;

    const params = options.parameters;

    setInputValue("#txt2img_seed input", params["seed"]);

    if ("variation seed" in params)
        setInputValue("#txt2img_subseed input", params["variation seed"]);
}

export async function setImageParams(options) {
    const params = options.parameters;

    if (!params)
        return;

    if ("model" in params)
        await setDropdownValue("#setting_sd_model_checkpoint input, .model_selection input", params["model"]);

    if ("vae" in params)
        await setDropdownValue("#setting_sd_vae input", params["vae"]);

    if ("prompt" in params)
        setInputValue("#txt2img_prompt textarea", params["prompt"]);
    else
        setInputValue("#txt2img_prompt textarea", "");

    if ("negative prompt" in params)
        setInputValue("#txt2img_neg_prompt textarea", params["negative prompt"]);
    else
        setInputValue("#txt2img_neg_prompt textarea", "");

    if ("sampler" in params)
        await setDropdownValue("#txt2img_sampling input", params["sampler"]);

    if ("schedule type" in params)
        await setDropdownValue("#txt2img_scheduler input", params["schedule type"]);

    if ("steps" in params)
        setInputValue("#txt2img_steps input", params["steps"]);

    if ("cfg scale" in params)
        setInputValue("#txt2img_cfg_scale input", params["cfg scale"]);

    if ("seed" in params)
        setInputValue("#txt2img_seed input", params["seed"]);

    if ("variation seed" in params) {
        setInputValue("#txt2img_subseed input", params["variation seed"]);
        setInputValue("#txt2img_subseed_strength input", params["variation seed strength"]);
    }

    if ("size" in params && params["size"].includes("x")) {
        const sizes = params["size"].split("x");
        setInputValue("#txt2img_width input", sizes[0]);
        setInputValue("#txt2img_height input", sizes[1]);
    }

    if ("clip skip" in params)
        setInputValue("#setting_CLIP_stop_at_last_layers input", params["clip skip"]);

    if ("denoising strength" in params)
        setInputValue("#txt2img_denoising_strength input", params["denoising strength"]);

    if ("hires steps" in params)
        setInputValue("#txt2img_hr_scale input", params["hires steps"]);

    if ("hires upscale" in params) {
        setInputValue("#txt2img_hr_scale input", params["hires upscale"]);
        toggleHiresFix(true);
    }
}

export function getGenerationProgress() {
    const progressBar = document.querySelector(".progressDiv .progress");
    const progressBarText = progressBar?.textContent;
    const matches = progressBarText?.match(/(\d+)%/);

    if (matches)
        return parseInt(matches[1]);
}

export async function saveControlnetImages(generationId) {
    let controlNetThumbs =
        document.querySelectorAll("#txt2img_gallery_container .thumbnails .thumbnail-item img[src*='gradio']");
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