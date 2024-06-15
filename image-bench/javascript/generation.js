import {getGenerationState, setGenerationState} from "./state.js";
import {sendPopupMessage} from "./popup.js";
import {setInputValue, toggleHiresFix} from "./utils_input.js";
import {createGenerationId, sleep} from "./utils.js";
import {getGenerationProgress, setConfigPreset} from "./sdwebui.js";

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

    let controlNetThumbs =
        document.querySelectorAll("#txt2img_gallery_container .thumbnails .thumbnail-item img[src*='gradio']");
    controlNetThumbs = Array.from(controlNetThumbs);

    if (controlNetThumbs.length) {
        let controlNetImages = new Set(controlNetThumbs.map(t => t.src));
        controlNetImages = Array.from(controlNetImages);

        const body = {
            generation_id: generationId,
            images: []
        };

        for (const image of controlNetImages) {
            if (image.includes("file=")) {
                let imagePath = image.split("file=").at(-1);
                imagePath = imagePath.replace(/\?.*$/, "");
                body.images.push(imagePath);
            }
        }

        await fetch("/image-bench/save_controlnet_images", {method: "post", body: JSON.stringify(body)});
    }

    generationId = null;
    isImg2Img = false;
}

export function messageSetGenerationParams(msg) {
    if (msg.type === "SAVED_IMAGE" && getGenerationState() === "BATCH_GENERATION") {
        msg.progress = getGenerationProgress();
        msg.generationId = generationId;

        if (isImg2Img)
            msg.img2img = true;
    }
}