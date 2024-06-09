import {setGenerationState} from "./state.js";
import {sendPopupEvent} from "./popup.js";
import {setDropdownValue, setInputValue} from "./utils_input.js";
import {sleep} from "./utils.js";

export async function batchGenerate(preset) {
    setGenerationState("BATCH_GENERATION");
    sendPopupEvent({type: "BEGIN_PROCESSING"});

    setInputValue("#txt2img_seed input", -1);

    if (preset)
        await setDropdownValue("#config_preset_txt2img_dropdown input", preset);

    await sleep(500);

    const generateButton = document.getElementById("txt2img_generate");
    generateButton.click();
}