export function createImageData(data) {
    return {...data};
}

export function createImageLink(image) {
    return image?.imageUrl;
}

export function createImageGenerationParams(image) {
    let parametersText = `Prompt:
${image.parameters["prompt"]}

Negative prompt:
${image.parameters["negative prompt"]}

`;

    const keys = Object.keys(image.parameters);

    for (const key of keys.slice(2, keys.length)) {
        const value = image.parameters[key];

        if (typeof value === "object") {
            parametersText += key.charAt(0).toUpperCase() + key.slice(1) + ":\n";
            const subKeys = Object.keys(value);

            for (const subKey of subKeys) {
                const subValue = value[subKey];
                parametersText += "  " + subKey.charAt(0).toUpperCase() + subKey.slice(1) + ": " + subValue + "\n";
            }
        }
        else
            parametersText += key.charAt(0).toUpperCase() + key.slice(1) + ": " + value + "\n";

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