import {getGenerationState, setGenerationState} from "./state.js";
import {sendPopupMessage} from "./popup.js";
import {ImageProcessingStrategy} from "./shared/strategies/ImageProcessingStrategy.js";
import {VaryingParametersStrategy} from "./shared/strategies/VaryingParametersStrategy.js";
import {adapter} from "./adapters/adapter.js";
import {messageBus} from "./shared/messaging/MessageBus.js";

// Create strategy instances
const processingStrategy = new ImageProcessingStrategy(adapter, messageBus);
const varyingStrategy = new VaryingParametersStrategy(adapter, messageBus);

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

export function messageSetProcessingParams(msg) {
    const generationState = getGenerationState();

    if (generationState === "HIRES_FIX" || generationState === "SEQUENTIAL_GENERATION") {
        if (msg.type === "SAVED_IMAGE") {
            const strategy = processingStrategy.isProcessing() ? processingStrategy : varyingStrategy;
            if (strategy.isProcessing()) {
                Object.assign(msg, strategy.getMessageParams());
            }
        }
    }
}

export function isProcessingActive(msg) {
    const generationState = getGenerationState();
    return generationState === "HIRES_FIX"
        || generationState === "SEQUENTIAL_GENERATION";
}

export async function processImages(options) {
    setGenerationState(options?.setSteps ? "SEQUENTIAL_GENERATION" : "HIRES_FIX");
    return await processingStrategy.process(options);
}

export function processNextImage() {
    if (processingStrategy.isProcessing()) {
        processingStrategy.processNext();
    } else if (varyingStrategy.isProcessing()) {
        varyingStrategy.processNext();
    }
}

export async function finishProcessing() {
    if (processingStrategy.isProcessing()) {
        await processingStrategy.finish();
    } else if (varyingStrategy.isProcessing()) {
        await varyingStrategy.finish();
    }
}

export function revertVaryingParams() {
    // Handled by strategy
}

export function generateVaryingSteps(options) {
    setGenerationState("SEQUENTIAL_GENERATION");
    return varyingStrategy.process(options);
}

export function upscaleVaryingDenoising(options) {
    setGenerationState("HIRES_FIX");
    return varyingStrategy.process(options);
}
