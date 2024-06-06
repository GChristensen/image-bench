
export function createImageData(data) {
    const imagePath = data.filename;
    const parameters = data.pnginfo;

    return {imagePath, parameters};
}

export function createImageLink(imagePath) {
    return "http://" + location.host + "/file=" + encodeURIComponent(imagePath);
}