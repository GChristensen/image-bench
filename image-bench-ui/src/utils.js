
export function createImageData(data) {
    return {...data};
}

export function createImageLink(imagePath) {
    return "http://" + location.host + "/file=" + imagePath;
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

export function animateColors(element, duration) {
    const originalBgColor = window.getComputedStyle(element).backgroundColor;
    const originalTextColor = window.getComputedStyle(element).color;

    const keyframes = `
        @keyframes colorAnimation {
            0% {
                background-color: ${originalBgColor};
                color: ${originalTextColor};
            }
            50% {
                background-color: white;
                color: black;
            }
            100% {
                background-color: ${originalBgColor};
                color: ${originalTextColor};
            }
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = keyframes;
    document.head.appendChild(styleSheet);

    element.style.animation = `colorAnimation ${duration}s forwards`;

    setTimeout(() => {
        document.head.removeChild(styleSheet);
    }, duration * 1000);
}