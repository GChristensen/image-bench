import io
import os
import re

from PIL import Image

# Image kinds sent by the Photoshop plugin
PHOTOSHOP_IMAGE_KINDS = ("image", "mask")

# Key of the image sent from the Image Bench window to the Photoshop plugin
OUTGOING_IMAGE_KIND = "outgoing"

# Image types that Photoshop is able to place, by their file extensions
SENDABLE_MEDIA_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}

# PIL modes by the number of 8-bit components per pixel (as returned by the UXP imaging API)
COMPONENT_MODES = {1: "L", 2: "LA", 3: "RGB", 4: "RGBA"}


def raw_pixels_to_png(data: bytes, width: int, height: int, components: int) -> bytes:
    """
    Encode raw interleaved 8-bit pixel data into a PNG image.

    Args:
        data: Pixel data, row by row, `components` bytes per pixel
        width: Image width in pixels
        height: Image height in pixels
        components: Number of components per pixel (1-4)

    Returns:
        PNG file content

    Raises:
        ValueError: If the dimensions do not match the data
    """
    mode = COMPONENT_MODES.get(components)

    if not mode:
        raise ValueError(f"Unsupported number of components: {components}")

    if width <= 0 or height <= 0 or len(data) != width * height * components:
        raise ValueError(f"Pixel data size {len(data)} does not match {width}x{height}x{components}")

    image = Image.frombytes(mode, (width, height), data)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", compress_level=1)
    return buffer.getvalue()


def get_image_file_name(name: str, media_type: str) -> str:
    """
    Make a safe file name for an image sent to Photoshop, with the extension matching its type.
    Photoshop names the placed layer after the file.
    """
    stem = os.path.splitext(os.path.basename(name.replace("\\", "/")))[0]
    stem = re.sub(r'[<>:"/\|?*\x00-\x1f]', "_", stem).strip(" .") or "image"
    return stem[:100] + SENDABLE_MEDIA_TYPES[media_type]
