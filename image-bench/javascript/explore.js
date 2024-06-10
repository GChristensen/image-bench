import {sleep} from "./utils.js";
import {setGenerationState} from "./state.js";
import {setDropdownValue, setInputValue} from "./utils_input.js";
import {sendPopupMessage} from "./popup.js";

let totalImages = 0;
let exploreQueue = [];
let exploreModel;

export async function exploreModels(models, generateImages) {
    if (!models.length)
        return;

    setGenerationState("EXPLORE_MODELS");
    sendPopupMessage({type: "BEGIN_PROCESSING"});
    exploreQueue = [];
    exploreModel = models[0];
    await setActiveModel(exploreModel.hash);

    setInputValue("#txt2img_batch_count input[type='number']", 1);
    setInputValue("#txt2img_seed input", -1);

    for (const model of models) {
        for (let i = 0; i < generateImages; ++i) {
            exploreQueue.push(model);
        }
    }

    totalImages = exploreQueue.length;

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

    if (exploreModel.hash !== model.hash) {
        await setActiveModel(model.hash);
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
        sendPopupMessage({type: "GENERATION_FINISHED"});
}

export function interruptExploring() {
    if (exploreQueue.length)
        exploreQueue = [];

    sendPopupMessage({type: "GENERATION_FINISHED"});
}