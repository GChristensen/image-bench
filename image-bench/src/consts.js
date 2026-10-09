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
// Selectable accent colors: base, hover, text on accent background, and RGB triplet for translucent variants
export const ACCENT_COLORS = {
    orange: {name: "Orange", accent: "#f97316", hover: "#fb8a3c", ink: "#1a0b00", rgb: "249, 115, 22"},
    amethyst: {name: "Amethyst", accent: "#af69ee", hover: "#bf85f2", ink: "#14061f", rgb: "175, 105, 238"},
    green: {name: "Green", accent: "#2cbf8a", hover: "#3ad39b", ink: "#05150e", rgb: "44, 191, 138"},
    blue: {name: "Light Blue", accent: "#38bdf8", hover: "#5ccbfa", ink: "#03141d", rgb: "56, 189, 248"},
};
export const DEFAULT_ACCENT_COLOR = "green";
