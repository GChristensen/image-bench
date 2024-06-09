
export function createImageData(data) {
    return {...data};
}

export function createImageLink(imagePath) {
    return "/file=" + imagePath;
}

export function createImageGenerationParams(image) {
    let parametersText = `Prompt:
${image.parameters["prompt"]}

Negative prompt:
${image.parameters["negative"]}

`;

    const keys = Object.keys(image.parameters);

    for (const key of keys.slice(2, keys.length)) {
        parametersText += key.charAt(0).toUpperCase() + key.slice(1) + ": " + image.parameters[key] + "\n";
    }

    return parametersText;
}

export function isImg2Img(imageData) {
    let imagePath;
    if (typeof imageData === "object")
        imagePath = imageData.imagePath;
    else
        imagePath = imageData;

    return imagePath.includes("img2img-images");
}

export function getGenerationState() {
    return window.getGenerationState()
}

export function sendWebUIMessage(msg) {
    return window.opener.postMessage(msg);
}