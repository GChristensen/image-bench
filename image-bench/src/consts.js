export const KIND_EXPLORE = "explore";
export const KIND_GENERATED = "generated";
export const KIND_UPSCALED = "upscaled";
export const KIND_IMAGE_TRAY = "image_tray";
export const KIND_CONCEPT_TRAY = "concept_tray";

export const MARKINGS = ["👍", "👎", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣"];

export function generationStateToKind(generationState) {
    switch (generationState) {
        case "BATCH_GENERATION":
        case "SEQUENTIAL_GENERATION":
            return KIND_GENERATED;
        case "HIRES_FIX":
            return KIND_UPSCALED;
        case "EXPLORE_MODELS":
            return KIND_EXPLORE;
    }
}