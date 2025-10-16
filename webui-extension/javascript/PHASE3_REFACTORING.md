# Phase 3 Refactoring: Strategy Pattern Foundation

## Completed: January 16, 2025

### Overview
Phase 3 establishes the foundation for the Strategy Pattern by creating the shared infrastructure for extension-agnostic queue processing. This includes the base `QueueProcessor` class and a `MessageBus` for decoupled communication.

### Changes Made

#### 1. Created Shared Infrastructure

**`shared/core/QueueProcessor.js`** - Abstract Base Class
- Template Method pattern for queue-based processing workflows
- Common queue management logic
- Progress reporting
- Generation ID creation
- Lifecycle methods:
  - `initialize(options)` - Setup processor state
  - `prepare(options)` - Prepare for processing (UI setup, etc.)
  - `processItem(item)` - Process single item
  - `finish()` - Cleanup and finalization
  - `process(options)` - Main template method
  - `processNext()` - Process next item in queue
  - `reportProgress()` - Report progress via message bus
  - `stop()` - Stop processing
  - `isProcessing()` - Check if active
  - `getQueueLength()` - Get queue size
  - `createGenerationId()` - Generate unique ID

**`shared/messaging/MessageBus.js`** - Pub-Sub Communication
- Simple publish-subscribe pattern
- Decouples modules from direct dependencies
- Methods:
  - `subscribe(messageType, callback)` - Subscribe to messages
  - `publish(messageType, data)` - Publish messages
  - `unsubscribeAll(messageType)` - Remove all subscribers
  - `clear()` - Clear all subscriptions
- Singleton instance exported as `messageBus`

### Directory Structure

```
webui-extension/javascript/
├── adapters/              # Platform-specific adapters
│   ├── DOMAdapter.js
│   ├── SDWebuiAdapter.js
│   ├── adapter.js
│   └── selectors.js
├── shared/                # Extension-agnostic code (NEW)
│   ├── core/
│   │   └── QueueProcessor.js    # Base class for queue processing
│   └── messaging/
│       └── MessageBus.js         # Pub-sub message bus
├── [existing files...]
```

### Strategy Pattern Design

The Strategy Pattern separates queue processing algorithms from platform-specific code:

```
┌─────────────────────────────────────┐
│     QueueProcessor (Abstract)       │
│  - initialize()                     │
│  - prepare()                        │
│  - processItem()                    │
│  - finish()                         │
│  - process() [template method]      │
└─────────────────────────────────────┘
                  △
                  │ extends
        ┌─────────┼─────────────────┐
        │         │                 │
┌───────────┐ ┌──────────┐ ┌───────────────┐
│ Model     │ │ Batch    │ │ Image         │
│ Explor.   │ │ Gener.   │ │ Processing    │
│ Strategy  │ │ Strategy │ │ Strategy      │
└───────────┘ └──────────┘ └───────────────┘
```

### Proposed Concrete Strategies (To Be Implemented)

#### 1. ModelExplorationStrategy
- Extends QueueProcessor
- Iterates through models generating images
- Switches models between generations
- Restores original model when done

```javascript
class ModelExplorationStrategy extends QueueProcessor {
    initialize(options) {
        this.queue = [];
        for (const model of options.models) {
            for (let i = 0; i < options.generateImages; i++) {
                this.queue.push(model);
            }
        }
        this.totalItems = this.queue.length;
        this.generationId = this.createGenerationId();
    }
    
    async prepare(options) {
        this.modelBeforeExplore = await this.adapter.getInputValue('MODEL_CHECKPOINT');
        await this.adapter.setDropdownValue('MODEL_CHECKPOINT', options.models[0].title);
        await this.adapter.setInputValue('TXT2IMG_BATCH_COUNT', 1);
        await this.adapter.setInputValue('TXT2IMG_SEED', -1);
    }
    
    async processItem(model) {
        await this.adapter.setDropdownValue('MODEL_CHECKPOINT', model.title);
        await this.adapter.sleep(1000);
        await this.adapter.clickButton('TXT2IMG_GENERATE');
    }
    
    async finish() {
        if (this.modelBeforeExplore) {
            await this.adapter.setDropdownValue('MODEL_CHECKPOINT', this.modelBeforeExplore);
        }
        this.messageBus.publish('GENERATION_FINISHED', {});
    }
}
```

#### 2. BatchGenerationStrategy
- Extends QueueProcessor
- Generates multiple batches with random seeds
- Handles txt2img and img2img modes
- Config preset support

#### 3. ImageProcessingStrategy
- Extends QueueProcessor
- Processes queue of images (upscaling, varying parameters)
- Preserves and restores parameters
- Progress monitoring with sub-progress

#### 4. VaryingParametersStrategy
- Extends QueueProcessor
- Generates images with parameter variations
- Supports varying steps, denoising, etc.
- Parameter backup and restore

### Benefits of Strategy Pattern

#### 1. **Code Reusability**
- Queue management logic written once in `QueueProcessor`
- Progress reporting standardized
- Generation ID creation centralized
- Common patterns extracted

#### 2. **Extension-Agnostic**
- Strategies work with any adapter implementation
- No platform-specific code in strategies
- Easy to use with ComfyUI adapter

#### 3. **Testability**
- Mock adapter and message bus for testing
- Test strategies in isolation
- No DOM dependencies

#### 4. **Maintainability**
- Single responsibility for each strategy
- Changes to workflow isolated to specific strategy
- Base class handles common concerns

#### 5. **Flexibility**
- Easy to add new processing strategies
- Compose strategies together
- Switch strategies at runtime

### Migration Path

Current code in `explore.js`, `processing.js`, `generation.js` can be migrated to strategies:

**Current:**
```javascript
// explore.js
export async function exploreModels(options) {
    // 80 lines of queue management + business logic mixed
}
```

**After Migration:**
```javascript
// explore.js
import { ModelExplorationStrategy } from './shared/strategies/ModelExplorationStrategy.js';
import { adapter } from './adapters/adapter.js';
import { messageBus } from './shared/messaging/MessageBus.js';

const explorationStrategy = new ModelExplorationStrategy(adapter, messageBus);

export async function exploreModels(options) {
    await explorationStrategy.process(options);
}

export function exploreNextImage() {
    explorationStrategy.processNext();
}
```

### MessageBus Usage

Replace direct `sendPopupMessage` calls with message bus:

**Before:**
```javascript
sendPopupMessage({type: "GENERATION_PROGRESS", progress: 50});
```

**After:**
```javascript
messageBus.publish('GENERATION_PROGRESS', {progress: 50});
```

Then in core.js or popup bridge:
```javascript
messageBus.subscribe('GENERATION_PROGRESS', (data) => {
    sendPopupMessage({type: "GENERATION_PROGRESS", ...data});
});
```

### Code Sharing with ComfyUI

With this structure, sharing code with ComfyUI extension:

```
shared/
├── core/
│   └── QueueProcessor.js         # ← Copy to comfyui-extension
├── messaging/
│   └── MessageBus.js             # ← Copy to comfyui-extension
└── strategies/
    ├── ModelExplorationStrategy.js    # ← Copy to comfyui-extension
    ├── BatchGenerationStrategy.js     # ← Copy to comfyui-extension
    └── ImageProcessingStrategy.js     # ← Copy to comfyui-extension

# ComfyUI only needs to provide:
comfyui-extension/javascript/
├── adapters/
│   ├── ComfyUIAdapter.js         # ← ComfyUI-specific
│   └── selectors.js              # ← ComfyUI-specific
└── [uses strategies from shared/]
```

### Just Task for Code Sync

Add to `justfile`:
```just
# Sync shared code to ComfyUI extension
sync-shared:
    mkdir -p comfyui-extension/javascript/shared
    cp -r webui-extension/javascript/shared/* comfyui-extension/javascript/shared/
    @echo "✓ Shared code synced to ComfyUI extension"

# Watch and sync on changes (requires inotify-tools or similar)
watch-shared:
    while inotifywait -r -e modify webui-extension/javascript/shared/; do \
        just sync-shared; \
    done
```

### Next Implementation Steps

To fully implement Phase 3:

1. **Create Strategy Classes** (3-5 files)
   - `shared/strategies/ModelExplorationStrategy.js`
   - `shared/strategies/BatchGenerationStrategy.js`
   - `shared/strategies/ImageProcessingStrategy.js`
   - `shared/strategies/VaryingParametersStrategy.js`

2. **Refactor Existing Modules**
   - Update `explore.js` to use `ModelExplorationStrategy`
   - Update `generation.js` to use `BatchGenerationStrategy`
   - Update `processing.js` to use `ImageProcessingStrategy`

3. **Integrate Message Bus**
   - Replace `sendPopupMessage` calls with `messageBus.publish`
   - Subscribe to messages in `core.js` bridge
   - Decouple popup communication

4. **Testing**
   - Unit test each strategy
   - Integration test with adapter
   - End-to-end workflow testing

### Files Created in Phase 3

1. ✅ `shared/core/QueueProcessor.js` (NEW)
2. ✅ `shared/messaging/MessageBus.js` (NEW)

### Status

**Phase 3 Foundation: Complete** ✅
- QueueProcessor base class implemented
- MessageBus implemented
- Directory structure established
- Design documented

**Phase 3 Full Implementation: Pending**
- Concrete strategy classes (to be created)
- Migration of existing code (to be done)
- Message bus integration (to be done)

### Notes

- Foundation is complete and ready for strategy implementation
- Existing code continues to work unchanged
- Strategies can be implemented incrementally
- No breaking changes to current API
- Ready for Phase 4 (full migration) when needed

### Performance Considerations

- MessageBus adds minimal overhead (array iteration)
- Strategy pattern adds no runtime overhead
- Queue processing logic unchanged
- Memory footprint same as current implementation
