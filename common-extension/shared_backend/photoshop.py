import io
import os
import re

from PIL import Image

# Image kinds sent by the Photoshop plugin
PHOTOSHOP_IMAGE_KINDS = ("image", "mask")

# Where an image sent by the Photoshop plugin goes, with the image kinds it accepts: the input of the generation
# (img2img or inpaint upload in WebUI, the nodes marked ib:img and ib:mask in ComfyUI) or a ControlNet unit
# (the unit shown in the ControlNet tab; ComfyUI: the node marked ib:cn:<unit>): its image to preprocess,
# its control image used without a preprocessor, or its mask; or the Compare tab, where the backend saves the image
PHOTOSHOP_TARGET_KINDS = {
    "input": ("image", "mask"),
    "cn_preprocess": ("image",),
    "cn_image": ("image",),
    "cn_mask": ("mask",),
    "compare": ("image",)
}

# Target of the images added to the Compare tab
COMPARE_TARGET = "compare"

# Key of the image sent from the Image Bench window to the Photoshop plugin
OUTGOING_IMAGE_KIND = "outgoing"

# Image types that Photoshop is able to place, by their file extensions
SENDABLE_MEDIA_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}

# PIL modes by the number of 8-bit components per pixel (as returned by the UXP imaging API)
COMPONENT_MODES = {1: "L", 2: "LA", 3: "RGB", 4: "RGBA"}

# Files written to the ComfyUI input directory for the images sent from Photoshop, by target and image kind
COMFYUI_INPUT_FILES = {
    "input": {"image": "image_bench_photoshop_image.png", "mask": "image_bench_photoshop_mask.png"},
    "cn_preprocess": {"image": "image_bench_photoshop_cn_image.png"},
    "cn_image": {"image": "image_bench_photoshop_cn_image.png"},
    "cn_mask": {"mask": "image_bench_photoshop_cn_mask.png"}
}


def raw_pixels_to_image(data: bytes, width: int, height: int, components: int) -> Image.Image:
    """
    Decode raw interleaved 8-bit pixel data.

    Args:
        data: Pixel data, row by row, `components` bytes per pixel
        width: Image width in pixels
        height: Image height in pixels
        components: Number of components per pixel (1-4)

    Raises:
        ValueError: If the dimensions do not match the data
    """
    mode = COMPONENT_MODES.get(components)

    if not mode:
        raise ValueError(f"Unsupported number of components: {components}")

    if width <= 0 or height <= 0 or len(data) != width * height * components:
        raise ValueError(f"Pixel data size {len(data)} does not match {width}x{height}x{components}")

    return Image.frombytes(mode, (width, height), data)


def image_to_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", compress_level=1)
    return buffer.getvalue()


def raw_pixels_to_png(data: bytes, width: int, height: int, components: int) -> bytes:
    """Encode raw interleaved 8-bit pixel data (see raw_pixels_to_image) into a PNG image"""
    return image_to_png(raw_pixels_to_image(data, width, height, components))


def mask_to_png(mask: Image.Image) -> bytes:
    """
    Encode a mask (white is masked) into an RGBA PNG image readable as a mask by any ComfyUI loader:
    the color channels hold the mask and the alpha channel holds its inverse, since LoadImage and the alpha channel
    of LoadImageMask take the mask as 1 - alpha
    """
    mask = mask.convert("L")
    image = Image.merge("RGBA", (mask, mask, mask, mask.point(lambda value: 255 - value)))
    return image_to_png(image)


def raw_mask_to_png(data: bytes, width: int, height: int, components: int) -> bytes:
    """Encode a raw selection mask (white is selected) into a mask PNG image (see mask_to_png)"""
    return mask_to_png(raw_pixels_to_image(data, width, height, components))


def image_file_to_mask_png(data: bytes) -> bytes:
    """
    Encode a mask image file into a mask PNG image (see mask_to_png): an image with transparency is masked
    where it is transparent (as the ComfyUI mask editor saves masks), any other image where it is white
    """
    image = Image.open(io.BytesIO(data))

    if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
        alpha = image.convert("RGBA").getchannel("A")

        if alpha.getextrema()[0] < 255:
            return mask_to_png(alpha.point(lambda value: 255 - value))

    return mask_to_png(image.convert("L"))


def get_image_file_name(name: str, media_type: str) -> str:
    """
    Make a safe file name for an image sent to Photoshop, with the extension matching its type.
    Photoshop names the placed layer after the file.
    """
    stem = os.path.splitext(os.path.basename(name.replace("\\", "/")))[0]
    stem = re.sub(r'[<>:"/\|?*\x00-\x1f]', "_", stem).strip(" .") or "image"
    return stem[:100] + SENDABLE_MEDIA_TYPES[media_type]
