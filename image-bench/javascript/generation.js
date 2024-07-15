import {getGenerationState, setGenerationState} from "./state.js";
import {sendPopupMessage} from "./popup.js";
import {setInputValue, toggleHiresFix} from "./utils_input.js";
import {createGenerationId, isButtonVisible, sleep} from "./utils.js";
import {getGenerationProgress, saveControlnetImages, setConfigPreset} from "./sdwebui.js";

let generationId;
let isImg2Img;

export async function batchGenerate(options) {
    beginGeneration(options);

    setInputValue("#txt2img_seed input", -1);

    if (options.preset)
        await setConfigPreset(options.preset);
    else
        setInputValue("#txt2img_batch_count input[type='number']", 100);

    toggleHiresFix(false, true);

    await sleep(500);

    const generateButton = document.getElementById("txt2img_generate");
    if (isButtonVisible(generateButton))
        generateButton.click();
}

export function beginGeneration(options) {
    setGenerationState("BATCH_GENERATION");
    sendPopupMessage({type: "BEGIN_PROCESSING"});

    isImg2Img = options.img2img;
    generationId = createGenerationId();
}

export async function finishGeneration() {
    if (!generationId)
        return;

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