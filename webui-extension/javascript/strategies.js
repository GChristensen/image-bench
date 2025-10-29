/**
 * Centralized Strategy Management
 * Provides direct access to all strategy instances
 */

import {ModelExplorationStrategy} from "./shared/strategies/ModelExplorationStrategy.js";
import {BatchGenerationStrategy} from "./shared/strategies/BatchGenerationStrategy.js";
import {ImageProcessingStrategy} from "./shared/strategies/ImageProcessingStrategy.js";
import {VaryingParametersStrategy} from "./shared/strategies/VaryingParametersStrategy.js";
import {UIOperations} from "./facade/UIOperations.js";
import {adapter} from "./adapters/adapter.js";
import {messageBus} from "./shared/messaging/MessageBus.js";
import {sendPopupMessage} from "./popup.js";

// Create UIOperations facade
const uiOperations = new UIOperations(adapter);

// Create strategy instances
export const explorationStrategy = new ModelExplorationStrategy(uiOperations, messageBus);
export const batchStrategy = new BatchGenerationStrategy(uiOperations, messageBus);
export const processingStrategy = new ImageProcessingStrategy(uiOperations, messageBus);
export const varyingStrategy = new VaryingParametersStrategy(uiOperations, messageBus);

// Bridge MessageBus events to existing popup system (centralized, done once)
messageBus.subscribe('BEGIN_PROCESSING', (data) => {
    sendPopupMessage({type: 'BEGIN_PROCESSING', ...data});
});

messageBus.subscribe('GENERATION_PROGRESS', (data) => {
    sendPopupMessage({type: 'GENERATION_PROGRESS', ...data});
});

messageBus.subscribe('GENERATION_FINISHED', (data) => {
    sendPopupMessage({type: 'GENERATION_FINISHED', ...data});
});
