import {getGenerationState, setGenerationState} from "./state.js";
import {finishProcessing, interruptProcessing} from "./processing.js";
import {interruptExploring} from "./explore.js";
import {setDropdownValue, setInputValue, toggleHiresFix} from "./utils_input.js";
import {checkWebSocketConnection} from "./websocket.js";
import {sendPopupEvent} from "./popup.js";


export function hookIntoSDWebUI() {
    const generateButton = document.getElementById("txt2img_generate");
    generateButton.addEventListener("mousedown", onGenerateMousedown);
    const interruptButton = document.getElementById("txt2img_interrupt");
    interruptButton.addEventListener("mousedown", onInterruptMousedown);
}

export function onGenerateMousedown(e) {
    checkWebSocketConnection();
    setGenerationState("BATCH_GENERATION");
    sendPopupEvent({type: "BEGIN_PROCESSING"});
}

export function onInterruptMousedown(e) {
    const generationState = getGenerationState();

    if (generationState === "HIRES_FIX") {
        interruptProcessing();
    } else if (generationState === "EXPLORE_MODELS") {
        interruptExploring();
    }

    setGenerationState("BATCH_GENERATION");
    finishProcessing();
}

export async function repositionConfigPresetsDropdown(kind) {
    const configPresetsDiv = document.getElementById(`config_preset_wrapper_${kind}`);

    if (configPresetsDiv) {
        const resultsDiv = document.getElementById(`${kind}_results`);

        configPresetsDiv.parentNode.removeChild(configPresetsDiv);
        resultsDiv.insertBefore(configPresetsDiv, resultsDiv.firstChild);
    }
}

export async function setImageSeed(params) {
    if (!params)
        return;

    setInputValue("#txt2img_seed input", params["seed"]);

    if ("variation seed" in params)
        setInputValue("#txt2img_subseed input", params["variation seed"]);
}

export async function setImageParams(params) {
    if (!params)
        return;

    await setDropdownValue("#setting_sd_model_checkpoint input", params["model"]);
    await setDropdownValue("#setting_sd_vae input", params["vae"]);

    setInputValue("#txt2img_prompt textarea", params["prompt"]);
    setInputValue("#txt2img_neg_prompt textarea", params["negative"]);
    await setDropdownValue("#txt2img_sampling input", params["sampler"]);
    await setDropdownValue("#txt2img_scheduler input", params["schedule type"]);
    setInputValue("#txt2img_steps input", params["steps"]);
    setInputValue("#txt2img_cfg_scale input", params["cfg scale"])
    setInputValue("#txt2img_seed input", params["seed"]);
    if ("variation seed" in params) {
        setInputValue("#txt2img_subseed input", params["variation seed"]);
        setInputValue("#txt2img_subseed_strength input", params["variation seed strength"]);
    }
    const sizes = params["size"].split("x");
    setInputValue("#txt2img_width input", sizes[0]);
    setInputValue("#txt2img_height input", sizes[1]);
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