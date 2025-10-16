import {getGenerationState, setGenerationState} from "./state.js";
import {sendPopupMessage} from "./popup.js";
import {ModelExplorationStrategy} from "./shared/strategies/ModelExplorationStrategy.js";
import {adapter} from "./adapters/adapter.js";
import {messageBus} from "./shared/messaging/MessageBus.js";

// Create strategy instance
const explorationStrategy = new ModelExplorationStrategy(adapter, messageBus);

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

export async function exploreModels(options) {
    if (!options.models || !options.models.length) {
        return;
    }

    if (explorationStrategy.isInvalidated()) {
        sendPopupMessage({type: "GENERATION_FINISHED"});
        alert("'Send to Txt2Img' was used. Please reload WebUI to explore models.");
        return;
    }

    setGenerationState("EXPLORE_MODELS");
    return await explorationStrategy.process(options);
}

export function exploreNextImage() {
    explorationStrategy.processNext();
}

export async function finishExploring() {
    await explorationStrategy.finish();
}

export function messageSetExploreParams(msg) {
    if (msg.type === "SAVED_IMAGE" && getGenerationState() === "EXPLORE_MODELS") {
        Object.assign(msg, explorationStrategy.getMessageParams());
    }
}

export function invalidateExplore() {
    explorationStrategy.invalidate();
}
