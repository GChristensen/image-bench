/**
 * Geometry of the Compare tab. The region is kept as fractions of the image size {x, y, w, h}, so that it selects
 * the same part of images of different resolutions; aspect ratios of the region are in image pixels.
 */

// Aspect ratios offered for the region (width / height in pixels); null is free
export const REGION_ASPECTS = [
  {id: "free", label: "Free", ratio: null},
  {id: "1:1", label: "1:1", ratio: 1},
  {id: "4:3", label: "4:3", ratio: 4 / 3},
  {id: "3:4", label: "3:4", ratio: 3 / 4},
  {id: "3:2", label: "3:2", ratio: 3 / 2},
  {id: "2:3", label: "2:3", ratio: 2 / 3},
  {id: "16:9", label: "16:9", ratio: 16 / 9},
  {id: "9:16", label: "9:16", ratio: 9 / 16}
];

// Regions smaller than this (as a fraction of the image) are discarded
export const MIN_REGION = 0.005;

// Images whose aspect ratios differ less than this are of the same aspect ratio
const SAME_RATIO_TOLERANCE = 0.01;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Horizontal strip, unless all images have the same landscape aspect ratio
 * @param {Array<{w: number, h: number}>} sizes - Natural sizes of all images
 */
export function stripDirection(sizes) {
  if (!sizes.length || sizes.some(size => !size))
    return "horizontal";

  const ratio = sizes[0].w / sizes[0].h;
  const same = sizes.every(size => Math.abs(size.w / size.h - ratio) / ratio < SAME_RATIO_TOLERANCE);

  return same && ratio > 1 + SAME_RATIO_TOLERANCE ? "vertical" : "horizontal";
}

/**
 * Aspect ratio of the region in fractions of an image of the given size, for a ratio in pixels
 */
function fractionRatio(pixelRatio, size) {
  return pixelRatio * size.h / size.w;
}

/**
 * Pixel aspect ratio of a region on an image
 */
export function regionPixelRatio(region, size) {
  return region.w * size.w / (region.h * size.h);
}

/**
 * Rectangle spanned from an anchor point to a point, constrained to the aspect ratio (in pixels) if one is given,
 * and kept inside the image by shrinking it towards the anchor
 */
export function spanRegion(anchor, point, pixelRatio, size) {
  let dx = point.x - anchor.x;
  let dy = point.y - anchor.y;

  if (pixelRatio) {
    const ratio = fractionRatio(pixelRatio, size);

    if (Math.abs(dx) / ratio > Math.abs(dy))
      dy = (Math.sign(dy) || 1) * Math.abs(dx) / ratio;
    else
      dx = (Math.sign(dx) || 1) * Math.abs(dy) * ratio;

    const limitX = dx > 0 ? 1 - anchor.x : anchor.x;
    const limitY = dy > 0 ? 1 - anchor.y : anchor.y;
    const scale = Math.min(1, dx ? limitX / Math.abs(dx) : 1, dy ? limitY / Math.abs(dy) : 1);

    dx *= scale;
    dy *= scale;
  }
  else {
    dx = clamp(anchor.x + dx, 0, 1) - anchor.x;
    dy = clamp(anchor.y + dy, 0, 1) - anchor.y;
  }

  return {
    x: Math.min(anchor.x, anchor.x + dx),
    y: Math.min(anchor.y, anchor.y + dy),
    w: Math.abs(dx),
    h: Math.abs(dy)
  };
}

/**
 * Region resized by dragging one of its handles ("n", "ne", "e", "se", "s", "sw", "w", "nw") to a point
 */
export function resizeRegion(region, handle, point, pixelRatio, size) {
  const left = region.x, top = region.y, right = region.x + region.w, bottom = region.y + region.h;

  // Corners span from the opposite corner
  if (handle.length === 2) {
    const anchor = {x: handle.includes("w") ? right : left, y: handle.includes("n") ? bottom : top};
    return spanRegion(anchor, point, pixelRatio, size);
  }

  const horizontal = handle === "e" || handle === "w";
  let result;

  if (horizontal) {
    const x1 = handle === "w" ? clamp(point.x, 0, right) : left;
    const x2 = handle === "e" ? clamp(point.x, left, 1) : right;
    result = {x: x1, y: top, w: x2 - x1, h: region.h};
  }
  else {
    const y1 = handle === "n" ? clamp(point.y, 0, bottom) : top;
    const y2 = handle === "s" ? clamp(point.y, top, 1) : bottom;
    result = {x: left, y: y1, w: region.w, h: y2 - y1};
  }

  if (!pixelRatio)
    return result;

  // The other dimension follows around the center of its axis, the edge shrinks if it does not fit
  const ratio = fractionRatio(pixelRatio, size);

  if (horizontal) {
    const center = top + region.h / 2;
    let h = result.w / ratio;
    h = Math.min(h, 2 * center, 2 * (1 - center));
    const w = h * ratio;
    return {x: handle === "w" ? right - w : left, y: center - h / 2, w, h};
  }
  else {
    const center = left + region.w / 2;
    let w = result.h * ratio;
    w = Math.min(w, 2 * center, 2 * (1 - center));
    const h = w / ratio;
    return {x: center - w / 2, y: handle === "n" ? bottom - h : top, w, h};
  }
}

/**
 * Region moved by an offset, kept inside the image
 */
export function moveRegion(region, dx, dy) {
  return {
    ...region,
    x: clamp(region.x + dx, 0, 1 - region.w),
    y: clamp(region.y + dy, 0, 1 - region.h)
  };
}

/**
 * Region changed to an aspect ratio around its center, keeping its width if possible
 */
export function fitRegionToAspect(region, pixelRatio, size) {
  if (!region || !pixelRatio || !size)
    return region;

  const ratio = fractionRatio(pixelRatio, size);
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  let w = region.w;
  let h = w / ratio;

  const maxH = 2 * Math.min(cy, 1 - cy);
  const maxW = 2 * Math.min(cx, 1 - cx);

  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }

  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }

  return {x: cx - w / 2, y: cy - h / 2, w, h};
}

export function containsPoint(region, point) {
  return !!region && point.x >= region.x && point.x <= region.x + region.w
    && point.y >= region.y && point.y <= region.y + region.h;
}

/**
 * Average pixel aspect ratio of the region over the images
 */
export function cropAspect(region, sizes) {
  const ratios = sizes.filter(Boolean).map(size => regionPixelRatio(region, size));
  return ratios.length ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : 1;
}

/**
 * Grid of n cells of an aspect ratio with the largest cells that fit into the area
 * @returns {{cols: number, rows: number, cellWidth: number, cellHeight: number}}
 */
export function packGrid(n, aspect, width, height, gap) {
  let best = {cols: 1, rows: Math.max(n, 1), cellWidth: 0, cellHeight: 0};

  for (let cols = 1; cols <= Math.max(n, 1); cols++) {
    const rows = Math.ceil(n / cols);
    const cellWidth = Math.min((width - (cols - 1) * gap) / cols, (height - (rows - 1) * gap) / rows * aspect);

    if (cellWidth > best.cellWidth)
      best = {cols, rows, cellWidth, cellHeight: cellWidth / aspect};
  }

  best.cellWidth = Math.max(0, Math.floor(best.cellWidth));
  best.cellHeight = Math.max(0, Math.floor(best.cellHeight));
  return best;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${url}`));
    image.src = url;
  });
}

/**
 * Render the region of each image into one PNG, in a grid of the given number of columns, at the native resolution
 * of the largest crop; the cells are separated by lines of the color, empty cells are transparent
 * @param {string[]} urls
 * @returns {Promise<Blob>}
 */
export async function renderCropGrid(urls, region, cols, color) {
  const images = await Promise.all(urls.map(loadImage));
  const sizes = images.map(image => ({w: image.naturalWidth, h: image.naturalHeight}));
  const aspect = cropAspect(region, sizes);
  const cellWidth = Math.round(Math.max(...sizes.map(size => region.w * size.w)));
  const cellHeight = Math.round(cellWidth / aspect);
  const gap = Math.max(2, Math.round(cellWidth / 200));
  const rows = Math.ceil(images.length / cols);

  const canvas = document.createElement("canvas");
  canvas.width = cols * cellWidth + (cols - 1) * gap;
  canvas.height = rows * cellHeight + (rows - 1) * gap;

  const context = canvas.getContext("2d");
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";

  for (let index = rows * cols - 1; index >= images.length; index--)
    context.clearRect((index % cols) * (cellWidth + gap), Math.floor(index / cols) * (cellHeight + gap),
      cellWidth + gap, cellHeight + gap);

  images.forEach((image, index) => {
    const {w, h} = sizes[index];
    context.drawImage(image, region.x * w, region.y * h, region.w * w, region.h * h,
      (index % cols) * (cellWidth + gap), Math.floor(index / cols) * (cellHeight + gap), cellWidth, cellHeight);
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unable to render the image")), "image/png"));
}
