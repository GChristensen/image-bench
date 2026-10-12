const colors = ["#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6",
  "#bfef45", "#fabed4", "#469990", "#dcbeff", "#9A6324", "#800000", "#aaffc3", "#808000", "#ffd8b1"];

// Strategy generationId spans the whole Image Bench run (several ComfyUI prompts),
// batchId identifies a single platform generation (including native Generate clicks)
function getBatchKey(image) {
  return image.generationId || image.batchId;
}

// The color of the image's batch among the images, or the next color after the last used one
export function pickTagColor(images, imageData) {
  const batchKey = getBatchKey(imageData);

  if (batchKey) {
    const batchImage = images.findLast(i => i.tagColor && getBatchKey(i) === batchKey);

    if (batchImage)
      return batchImage.tagColor;
  }

  const lastColorIndex = colors.indexOf(images.findLast(i => i.tagColor)?.tagColor);
  return colors[(lastColorIndex + 1) % colors.length];
}
