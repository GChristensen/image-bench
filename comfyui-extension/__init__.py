
from .load_checkpoint_node import LoadCheckpointNode
from .save_image_node import SaveImageNode


NODE_CLASS_MAPPINGS = {
    "ImgBenchLoadCheckpointNode": LoadCheckpointNode,
    "ImgBenchSaveImageNode": SaveImageNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImgBenchLoadCheckpointNode": "Image Bench Load Checkpoint",
    "ImgBenchSaveImageNode": "Image Bench Save Image"
}

WEB_DIRECTORY = "./js"