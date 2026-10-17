import audioPlaceholder from "@/assets/audio-placeholder.svg";
import {createImageLink} from "@/sdwebui.js";

/**
 * Video and audio files among the images: their kind, the preview shown on the cards (a thumbnail made by the
 * backend for a video, a placeholder for audio) and the one inline playback at a time.
 * An image object of a video or audio file carries mediaType ("video" | "audio"); the file name tells it
 * where the object has none (project files, images saved before).
 */

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "flac", "ogg", "opus", "m4a", "aac"]);

export const KIND_IMAGE = "image";
export const KIND_VIDEO = "video";
export const KIND_AUDIO = "audio";

export const AUDIO_PLACEHOLDER = audioPlaceholder;

const VOLUME_KEY = "imageBench_mediaVolume";

/** "image", "video" or "audio" by the extension of a file name or path */
export function mediaKindOfName(name) {
  const ext = (name || "").split(/[?#]/)[0].split(".").pop().toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) ? KIND_VIDEO : AUDIO_EXTENSIONS.has(ext) ? KIND_AUDIO : KIND_IMAGE;
}

/** "image", "video" or "audio" of a MIME type */
export function mediaKindOfType(type) {
  return /^video\//.test(type || "") ? KIND_VIDEO : /^audio\//.test(type || "") ? KIND_AUDIO : KIND_IMAGE;
}

function urlFileName(url) {
  try {
    return new URL(url, location.href).searchParams.get("filename");
  } catch {
    return null;
  }
}

/** "image", "video" or "audio" of an image object */
export function mediaKind(image) {
  if (!image)
    return KIND_IMAGE;

  if (image.mediaType === KIND_VIDEO || image.mediaType === KIND_AUDIO)
    return image.mediaType;

  return mediaKindOfName(image.fileName || image.filename || image.imagePath || urlFileName(image.imageUrl)
    || image.imageUrl);
}

/** An image, not a video or audio file: the actions working on pixels (upscale, inpaint, editor, ...) need one */
export function isStill(image) {
  return mediaKind(image) === KIND_IMAGE;
}

/** The thumbnail of a generated video, made by the backend (/image-bench/media/thumb) */
export function videoThumbUrl(url) {
  return `/image-bench/media/thumb?url=${encodeURIComponent(url)}`;
}

/** What a card shows of an image object: the image, a video thumbnail or the audio placeholder */
export function previewUrl(image) {
  switch (mediaKind(image)) {
    case KIND_VIDEO:
      return videoThumbUrl(createImageLink(image));
    case KIND_AUDIO:
      return AUDIO_PLACEHOLDER;
    default:
      return createImageLink(image);
  }
}

// The element playing on a card; another one starting pauses it
let playing = null;

/** A card's video or audio element started: the one playing before pauses */
export function startedPlayback(element) {
  if (playing && playing !== element)
    playing.pause();

  playing = element;
}

export function stoppedPlayback(element) {
  if (playing === element)
    playing = null;
}

/** Pause the playback of a card (the full view opens) */
export function pauseInlinePlayback() {
  playing?.pause();
}

export function getMediaVolume() {
  try {
    const volume = parseFloat(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
  } catch {
    return 1;
  }
}

export function saveMediaVolume(element) {
  try {
    localStorage.setItem(VOLUME_KEY, String(element.volume));
  } catch {
    // Not kept
  }
}
