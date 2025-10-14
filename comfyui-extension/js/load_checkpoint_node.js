import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "Comfy.ImgBenchLoadCheckpointNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ImgBenchLoadCheckpointNode") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) {
                    onNodeCreated.apply(this, arguments);
                }

                const appButton = this.addWidget("button", "Image Bench", null, () => {
                    const windowFeatures = 'width=1024,height=720,left=100,top=100';
                    const popup = window.open("extensions/image-bench/index.html", '_blank', windowFeatures);
                });

                this.appButton = appButton;

                this.size = this.computeSize();
                this.setDirtyCanvas(true, true);
            };

            const origComputeSize = nodeType.prototype.computeSize;
            nodeType.prototype.computeSize = function() {
                const size = origComputeSize ? origComputeSize.apply(this, arguments) : [300, 100];
                size[1] += 20; // Add space for the button
                return size;
            };
        }
    }
});