import io

from PIL import Image

# Image kinds sent by the Photoshop plugin
PHOTOSHOP_IMAGE_KINDS = ("image", "mask")

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