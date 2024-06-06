
export function createImageData(data) {
    const fileURL = "http://" + location.host + "/file=";
    const imageLink = fileURL + encodeURIComponent(data.filename);
    const parameters = data.pnginfo;

    return {imageLink, parameters};
}