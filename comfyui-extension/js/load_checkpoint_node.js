import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

async function runBatches(graph) {
    const numBatches = 5;
    const workflow = graph.serialize();

    for (let i = 0; i < numBatches; i++) {
        console.log(`Starting batch ${i + 1}/${numBatches}`);
        try {
            const resp = await api.queuePrompt(workflow);
            await new Promise((resolve) => {
                const handler = (e) => {
                    const data = JSON.parse(e.data);
                    if (data.type === "executing" && data.data.node === null && data.data.prompt_id === resp.prompt_id) {
                        api.removeEventListener("message", handler);
                        resolve();
                    }
                };
                api.addEventListener("message", handler);
            });
            console.log(`Completed batch ${i + 1}/${numBatches}`);
        } catch (error) {
            console.error(`Error in batch ${i + 1}:`, error);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("All batches completed");
}

app.registerExtension({
    name: "Comfy.ImgBenchLoadCheckpointNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Only modify our specific node type
        if (nodeData.name === "ImgBenchLoadCheckpointNode") {
            // Save the original onNodeCreated if it exists
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            // Override onNodeCreated
            nodeType.prototype.onNodeCreated = function() {
                // Call the original onNodeCreated if it exists
                if (onNodeCreated) {
                    onNodeCreated.apply(this, arguments);
                }

                console.log(import.meta)
                const batchButton = this.addWidget("button", "Run 5 Batches", null, () => {
                    window.open("extensions/button_node/page.html", "_blank");
                });

                // Store the widget reference
                this.batchButton = batchButton;

                // Ensure the widget is properly sized and positioned
                this.size = this.computeSize();
                this.setDirtyCanvas(true, true);
            };

            // Add a custom size computation
            const origComputeSize = nodeType.prototype.computeSize;
            nodeType.prototype.computeSize = function() {
                const size = origComputeSize ? origComputeSize.apply(this, arguments) : [200, 100];
                size[1] += 40; // Add space for the button
                return size;
            };
        }
    }
});