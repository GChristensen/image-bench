import {getGenerationState, setGenerationState} from "./state.js";
import {getInputValue, setDropdownValue, setInputValue, toggleHiresFix} from "./utils_input.js";
import {sendPopupMessage} from "./popup.js";
import {sleep} from "./utils.js";
import {setConfigPreset} from "./sdwebui.js";

let totalImages = 0;
let processingQueue = [];
let setSteps;
let setDenoising;
let stepsBeforeProcessing;
let denoisingBeforeProcessing

export function processingAugmentMessage(msg) {
    if (msg.type === "SAVED_IMAGE" && setSteps) {
        msg.setSteps = true;
    }
}

export function canProcessNextImage(msg) {
    const generationState = getGenerationState();
    return generationState === "HIRES_FIX"
        || generationState === "BATCH_GENERATION" && setSteps;
}

export async function processImages(images, preset, options) {
    setGenerationState(options?.setSteps ? "BATCH_GENERATION" : "HIRES_FIX");
    sendPopupMessage({type: "BEGIN_PROCESSING"});
    totalImages = images.length;
    processingQueue = images;
    setDenoising = options?.setDenoising;
    setSteps = options?.setSteps;
    stepsBeforeProcessing = getInputValue("#txt2img_steps input");
    denoisingBeforeProcessing = getInputValue("#txt2img_denoising_strength input");

    if (preset) {
        await setConfigPreset(preset);
        await sleep(500);
    }

    if (!setSteps)
        toggleHiresFix(true);

    setInputValue("#txt2img_batch_count input[type='number']", 1);

    return processImage(processingQueue.shift());
}

async function processImage(imageData) {
    if (!imageData)
        return;

    const parameters = imageData.parameters;

    setInputValue("#txt2img_seed input", parameters["seed"]);

    if ("variation seed" in parameters)
        setInputValue("#txt2img_subseed input", parameters["variation seed"]);

    if (setDenoising && "denoising strength" in parameters)
        setInputValue("#txt2img_denoising_strength input", parameters["denoising strength"]);

    if (setSteps || imageData.setSteps)
        setInputValue("#txt2img_steps input", parameters["steps"]);

    await sleep(500);

    const generateButton = document.getElementById("txt2img_generate");
    generateButton.click();
}

export function processNextImage() {
    const progress = (1 - processingQueue.length / totalImages) * 100;
    sendPopupMessage({type: "GENERATION_PROGRESS", progress});

    const nextImage = processingQueue.shift();

    if (nextImage)
        return processImage(nextImage);
    else {
        if (!setSteps)
            toggleHiresFix();

        finishProcessing();
    }
}

export function finishProcessing() {
    revertVaryingParams();

    stepsBeforeProcessing = undefined;
    denoisingBeforeProcessing = undefined;
    setDenoising = false;
    setSteps = false;

    sendPopupMessage({type: "GENERATION_FINISHED"});
}

export function revertVaryingParams() {
    if (stepsBeforeProcessing)
        setInputValue("#txt2img_steps input", stepsBeforeProcessing);

    if (denoisingBeforeProcessing)
        setInputValue("#txt2img_denoising_strength input", denoisingBeforeProcessing);
}

export function generateVaryingSteps(image, steps) {
    const stepValues = steps.split(",").map(s => s.trim());

    const images = [];
    for (const stepValue of stepValues) {
        const nextImage = {...image};
        nextImage.parameters = {...image.parameters};
        nextImage.parameters["steps"] = parseInt(stepValue);
        images.push(nextImage);
    }

    return processImages(images, null, {setSteps: true});
}

export function upscaleVaryingDenoising(image, denoising) {
    const denoisingLevels = denoising.split(",").map(s => s.trim());

    const images = [];
    for (const level of denoisingLevels) {
        const nextImage = {...image};
        nextImage.parameters = {...image.parameters};
        nextImage.parameters["denoising strength"] = parseFloat(level);
        images.push(nextImage);
    }

    return processImages(images, null, {setDenoising: true});
}

export function interruptProcessing() {
    if (processingQueue.length)
        processingQueue = [];

    sendPopupMessage({type: "GENERATION_FINISHED"});
}