import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

//http://127.0.0.1:8188/api/view?filename=ComfyUI_00017_.png&type=output&subfolder=

app.registerExtension({
    name: "custom_save_image",
    async setup() {
        function messageHandler(event) { console.log([event]); }
        api.addEventListener("custom_save_image_paths", messageHandler);
    },
})