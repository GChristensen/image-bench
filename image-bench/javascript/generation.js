import {setGenerationState} from "./state.js";
import {sendPopupMessage} from "./popup.js";
import {setDropdownValue, setInputValue, toggleHiresFix} from "./utils_input.js";
import {sleep} from "./utils.js";
import {getGenerationProgress, setConfigPreset} from "./sdwebui.js";

export async function batchGenerate(preset) {
    setGenerationState("BATCH_GENERATION");
    sendPopupMessage({type: "BEGIN_PROCESSING"});

    setInputValue("#txt2img_seed input", -1);

    if (preset)
        await setConfigPreset(preset);
    else
        setInputValue("#txt2img_batch_count input[type='number']", 100);

    toggleHiresFix(false, true);

    await sleep(500);

    const generateButton = document.getElementById("txt2img_generate");
    generateButton.click();
}

export function generationAugmentMessage(msg) {
    if (msg.type === "SAVED_IMAGE") {
        msg.progress = getGenerationProgress();
    }
}