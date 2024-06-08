
export function createImageData(data) {
    const imagePath = data.filename;
    const parameters = data.pnginfo;

    return {imagePath, parameters};
}

export function createImageLink(imagePath) {
    return "http://" + location.host + "/file=" + encodeURIComponent(imagePath);
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