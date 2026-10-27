import {findImageAction} from "@/imageActions.js";
import {HOST_NAME} from "@/host.js";

/**
 * What the hover card of a tab says (TabHoverCard.vue): its purpose, the fast ways of working with it, with their keys
 * (image action keys from the registry, so they cannot go stale), and its chapter of the manual (MANUAL_SECTIONS)
 */

const keyOf = id => findImageAction(id)?.key;

const STOP_RUN = {text: "Middle click on the tab stops its run, from any tab"};

const TRAY_WAYS = id => [
  {text: "Drop image cards on the tab"},
  {text: "Hover a card and press", key: keyOf(id)},
  {text: "Middle click a card for its action rim"}
];

// By the id of the tab link
export const TAB_HELP = {
  "generate-tab": {title: "Generate", chapter: "generate",
    purpose: `The main generation parameters of ${HOST_NAME}, mirrored both ways, and the Generate button`,
    ways: [
      {text: "Generate or stop, in any tab", key: "Ctrl+Enter"},
      {text: "Restart", key: "Ctrl+Shift+Enter"},
      {text: "Skip the current image", key: "Ctrl+Backspace"}
    ]},
  "controlnet-tab": {title: "ControlNet", chapter: "controlnet",
    purpose: "One ControlNet unit, mirrored both ways, and the sweep of its weight against its ending step",
    ways: [
      {text: "Hover an image card and press", key: keyOf("controlnet")},
      STOP_RUN
    ]},
  "explore-tab": {title: "Explore", chapter: "explore",
    purpose: "One prompt on many checkpoints and LoRAs, the results side by side",
    ways: [STOP_RUN]},
  "generated-images-tab": {title: "Generated", chapter: "generated",
    purpose: "The images of batches, variations and endless generation, as they finish",
    ways: [
      {text: "Middle click a card for its action rim"},
      {text: "Upscale a hovered card", key: keyOf("upscale")},
      {text: "Add it to the image tray", key: keyOf("imageTray")}
    ]},
  "upscaled-images-tab": {title: "Upscaled", chapter: "upscaled",
    purpose: "Upscaled (Hires. fix) versions of the images you choose, kept with the project",
    ways: [
      {text: "Hover a Generated or tray card and press", key: keyOf("upscale")},
      STOP_RUN
    ]},
  "compare-tab": {title: "Compare", chapter: "compare",
    purpose: "Chosen images side by side, and the same region of each of them",
    ways: [
      {text: "Drop image cards on the tab"},
      {text: "Hover a card and press", key: keyOf("compare")}
    ]},
  "concept-tray-tab": {title: "Concept tray", chapter: "trays",
    purpose: "A permanent collection of ideas worth keeping, saved with the project",
    ways: TRAY_WAYS("conceptTray")},
  "image-tray-tab": {title: "Image tray", chapter: "trays",
    purpose: "A permanent collection of the images worth keeping, saved with the project",
    ways: TRAY_WAYS("imageTray")},
  "library-tab": {title: "Library", chapter: "library",
    purpose: "Your Markdown docs, the prompt snippets and this manual",
    ways: []}
};
