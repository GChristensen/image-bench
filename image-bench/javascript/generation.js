import {getGenerationState, setGenerationState} from "./state.js";
import {sendPopupMessage} from "./popup.js";
import {setCheckBoxValue, setInputValue, toggleHiresFix} from "./utils_input.js";
import {createGenerationId, isButtonVisible, sleep} from "./utils.js";
import {getGenerationProgress, saveControlnetImages, setConfigPreset} from "./sdwebui.js";

let generationId;
let isImg2Img;
let isVariations;

export async function batchGenerate(options, config) {
    setupGeneration(options);

    setInputValue("#txt2img_seed input", -1);

    return beginGeneration(options, config);
}

export async function generateVariations(options, config) {
    isVariations = true;
    setupGeneration(options);

    setCheckBoxValue("#txt2img_subseed_show input", true);
    setInputValue("#txt2img_subseed input", -1);
    setInputValue("#txt2img_subseed_strength input", options.strength);

    return beginGeneration(options, config);
}

export function setupGeneration(options) {
    setGenerationState("BATCH_GENERATION");
    sendPopupMessage({type: "BEGIN_PROCESSING"});

    isImg2Img = options.img2img;
    generationId = createGenerationId();
}

async function beginGeneration(options, config) {
    const txt2ImgGenerateButton = document.getElementById("txt2img_generate");
    const img2ImgGenerateButton = document.getElementById("img2img_generate");
    const isImg2ImgTab = txt2ImgGenerateButton.offsetParent === null;

    if (options.preset && !isImg2ImgTab)
        await setConfigPreset(options.preset);
    else {
        if (isImg2ImgTab)
            setInputValue("#img2img_batch_count input[type='number']", config.defaultBatches || 100);
        else
            setInputValue("#txt2img_batch_count input[type='number']", config.defaultBatches || 100);
    }

    let generateButton;

    if (isImg2ImgTab) {
        generateButton = img2ImgGenerateButton;
    }
    else {
        generateButton = txt2ImgGenerateButton;
        toggleHiresFix(false, true);
    }

    await sleep(500);

    if (isButtonVisible(generateButton))
        generateButton.click();
}

export async function finishGeneration() {
    if (!generationId)
        return;

    const txt2ImgGenerateButton = document.getElementById("txt2img_generate");
    const isImg2ImgTab = txt2ImgGenerateButton.offsetParent === null;

    if (isImg2ImgTab)
        setInputValue("#img2img_batch_count input[type='number']", 1);
    else
        setInputValue("#txt2img_batch_count input[type='number']", 1);

    if (isVariations) {
        isVariations = false;
        setInputValue("#txt2img_subseed_strength input", 0);
        setCheckBoxValue("#txt2img_subseed_show input", false);
    }

    const tempGenId = generationId;
    generationId = null;
    isImg2Img = false;

    await sleep(1000);
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