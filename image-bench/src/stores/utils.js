import {createImageData} from "@/sdwebui.js";

export function addImage(eventData, images) {
    if (eventData.type === "SAVED_IMAGE") {
        insertImage(eventData, images);
    } else if (eventData.type === "BEGIN_PROCESSING") {
        // An interrupted run leaves its separator without images: reuse it
        let isInsertSeparator = !!images.value.length && !images.value.at(-1).separator;

        if (import.meta.env.MODE === "comfy")
            isInsertSeparator &&= !eventData.isBatchGeneration;

        if (isInsertSeparator)
            insertSeparator(images);
    }
}

export function insertImage(eventData, images) {
    const imageData = createImageData(eventData);

    delete imageData.type;
    images.value.push(imageData);
}

function insertSeparator(images) {
    images.value.push({separator: true});
}

export function isImageEvent(e) {
    return e.type === "SAVED_IMAGE" || e.type === "BEGIN_PROCESSING";
}
