/**
 * JSON layout prompts of the models that place subjects and text by bounding boxes (Ideogram 4, MOSS-Image), read
 * into one layout and written back for the model. The layout is independent of the model and the image size: boxes
 * are fractions of the image {x, y, w, h} from the top left, as in compare/compareGeometry.js.
 *
 *   Ideogram 4: {high_level_description, style_description, compositional_deconstruction: {background, elements}},
 *     bbox [y_min, x_min, y_max, x_max] normalized 0-1000, keys in the order of the official caption schema
 *   MOSS-Image: {summary: {meta, canvas, caption, palette}, items, bbox_coord_space: "abs_centralized",
 *     bbox_format: "yxyx"}, bbox in pixels from the image center, so it is written for one size
 *
 * The JSON is the part of the prompt from its first "{" to its last "}"; the rest (the <lora:...> tags of the LoRA
 * list) is kept around it.
 */

export const LAYOUT_MODELS = [
  {id: "ideogram4", label: "Ideogram 4", match: ["ideogram"], kinds: ["obj", "text"], maxPalette: 16, maxItemPalette: 5},
  {id: "moss", label: "MOSS-Image", match: ["moss"], kinds: ["obj", "character", "text"]}
];

export const KIND_LABELS = {obj: "Object", character: "Character", text: "Text"};

export const MOSS_CANVASES = ["single", "multi_panel", "collage"];

const MAX_COORD = 1000;
const LORA_TAG = /<lora:[^>]*>/gi;
const HEX_COLOR = /^#[0-9A-F]{6}$/;

export const layoutModel = id => LAYOUT_MODELS.find(model => model.id === id) ?? null;

/**
 * The layout model of a checkpoint (file name, case-insensitive) or else of the WebUI UI preset
 * @param {{checkpoint?: string, uiPreset?: string}} params
 * @returns {Object|null} - an entry of LAYOUT_MODELS
 */
export function detectLayoutModel({checkpoint, uiPreset}) {
  const matches = text => LAYOUT_MODELS.find(model => model.match.some(part => text.includes(part)));
  return matches(String(checkpoint ?? "").toLowerCase()) ?? matches(String(uiPreset ?? "").toLowerCase()) ?? null;
}

export function emptyLayout() {
  return {
    caption: "",
    background: "",
    style: {kind: "art", aesthetics: "", lighting: "", photo: "", medium: "", artStyle: ""},
    meta: [],
    canvas: "single",
    palette: [],
    items: []
  };
}

export function newItem(kind, box) {
  return {kind, box, caption: "", text: kind === "text" ? "" : undefined, palette: [], tags: []};
}

export const normalizeColor = value => {
  const hex = String(value ?? "").trim().toUpperCase().replace(/^#?/, "#");
  return HEX_COLOR.test(hex) ? hex : null;
};

/**
 * The prompt split into its JSON and the text around it
 * @returns {{kind: "empty"|"json"|"text", json: string, before: string, after: string, text: string}} - text: the
 *   prompt without LoRA tags
 */
export function splitPrompt(prompt) {
  prompt = prompt ?? "";
  const text = prompt.replace(LORA_TAG, "").replace(/^[\s,]+|[\s,]+$/g, "");

  if (!text)
    return {kind: "empty", json: "", before: "", after: prompt.trim() ? ` ${prompt.trim()}` : "", text};

  const start = prompt.indexOf("{");
  const end = prompt.lastIndexOf("}");

  if (!text.startsWith("{") || end < start)
    return {kind: "text", json: "", before: "", after: tagsOf(prompt), text};

  return {kind: "json", json: prompt.slice(start, end + 1), before: prompt.slice(0, start),
          after: prompt.slice(end + 1), text};
}

function tagsOf(prompt) {
  const tags = prompt.match(LORA_TAG) ?? [];
  return tags.length ? `, ${tags.join(", ")}` : "";
}

export const joinPrompt = (json, {before, after}) => `${before}${json}${after}`;

/**
 * Read a JSON layout prompt of either model
 * @param {string} json
 * @param {{width: number, height: number}} size - The image size (MOSS boxes are pixels)
 * @returns {{model: string, layout: Object, outOfCanvas?: boolean} | {error: string}}
 */
export function parseLayout(json, size) {
  let data;

  try {
    data = JSON.parse(json);
  }
  catch (error) {
    return {error: `The prompt is not valid JSON: ${error.message}`};
  }

  if (!isObject(data))
    return {error: "The prompt is not a JSON object."};

  try {
    if ("compositional_deconstruction" in data)
      return {model: "ideogram4", layout: readIdeogram(data)};

    if ("summary" in data || "items" in data)
      return {model: "moss", ...readMoss(data, size)};
  }
  catch (error) {
    return {error: error.message};
  }

  return {error: "The JSON is not a layout of Ideogram 4 (compositional_deconstruction) or MOSS-Image (summary, items)."};
}

/**
 * Write the layout as the compact JSON prompt of the model
 */
export function writeLayout(model, layout, size) {
  return JSON.stringify(layoutData(model, layout, size));
}

/**
 * The JSON object of the prompt
 */
export function layoutData(model, layout, size) {
  return model === "moss" ? writeMoss(layout, size) : writeIdeogram(layout);
}

/**
 * The prompt's JSON indented, cut into pieces: the elements (with the index of their layout item) and the text
 * between them
 * @returns {Array<{text: string, item?: number}>}
 */
export function prettyLayout(model, layout, size) {
  const data = layoutData(model, layout, size);
  const text = JSON.stringify(data, null, 2);
  const moss = model === "moss";
  const elements = moss ? data.items : data.compositional_deconstruction.elements;
  // MOSS leaves out the items without a box
  const items = layout.items.map((item, index) => index).filter(index => !moss || layout.items[index].box);
  // Elements are at depth 3 (Ideogram: compositional_deconstruction.elements) or 2 (MOSS: items)
  const indent = " ".repeat(moss ? 4 : 6);
  const pieces = [];
  let position = 0;

  elements.forEach((element, index) => {
    const elementText = indent + JSON.stringify(element, null, 2).replace(/\n/g, `\n${indent}`);
    const start = text.indexOf(elementText, position);

    if (start < 0)
      return;

    pieces.push({text: text.slice(position, start)}, {text: elementText, item: items[index]});
    position = start + elementText.length;
  });

  pieces.push({text: text.slice(position)});
  return pieces;
}

/**
 * The layout of another model's prompt for this one: MOSS has no background field, so it goes into the caption
 */
export function convertLayout(layout, from, to) {
  if (from === to)
    return layout;

  const converted = {...layout, items: layout.items.map(item => ({...item}))};

  if (to === "moss" && layout.background.trim()) {
    converted.caption = [layout.caption.trim(), layout.background.trim()].filter(Boolean).join(" ");
    converted.background = "";
  }

  if (to === "ideogram4")
    for (const item of converted.items)
      if (item.kind === "character")
        item.kind = "obj";

  return converted;
}

/**
 * Boxes moved into the image, each axis scaled around the center by the extent of all boxes: for a MOSS layout
 * written for a larger image
 */
export function scaleIntoCanvas(layout) {
  const boxes = layout.items.map(item => item.box).filter(Boolean);
  const extentX = Math.max(0.5, ...boxes.flatMap(box => [Math.abs(box.x - 0.5), Math.abs(box.x + box.w - 0.5)]));
  const extentY = Math.max(0.5, ...boxes.flatMap(box => [Math.abs(box.y - 0.5), Math.abs(box.y + box.h - 0.5)]));
  const scaleX = 0.5 / extentX;
  const scaleY = 0.5 / extentY;

  return {
    ...layout,
    items: layout.items.map(item => !item.box ? item : {...item, box: {
      x: 0.5 + (item.box.x - 0.5) * scaleX, y: 0.5 + (item.box.y - 0.5) * scaleY,
      w: item.box.w * scaleX, h: item.box.h * scaleY
    }})
  };
}

// ---------- Ideogram 4 ----------

function readIdeogram(data) {
  const layout = emptyLayout();
  const composition = data.compositional_deconstruction;

  if (!isObject(composition))
    throw new Error("compositional_deconstruction must be an object.");

  layout.caption = str(data.high_level_description);
  layout.background = str(composition.background);

  const style = data.style_description;

  if (style !== undefined) {
    if (!isObject(style))
      throw new Error("style_description must be an object.");

    layout.style = {
      kind: "photo" in style ? "photo" : "art",
      aesthetics: str(style.aesthetics), lighting: str(style.lighting), photo: str(style.photo),
      medium: "photo" in style ? "" : str(style.medium), artStyle: str(style.art_style)
    };
    layout.palette = colors(style.color_palette);
  }

  const elements = composition.elements ?? [];

  if (!Array.isArray(elements))
    throw new Error("compositional_deconstruction.elements must be an array.");

  layout.items = elements.map((element, index) => {
    if (!isObject(element) || (element.type !== "obj" && element.type !== "text"))
      throw new Error(`Element ${index + 1}: type must be "obj" or "text".`);

    return {
      ...newItem(element.type, element.bbox === undefined ? null : normalizedBox(element.bbox, index)),
      caption: str(element.desc),
      text: element.type === "text" ? str(element.text) : undefined,
      palette: colors(element.color_palette)
    };
  });

  return layout;
}

function normalizedBox(bbox, index) {
  if (!isBox(bbox))
    throw new Error(`Element ${index + 1}: bbox must be [y_min, x_min, y_max, x_max].`);

  const [y1, x1, y2, x2] = bbox.map(value => clamp(value / MAX_COORD, 0, 1));
  return {x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1)};
}

// Keys in the order the official caption verifier expects
function writeIdeogram(layout) {
  const result = {};

  if (layout.caption.trim())
    result.high_level_description = layout.caption.trim();

  const style = layout.style;
  const photo = style.kind === "photo";

  if (style.aesthetics.trim() || style.lighting.trim() || style.medium.trim() || style.photo.trim()
      || style.artStyle.trim() || layout.palette.length) {
    result.style_description = photo
      ? {aesthetics: style.aesthetics.trim(), lighting: style.lighting.trim(), photo: style.photo.trim(),
         medium: "photograph"}
      : {aesthetics: style.aesthetics.trim(), lighting: style.lighting.trim(), medium: style.medium.trim(),
         art_style: style.artStyle.trim()};

    if (layout.palette.length)
      result.style_description.color_palette = layout.palette;
  }

  result.compositional_deconstruction = {
    background: layout.background.trim(),
    elements: layout.items.map(item => {
      const text = item.kind === "text";
      const element = {type: text ? "text" : "obj"};

      if (item.box)
        element.bbox = [item.box.y, item.box.x, item.box.y + item.box.h, item.box.x + item.box.w]
          .map(value => Math.round(clamp(value, 0, 1) * MAX_COORD));

      if (text)
        element.text = item.text ?? "";

      element.desc = item.caption.trim();

      if (item.palette.length)
        element.color_palette = item.palette;

      return element;
    })
  };

  return result;
}

// ---------- MOSS-Image ----------

function readMoss(data, {width, height}) {
  if (data.bbox_format !== undefined && data.bbox_format !== "yxyx")
    throw new Error(`bbox_format "${data.bbox_format}" is not supported; MOSS-Image layouts use "yxyx".`);

  if (data.bbox_coord_space !== undefined && data.bbox_coord_space !== "abs_centralized")
    throw new Error(`bbox_coord_space "${data.bbox_coord_space}" is not supported; MOSS-Image layouts use "abs_centralized".`);

  const summary = data.summary ?? {};

  if (!isObject(summary))
    throw new Error("summary must be an object.");

  const layout = emptyLayout();
  layout.caption = str(summary.caption);
  layout.meta = strings(summary.meta);
  layout.canvas = MOSS_CANVASES.includes(summary.canvas) ? summary.canvas : "single";
  layout.palette = colors(summary.palette);

  const items = data.items ?? [];

  if (!Array.isArray(items))
    throw new Error("items must be an array.");

  let outOfCanvas = false;

  layout.items = items.map((item, index) => {
    if (!isObject(item))
      throw new Error(`Item ${index + 1} is not an object.`);

    const kind = item.label === "text" ? "text" : item.label === "character" ? "character" : "obj";
    let box = null;

    if (item.bbox !== undefined) {
      if (!isBox(item.bbox))
        throw new Error(`Item ${index + 1}: bbox must be [y_min, x_min, y_max, x_max].`);

      const [y1, x1, y2, x2] = item.bbox;
      outOfCanvas ||= y1 < -height / 2 || x1 < -width / 2 || y2 > height / 2 || x2 > width / 2;
      box = {x: x1 / width + 0.5, y: y1 / height + 0.5, w: (x2 - x1) / width, h: (y2 - y1) / height};
    }

    return {
      ...newItem(kind, box),
      caption: str(item.caption),
      text: kind === "text" || item.text !== undefined ? str(item.text) : undefined,
      palette: colors(item.palette),
      tags: strings(item.tags)
    };
  });

  return {layout, outOfCanvas};
}

// As compile_prompt.py of the moss-image-prompt-enhancer skill: pixel edges enclosing the box, then centered
function centeredBox(box, width, height) {
  const edge = value => Math.round(value * 1e9) / 1e9;
  const x1 = clamp(box.x, 0, 1) * width, x2 = clamp(box.x + box.w, 0, 1) * width;
  const y1 = clamp(box.y, 0, 1) * height, y2 = clamp(box.y + box.h, 0, 1) * height;
  const halfW = Math.floor(width / 2), halfH = Math.floor(height / 2);

  return [Math.floor(edge(y1)) - halfH, Math.floor(edge(x1)) - halfW,
          Math.ceil(edge(y2)) - halfH, Math.ceil(edge(x2)) - halfW];
}

function writeMoss(layout, {width, height}) {
  const summary = {};

  if (layout.meta.length)
    summary.meta = layout.meta;

  summary.canvas = layout.canvas;
  summary.caption = layout.caption.trim();

  if (layout.palette.length)
    summary.palette = layout.palette;

  // Every MOSS item needs a box
  const items = layout.items.filter(item => item.box).map(item => {
    const result = {label: item.kind === "obj" ? "object" : item.kind, caption: item.caption.trim()};

    if (item.kind === "text" || item.text)
      result.text = item.text ?? "";

    result.bbox = centeredBox(item.box, width, height);

    if (item.tags?.length)
      result.tags = item.tags;

    if (item.palette.length)
      result.palette = item.palette;

    return result;
  });

  return {summary, items, bbox_coord_space: "abs_centralized", bbox_format: "yxyx"};
}

// ---------- Helpers ----------

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBox(value) {
  return Array.isArray(value) && value.length === 4 && value.every(v => typeof v === "number" && Number.isFinite(v))
    && value[0] < value[2] && value[1] < value[3];
}

const str = value => typeof value === "string" ? value : "";

const strings = value => Array.isArray(value) ? value.filter(v => typeof v === "string") : [];

const colors = value => strings(value).map(normalizeColor).filter(Boolean);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
