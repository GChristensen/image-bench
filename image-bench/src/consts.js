export const KIND_EXPLORE = "explore";
export const KIND_GENERATED = "generated";
export const KIND_UPSCALED = "upscaled";
export const KIND_IMAGE_TRAY = "image_tray";
export const KIND_CONCEPT_TRAY = "concept_tray";
export const KIND_COMPARE = "compare";
// The session filmstrip of the Generate tab
export const KIND_SESSION = "session";
// The weight x ending step matrix of the ControlNet tab
export const KIND_CONTROLNET_SWEEP = "controlnet_sweep";

export const MARKINGS = ["👍", "👎", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🏁"];

export function generationStateToKind(generationState) {
    switch (generationState) {
        case "BATCH_GENERATION":
        case "SEQUENTIAL_GENERATION":
            return KIND_GENERATED;
        case "HIRES_FIX":
            return KIND_UPSCALED;
        case "EXPLORE_MODELS":
            return KIND_EXPLORE;
        case "CONTROLNET_SWEEP":
            return KIND_CONTROLNET_SWEEP;
    }
}
// Selectable accent colors: base, hover, text on accent background, and RGB triplet for translucent variants
export const ACCENT_COLORS = {
    orange: {name: "Orange", accent: "#f97316", hover: "#fb8a3c", ink: "#1a0b00", rgb: "249, 115, 22"},
    amethyst: {name: "Amethyst", accent: "#bb7ff1", hover: "#ca9bf5", ink: "#14061f", rgb: "187, 127, 241"},
    green: {name: "Green", accent: "#2cbf8a", hover: "#3ad39b", ink: "#05150e", rgb: "44, 191, 138"},
    blue: {name: "Light Blue", accent: "#38bdf8", hover: "#5ccbfa", ink: "#03141d", rgb: "56, 189, 248"},
};
export const DEFAULT_ACCENT_COLOR = "orange";

// Forge UI presets shown as buttons in the Generate tab by default (configurable in the settings);
// the other presets of the WebUI are in the menu next to them
export const DEFAULT_GENERATE_UI_PRESETS = ["xl", "anima", "krea", "klein"];

// Forge and Forge Neo UI presets, offered in the settings before the WebUI reports its own
export const KNOWN_UI_PRESETS = ["sd", "xl", "flux", "klein", "qwen", "lumina", "zit", "wan", "anima", "ernie", "pid",
    "krea", "all"];

// Shortened button labels of UI presets
export const UI_PRESET_LABELS = {anima: "ani", lumina: "lum", ernie: "ern"};

// Images generated when the preset count button of the Generate tab is used (configurable in the settings)
export const DEFAULT_GENERATE_PRESET_IMAGES = 128;

// Image sizes offered in the Generate tab, grouped by megapixels (the same aspect ratios in each grade),
// then by the models they are meant for;
// grade: a megapixel grade, listed above the model groups; column: 1 lists the group in the right column of the
// size list (else the left one), in this order;
// note: the aspect ratio and/or a remark, ratios are flipped with the size in the portrait orientation;
// noBucket: a ratio that is no training bucket of any model (marked in every grade)
export const SIZE_PRESET_GROUPS = [
    {name: "1 MP", grade: true, column: 1, sizes: [
        {width: 1024, height: 1024, note: "1:1"},
        {width: 1152, height: 896, note: "9:7"},
        {width: 1152, height: 864, note: "4:3"},
        {width: 1216, height: 864, note: "A4", noBucket: true},
        {width: 1216, height: 832, note: "19:13"},
        {width: 1248, height: 832, note: "3:2"},
        {width: 1344, height: 768, note: "7:4"},
        {width: 1280, height: 720, note: "16:9"},
        {width: 1536, height: 640, note: "12:5"}
    ]},
    {name: "2 MP", grade: true, column: 1, sizes: [
        {width: 1440, height: 1440, note: "1:1"},
        {width: 1648, height: 1280, note: "9:7"},
        {width: 1664, height: 1248, note: "4:3"},
        {width: 1696, height: 1200, note: "A4", noBucket: true},
        {width: 1728, height: 1184, note: "19:13"},
        {width: 1776, height: 1184, note: "3:2"},
        {width: 1904, height: 1088, note: "7:4"},
        {width: 1936, height: 1088, note: "16:9"},
        {width: 2224, height: 928, note: "12:5"}
    ]},
    {name: "0.5 MP", grade: true, sizes: [
        {width: 720, height: 720, note: "1:1"},
        {width: 800, height: 624, note: "9:7"},
        {width: 832, height: 624, note: "4:3"},
        {width: 864, height: 608, note: "A4", noBucket: true},
        {width: 864, height: 592, note: "19:13"},
        {width: 864, height: 576, note: "3:2"},
        {width: 976, height: 560, note: "7:4"},
        {width: 960, height: 544, note: "16:9"},
        {width: 1120, height: 464, note: "12:5"}
    ]},
    {name: "0.25 MP", grade: true, sizes: [
        {width: 512, height: 512, note: "1:1"},
        {width: 576, height: 448, note: "9:7"},
        {width: 576, height: 432, note: "4:3"},
        {width: 608, height: 432, note: "A4", noBucket: true},
        {width: 608, height: 416, note: "19:13"},
        {width: 624, height: 416, note: "3:2"},
        {width: 672, height: 384, note: "7:4"},
        {width: 688, height: 384, note: "16:9"},
        {width: 768, height: 320, note: "12:5"}
    ]},
    {name: "Z-Image", sizes: [
        {width: 1344, height: 576, note: "21:9"},
        {width: 2048, height: 1152, note: "16:9 2K"}
    ]},
    {name: "Qwen-Image", sizes: [
        {width: 1328, height: 1328, note: "1:1"},
        {width: 1472, height: 1104, note: "4:3"},
        {width: 1584, height: 1056, note: "3:2"},
        {width: 1664, height: 928, note: "16:9"}
    ]},
    {name: "Qwen-Image-2.1", column: 1, sizes: [
        {width: 1536, height: 864, note: "16:9"},
        {width: 2400, height: 1792, note: "4:3"},
        {width: 2528, height: 1696, note: "3:2"},
        {width: 2752, height: 1536, note: "16:9"}
    ]},
    {name: "Ideogram 4", sizes: [
        {width: 1536, height: 1024, note: "3:2"}
    ]},
    {name: "WAN 2.2", column: 1, sizes: [
        {width: 1280, height: 704, note: "20:11 5B"},
        {width: 832, height: 480, note: "16:9 480p"}
    ]}
];
