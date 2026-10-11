"""
Custom nodes of Image Bench.

Image Bench Prompt: a prompt that applies the LoRAs named in it by WebUI <lora:name:weight> tags,
so that the LoRA list of the Generate tab works in ComfyUI as in SD WebUI. Mark it ib:pp.
"""

import logging
import os
import re

import comfy.sd
import comfy.utils
import folder_paths

# <lora:name>, <lora:name:weight> or <lora:name:text encoder weight:unet weight> (as in SD WebUI)
LORA_TAG = re.compile(r"<lora:([^:>]+)((?::[^:>]*)*)>", re.IGNORECASE)


def normalize_name(name: str) -> str:
    return name.replace("\\", "/").strip().lower()


def find_lora(name: str):
    """
    Find a LoRA file by the name in a tag: its path relative to the LoRA folder, with or without the extension,
    or its file name alone
    """
    names = folder_paths.get_filename_list("loras")
    wanted = normalize_name(name)

    for key in (lambda n: normalize_name(n),
                lambda n: os.path.splitext(normalize_name(n))[0],
                lambda n: os.path.splitext(os.path.basename(normalize_name(n)))[0]):
        for candidate in names:
            if key(candidate) == wanted:
                return candidate

    return None


def parse_weights(arguments: str):
    """Text encoder and model weights of a tag: the second defaults to the first, both to 1"""
    weights = []

    for argument in arguments.split(":")[1:]:
        try:
            weights.append(float(argument))
        except ValueError:
            pass

    clip_weight = weights[0] if weights else 1.0
    model_weight = weights[1] if len(weights) > 1 else clip_weight
    return clip_weight, model_weight


def remove_tags(text: str) -> str:
    """Remove the LoRA tags and the separators they leave behind"""
    text = LORA_TAG.sub("", text)
    text = re.sub(r"(\s*,\s*)+(?=,)", "", text)
    text = re.sub(r"^[\s,]+|[\s,]+$", "", text)
    return re.sub(r"[ \t]{2,}", " ", text)


class ImageBenchPrompt:
    """A prompt whose <lora:...> tags load LoRAs into the model and CLIP; outputs the prompt without them"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "text": ("STRING", {"multiline": True, "dynamicPrompts": False}),
            },
            "optional": {
                "clip": ("CLIP",),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("model", "clip", "text")
    FUNCTION = "apply"
    CATEGORY = "Image Bench"
    DESCRIPTION = ("Applies the LoRAs named by <lora:name:weight> tags in the prompt and outputs the prompt "
                   "without them. Mark it ib:pp to edit it in the Generate tab of Image Bench.")

    def apply(self, model, text, clip=None):
        for match in LORA_TAG.finditer(text):
            name = find_lora(match.group(1))

            if not name:
                logging.warning(f"[Image Bench] LoRA '{match.group(1)}' is not found")
                continue

            clip_weight, model_weight = parse_weights(match.group(2))

            if clip_weight == 0 and model_weight == 0:
                continue

            lora = comfy.utils.load_torch_file(folder_paths.get_full_path_or_raise("loras", name), safe_load=True)
            model, clip = comfy.sd.load_lora_for_models(model, clip, lora, model_weight, clip_weight)

        return model, clip, remove_tags(text)


NODE_CLASS_MAPPINGS = {
    "ImageBenchPrompt": ImageBenchPrompt
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageBenchPrompt": "Image Bench Prompt"
}
