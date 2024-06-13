import {sleep} from "./utils.js";
import {setGenerationState} from "./state.js";
import {getInputValue, setDropdownValue, setInputValue} from "./utils_input.js";
import {sendPopupMessage} from "./popup.js";

let totalImages = 0;
let exploreQueue = [];
let exploreModel;
let modelBeforeExplore;

export async function exploreModels(options) {
    if (!options.models.length)
        return;

    setGenerationState("EXPLORE_MODELS");
    sendPopupMessage({type: "BEGIN_PROCESSING"});
    exploreQueue = [];
    exploreModel = options.models[0];
    await setActiveModel(exploreModel.hash);

    setInputValue("#txt2img_batch_count input[type='number']", 1);
    setInputValue("#txt2img_seed input", -1);

    for (const model of options.models) {
        for (let i = 0; i < options.generateImages; ++i) {
            exploreQueue.push(model);
        }
    }

    totalImages = exploreQueue.length;

    modelBeforeExplore = getInputValue("#setting_sd_model_checkpoint input");
    return exploreImage(exploreQueue.shift());
}

async function setActiveModel(modelName) {
    // const optionsURL = `http://${location.host}/sdapi/v1/options`;
    // const opts = await fetch(optionsURL).then(r => r.json());
    //
    // opts.sd_model_checkpoint = modelName;
    // await fetch(optionsURL, {method: "post", body: JSON.stringify(opts), headers: {"content-type": "application/json"}});
    return setDropdownValue("#setting_sd_model_checkpoint input", modelName);
}

async function exploreImage(model) {
    if (!model)
        return;

    if (exploreModel.title !== model.title) {
        await setActiveModel(model.title);
        exploreModel = model;
    }

    await sleep(1000);

    const generateButton = document.getElementById("txt2img_generate");
    generateButton.click();
}

export function exploreNextImage() {
    const progress = (1 - exploreQueue.length / totalImages) * 100;
    sendPopupMessage({type: "GENERATION_PROGRESS", progress});

    const model = exploreQueue.shift();

    if (model)
        return exploreImage(model);
    else
        return finishExploring();
}

export async function finishExploring() {
    if (exploreQueue.length)
        exploreQueue = [];

    if (modelBeforeExplore) {
        await setDropdownValue("#setting_sd_model_checkpoint input", modelBeforeExplore);
        modelBeforeExplore = null;
    }

    sendPopupMessage({type: "GENERATION_FINISHED"});
}