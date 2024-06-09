import {createImageData} from "@/sdwebui.js";

export function addImage(eventData, images) {
    if (eventData.type === "SAVED_IMAGE")
        insertImage(eventData, images);
    else if (eventData.type === "BEGIN_PROCESSING" && images.value.length)
        insertSeparator(images);
}

export function insertImage(eventData, images) {
    const imageData = createImageData(eventData);

    delete imageData.type;
    images.value.push(imageData);
}

function insertSeparator(images) {
    images.value.push({separator: true});
}
