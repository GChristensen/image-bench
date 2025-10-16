import {getGenerationState, setGenerationState} from "./state.js";
import {sendPopupMessage} from "./popup.js";
import {setCheckBoxValue, setInputValue, toggleHiresFix} from "./utils_input.js";
import {createGenerationId, isButtonVisible, sleep} from "./utils.js";
import {getGenerationProgress, saveControlnetImages, setConfigPreset} from "./sdwebui.js";
import {SELECTORS, getElementById} from "./adapters/selectors.js";
import {adapter} from "./adapters/adapter.js";

let generationId;
let isImg2Img;
let isVariations;

export async function batchGenerate(options, config) {
    setupGeneration(options);

    setInputValue(SELECTORS.TXT2IMG_SEED, -1);

    return beginGeneration(options, config);
}

export async function generateVariations(options, config) {
    isVariations = true;
    setupGeneration(options);

    setCheckBoxValue(SELECTORS.TXT2IMG_SUBSEED_SHOW, true);
    setInputValue(SELECTORS.TXT2IMG_SUBSEED, -1);
    setInputValue(SELECTORS.TXT2IMG_SUBSEED_STRENGTH, options.strength);

    return beginGeneration(options, config);
}

export function setupGeneration(options) {
    setGenerationState("BATCH_GENERATION");
    sendPopupMessage({type: "BEGIN_PROCESSING"});

    isImg2Img = options.img2img;
    generationId = createGenerationId();
}

async function beginGeneration(options, config) {
    const txt2ImgGenerateButton = getElementById(SELECTORS.TXT2IMG_GENERATE);
    const img2ImgGenerateButton = getElementById(SELECTORS.IMG2IMG_GENERATE);
    const isImg2ImgTab = adapter.isImg2ImgTab();

    if (options.preset && !isImg2ImgTab)
        await setConfigPreset(options.preset);
    else {
        if (isImg2ImgTab)
            setInputValue(SELECTORS.IMG2IMG_BATCH_COUNT, config.defaultBatches || 100);
        else
            setInputValue(SELECTORS.TXT2IMG_BATCH_COUNT, config.defaultBatches || 100);
    }

    let generateButton;

    if (isImg2ImgTab) {
        generateButton = img2ImgGenerateButton;
    }
    else {
        generateButton = txt2ImgGenerateButton;
        toggleHiresFix(false, true);
    }

    await adapter.sleep(500);

    if (adapter.isElementVisible(generateButton))
        generateButton.click();
}

export async function finishGeneration() {
    if (!generationId)
        return;

    const isImg2ImgTab = adapter.isImg2ImgTab();

    if (isImg2ImgTab)
        setInputValue(SELECTORS.IMG2IMG_BATCH_COUNT, 1);
    else
        setInputValue(SELECTORS.TXT2IMG_BATCH_COUNT, 1);

    if (isVariations) {
        isVariations = false;
        setInputValue(SELECTORS.TXT2IMG_SUBSEED_STRENGTH, 0);
        setCheckBoxValue(SELECTORS.TXT2IMG_SUBSEED_SHOW, false);
    }

    const tempGenId = generationId;
    generationId = null;
    isImg2Img = false;

    await adapter.sleep(1000);
    await saveControlnetImages(tempGenId);
}

export function messageSetGenerationParams(msg) {
    if (msg.type === "SAVED_IMAGE" && getGenerationState() === "BATCH_GENERATION") {
        msg.progress = getGenerationProgress();
        msg.generationId = generationId;

        if (isImg2Img)
            msg.img2img = true;
    }
}
