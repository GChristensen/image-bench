import {getGenerationState, setGenerationState} from "./state.js";
import {getInputValue, setDropdownValue, setInputValue, toggleHiresFix} from "./utils_input.js";
import {sendPopupMessage} from "./popup.js";
import {createGenerationId, isButtonVisible, sleep} from "./utils.js";
import {getGenerationProgress, saveControlnetImages, setConfigPreset} from "./sdwebui.js";
import {SELECTORS, getElementById} from "./adapters/selectors.js";
import {adapter} from "./adapters/adapter.js";

let generationId;
let totalImages = 0;
let processingQueue = [];
let setSteps;
let setDenoising;
let seedsBeforeProcessing;
let stepsBeforeProcessing;
let denoisingBeforeProcessing
let progressMonitoring;

export function messageSetProcessingParams(msg) {
    const generationState = getGenerationState();

    if (generationState === "HIRES_FIX" || generationState === "SEQUENTIAL_GENERATION") {
        if (msg.type === "SAVED_IMAGE") {
            if (generationId)
                msg.generationId = generationId;

            if (generationState === "SEQUENTIAL_GENERATION" && setSteps)
                msg.setSteps = true;
        }
    }
}

export function isProcessingActive(msg) {
    const generationState = getGenerationState();
    return generationState === "HIRES_FIX"
        || generationState === "SEQUENTIAL_GENERATION";
}

export async function processImages(options) {
    setGenerationState(options?.setSteps ? "SEQUENTIAL_GENERATION" : "HIRES_FIX");
    sendPopupMessage({type: "BEGIN_PROCESSING"});
    generationId = createGenerationId();
    totalImages = options.images.length;
    processingQueue = options.images;
    setDenoising = options.setDenoising;
    setSteps = options.setSteps;
    seedsBeforeProcessing = [
        getInputValue(SELECTORS.TXT2IMG_SEED),
        getInputValue(SELECTORS.TXT2IMG_SUBSEED)
    ];
    stepsBeforeProcessing = getInputValue(SELECTORS.TXT2IMG_STEPS);
    denoisingBeforeProcessing = getInputValue(SELECTORS.TXT2IMG_DENOISING);

    if (options.preset) {
        await setConfigPreset(options.preset);
        await adapter.sleep(500);
    }

    if (getGenerationState() !== "SEQUENTIAL_GENERATION")
        toggleHiresFix(true);

    setInputValue(SELECTORS.TXT2IMG_BATCH_COUNT, 1);

    monitorProgress();

    return processImage(processingQueue.shift());
}

async function processImage(imageData) {
    if (!imageData)
        return;

    const parameters = imageData.parameters;

    setInputValue(SELECTORS.TXT2IMG_SEED, parameters["seed"]);

    if ("variation seed" in parameters)
        setInputValue(SELECTORS.TXT2IMG_SUBSEED, parameters["variation seed"]);

    if (setDenoising && "denoising strength" in parameters)
        setInputValue(SELECTORS.TXT2IMG_DENOISING, parameters["denoising strength"]);

    if (setSteps || imageData.setSteps)
        setInputValue(SELECTORS.TXT2IMG_STEPS, parameters["steps"]);

    await adapter.sleep(500);

    const generateButton = getElementById(SELECTORS.TXT2IMG_GENERATE);
    if (adapter.isElementVisible(generateButton))
        generateButton.click();
}

export function processNextImage() {
    const progress = (1 - processingQueue.length / totalImages) * 100;
    sendPopupMessage({type: "GENERATION_PROGRESS", progress});

    const nextImage = processingQueue.shift();

    if (nextImage)
        return processImage(nextImage);
    else {
        if (getGenerationState() !== "SEQUENTIAL_GENERATION")
            toggleHiresFix();

        return finishProcessing();
    }
}

export async function finishProcessing() {
    if (processingQueue.length)
        processingQueue = [];

    revertVaryingParams();

    const tempGenId = generationId;
    generationId = undefined;
    seedsBeforeProcessing = undefined;
    stepsBeforeProcessing = undefined;
    denoisingBeforeProcessing = undefined;
    setDenoising = false;
    setSteps = false;
    progressMonitoring = false;

    sendPopupMessage({type: "GENERATION_FINISHED"});

    await adapter.sleep(1000);
    await saveControlnetImages(tempGenId);
}

export function revertVaryingParams() {
    if (seedsBeforeProcessing) {
        setInputValue(SELECTORS.TXT2IMG_SEED, seedsBeforeProcessing[0]);
        setInputValue(SELECTORS.TXT2IMG_SUBSEED, seedsBeforeProcessing[1]);
    }

    if (stepsBeforeProcessing)
        setInputValue(SELECTORS.TXT2IMG_STEPS, stepsBeforeProcessing);

    if (denoisingBeforeProcessing)
        setInputValue(SELECTORS.TXT2IMG_DENOISING, denoisingBeforeProcessing);
}

export function generateVaryingSteps(options) {
    const stepValues = options.steps.split(",").map(s => s.trim());

    options.images = [];
    for (const stepValue of stepValues) {
        const nextImage = {...options.image};
        nextImage.parameters = {...options.image.parameters};
        nextImage.parameters["steps"] = parseInt(stepValue);
        options.images.push(nextImage);
    }

    options.setSteps = true;

    return processImages(options);
}

export function upscaleVaryingDenoising(options) {
    const denoisingLevels = options.denoising.split(",").map(s => s.trim());

    options.images = [];
    for (const level of denoisingLevels) {
        const nextImage = {...options.image};
        nextImage.parameters = {...options.image.parameters};
        nextImage.parameters["denoising strength"] = parseFloat(level);
        options.images.push(nextImage);
    }

    options.setDenoising = true;

    return processImages(options);
}

async function monitorProgress() {
    progressMonitoring = true;

    const chunk = 1 / totalImages;

    while (progressMonitoring) {
        await adapter.sleep(1000);

        let progress = (totalImages - processingQueue.length - 1) * chunk * 100;
        const currentProgress = getGenerationProgress();

        if (!isNaN(currentProgress) && currentProgress < 100)
            progress += currentProgress * chunk;

        sendPopupMessage({type: "GENERATION_PROGRESS", progress});
    }
}
