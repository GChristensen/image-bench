import folder_paths
import os
import torch
from nodes import CheckpointLoaderSimple
from server import PromptServer

#print(folder_paths.get_filename_list("checkpoints"))

class LoadCheckpointNode(CheckpointLoaderSimple):
    def __init__(self):
        super().__init__()
        self.output_dir = folder_paths.get_output_directory()
        self.current_model = None
        # Register the custom message handler
        #PromptServer.instance.add_message_handler("change_model", self.handle_model_change)

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model_name": (folder_paths.get_filename_list("checkpoints"), ),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    FUNCTION = "load_model"
    CATEGORY = "loaders/custom"

    def load_model(self, model_name):
        # Use the parent class's loading mechanism
        return super().load_checkpoint(model_name)

    def handle_model_change(self, message):
        model_name = message.get('model_name')
        if model_name and model_name in folder_paths.get_filename_list("checkpoints"):
            self.current_model = model_name
            return {"status": "success", "message": f"Model changed to {model_name}"}
        return {"status": "error", "message": "Invalid model name"}


