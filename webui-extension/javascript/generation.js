import {getGenerationState, setGenerationState} from "./state.js";
import {sendPopupMessage} from "./popup.js";
import {getGenerationProgress} from "./sdwebui.js";
import {BatchGenerationStrategy} from "./shared/strategies/BatchGenerationStrategy.js";
import {adapter} from "./adapters/adapter.js";
import {messageBus} from "./shared/messaging/MessageBus.js";

// Create strategy instance
const batchStrategy = new BatchGenerationStrategy(adapter, messageBus);

// Bridge MessageBus events to existing popup system
messageBus.subscribe('BEGIN_PROCESSING', (data) => {
    sendPopupMessage({type: 'BEGIN_PROCESSING', ...data});
});

messageBus.subscribe('GENERATION_PROGRESS', (data) => {
    sendPopupMessage({type: 'GENERATION_PROGRESS', ...data});
});

messageBus.subscribe('GENERATION_FINISHED', (data) => {
    sendPopupMessage({type: 'GENERATION_FINISHED', ...data});
});

export async function batchGenerate(options, config) {
    setupGeneration(options);
    return await batchStrategy.process({...options, config});
}

export async function generateVariations(options, config) {
    setupGeneration(options);
    return await batchStrategy.process({...options, config});
}

export function setupGeneration(options) {
    setGenerationState("BATCH_GENERATION");
}

export async function finishGeneration() {
    if (batchStrategy.isProcessing()) {
        await batchStrategy.finish();
    }
}

export function messageSetGenerationParams(msg) {
    if (msg.type === "SAVED_IMAGE" && getGenerationState() === "BATCH_GENERATION") {
        msg.progress = getGenerationProgress();
        Object.assign(msg, batchStrategy.getMessageParams());
    }
}
