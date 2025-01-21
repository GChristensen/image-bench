import os
from nodes import SaveImage
import server

class SaveImageNode(SaveImage):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "filename_prefix": ("STRING", {"default": "ComfyUI"}),
            },
            "optional": {
                "log_path": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True

    def save_images(self, images, filename_prefix="ComfyUI", log_path=False):
        # Call the original SaveImage save method
        results = super().save_images(images, filename_prefix)

        # Extract saved paths
        saved_paths = [result['filename'] for result in results["ui"]["images"]]
        print(saved_paths)
        # If log_path is True, send paths to the frontend
        if log_path:
            server.PromptServer.instance.send_sync("custom_save_image_paths", {"paths": saved_paths})
            #server.PromptServer.instance.broadcast_message("image_paths", {"paths": saved_paths})
            #for client in server.PromptServer.instance.clients.values():
            #    client.send_message("image_paths", {"paths": saved_paths})
        return results

