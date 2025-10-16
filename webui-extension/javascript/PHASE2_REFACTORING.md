# Phase 2 Refactoring: Adapter Layer

## Completed: January 16, 2025

### Overview
Phase 2 implemented the Adapter pattern to abstract DOM manipulation operations, separating extension-specific logic from business logic. This enables the same code to work with different UI frameworks (SD WebUI, Forge, and future ComfyUI).

### Changes Made

#### 1. Created Adapter Layer Files

**`adapters/DOMAdapter.js`** - Abstract Interface
- Base class defining all DOM manipulation methods
- 15+ method signatures including:
  - `getInputValue(selectorKey)` - Get input values
  - `setInputValue(selectorKey, value)` - Set input values
  - `setCheckboxValue(selectorKey, checked)` - Toggle checkboxes
  - `setDropdownValue(selectorKey, value)` - Select dropdown options
  - `clickButton(selectorKey)` - Click buttons
  - `isElementVisible(element)` - Check visibility
  - `getElement(selectorKey)` - Get DOM elements
  - `toggleHiresFix()` - Toggle hires fix
  - `isImg2ImgTab()` - Check current tab
  - `getGenerationProgress()` - Get progress percentage
  - `dispatchMouseEvent()` - Dispatch events
  - `sleep(ms)` - Async delay utility

**`adapters/SDWebuiAdapter.js`** - SD WebUI Implementation
- Concrete implementation of `DOMAdapter` for SD WebUI/Forge
- Implements all interface methods using SELECTORS constants
- Handles WebUI-specific quirks (dropdown behavior, event dispatching)
- Additional helper: `isForge()` to detect Forge variant

**`adapters/adapter.js`** - Singleton Instance
- Exports singleton `adapter` instance
- Provides `isForge()` helper function
- Central access point for all DOM operations

#### 2. Refactored Files to Use Adapter

**utils_input.js** - Completely Rewritten
- Reduced from ~100 lines to ~50 lines
- All functions now delegate to adapter
- Functions became thin wrappers maintaining backward compatibility:
  - `getInputValue(key)` → `adapter.getInputValue(key)`
  - `setInputValue(key, value)` → `adapter.setInputValue(key, value)`
  - `setCheckBoxValue(key, checked)` → `adapter.setCheckboxValue(key, checked)`
  - `setDropdownValue(key, value)` → `adapter.setDropdownValue(key, value)`
  - `toggleHiresFix()` → `adapter.toggleHiresFix()`

**sdwebui.js** - Updated (4 changes)
- Import adapter singleton
- `hookIntoSDWebUI()`: Use `checkIsForge()` helper
- `getGenerationProgress()`: Delegate to adapter
- Other functions continue using helper functions from utils_input.js

**generation.js** - Updated (5 changes)
- Import adapter
- Use `adapter.isImg2ImgTab()` instead of checking offsetParent
- Use `adapter.sleep()` instead of utils sleep
- Use `adapter.isElementVisible()` instead of isButtonVisible

**explore.js** - Updated (2 changes)
- Import adapter
- Use `adapter.sleep()` and `adapter.isElementVisible()`

**processing.js** - Updated (5 changes)
- Import adapter
- Use `adapter.sleep()` throughout
- Use `adapter.isElementVisible()` for button checks

### Architecture Benefits

#### 1. **Separation of Concerns**
```
Business Logic (explore.js, processing.js, generation.js)
           ↓
    Adapter Interface (DOMAdapter)
           ↓
Platform Implementation (SDWebuiAdapter)
           ↓
      DOM / Selectors
```

#### 2. **Extension-Agnostic Code**
- Business logic modules no longer directly manipulate DOM
- All DOM operations go through adapter interface
- Easy to create ComfyUI adapter without changing business logic

#### 3. **Single Responsibility**
- **Business modules**: Queue management, state tracking, workflow logic
- **Adapter**: DOM manipulation, element queries, event dispatching
- **Selectors**: CSS selector constants

#### 4. **Testability**
- Adapter can be mocked for unit testing
- Business logic testable without DOM
- Individual adapter methods can be tested in isolation

### Code Reduction

- **utils_input.js**: ~100 lines → ~50 lines (50% reduction)
- **Total duplication removed**: ~200+ lines of DOM manipulation code
- **Centralized logic**: All DOM operations in one place

### Files Modified in Phase 2

1. ✅ `adapters/DOMAdapter.js` (NEW)
2. ✅ `adapters/SDWebuiAdapter.js` (NEW)
3. ✅ `adapters/adapter.js` (NEW)
4. ✅ `utils_input.js` (REFACTORED)
5. ✅ `sdwebui.js` (UPDATED)
6. ✅ `generation.js` (UPDATED)
7. ✅ `explore.js` (UPDATED)
8. ✅ `processing.js` (UPDATED)

### Creating ComfyUI Extension

With this adapter layer, creating a ComfyUI extension requires:

1. **Create ComfyUI-specific selectors**:
   ```javascript
   // comfyui-extension/javascript/adapters/selectors.js
   export const SELECTORS = {
       // ComfyUI-specific selectors
       GENERATE_BUTTON: '#queue-button',
       // ... other ComfyUI selectors
   };
   ```

2. **Implement ComfyUIAdapter**:
   ```javascript
   // comfyui-extension/javascript/adapters/ComfyUIAdapter.js
   import { DOMAdapter } from '../../../shared/adapters/DOMAdapter.js';
   
   export class ComfyUIAdapter extends DOMAdapter {
       // Implement methods for ComfyUI's DOM structure
   }
   ```

3. **Copy shared business logic**:
   - Queue processing algorithms (explore.js, processing.js, generation.js)
   - State management (state.js)
   - WebSocket handling (websocket.js)
   - Utilities (utils.js)

### Next Steps (Future Phases)

**Phase 3: Extract Strategy Pattern**
- Create `shared/` directory for extension-agnostic code
- Implement `QueueProcessor` base class
- Create concrete strategies:
  - `BatchGenerationStrategy`
  - `ModelExplorationStrategy`
  - `ImageProcessingStrategy`
  - `VaryingParametersStrategy`
- Move adapters to shared

**Phase 4: Message Bus**
- Replace direct popup message calls with pub-sub pattern
- Decouple modules further
- Enable easier testing

**Phase 5: Code Sharing**
- Set up Just task or symlinks for shared code
- Create proper module structure
- Document API contracts

### Testing Recommendations

Test all workflows with the adapter layer:
1. ✓ Batch generation (txt2img and img2img)
2. ✓ Generate variations
3. ✓ Model exploration
4. ✓ Image upscaling/processing
5. ✓ Varying steps generation
6. ✓ Varying denoising upscale
7. ✓ Config preset switching
8. ✓ Hires fix toggle
9. ✓ Prompt/negative prompt changes
10. ✓ Stop generation
11. ✓ Tab detection (txt2img vs img2img)
12. ✓ Progress monitoring

### Notes

- All changes maintain backward compatibility
- No breaking changes to existing API
- Adapter pattern allows future extensions without modifying core logic
- Ready for Phase 3 (Strategy pattern) when needed
- Works with both SD WebUI and Forge variants
