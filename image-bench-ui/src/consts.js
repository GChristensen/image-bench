export const KIND_EXPLORE = "explore";
export const KIND_GENERATED = "generated";
export const KIND_UPSCALED = "upscaled";
export const KIND_TRAY = "tray";

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