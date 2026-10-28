/**
 * Two-way mirror of the workflow parameters for the Generate tab of the popup, the ComfyUI counterpart of
 * webui-extension/javascript/mirror.js with the same messages. While the tab is shown, the parameters found
 * in the workflow (params.js) are polled and sent to the popup when they change, with the features telling
 * which of them the workflow has; edits made in the popup are set on the node widgets.
 * The generation mode follows the image markers: img2img with a node marked ib:img, inpaint with ib:mask too.
 */

import {MARKER_ROLES, getRoleWidgetName} from "./workflow.js";
import {getMaskPreview, getTargetImageUrl, uploadInputImage, uploadInputMask} from "./images.js";
import {captureWorkflows} from "./workflows.js";
import {checkWorkflow} from "./runErrors.js";
import {createHiresFixWatch} from "./shared/hiresFixWatch.js";

const POLL_INTERVAL = 600;
// Lets the widget callbacks run before the values are read back
const APPLY_SETTLE_DELAY = 300;

// Files of the input images set from the popup, by kind
const INPUT_FILES = {image: "image_bench_input_image.png", mask: "image_bench_input_mask.png"};

/**
 * @param {Object} ctx - {app, ops, popup: {sendMessage, isOpen}, showAlert}
 * @param {Object} modules - {progress, references}
 */
export function createMirror({app, ops, popup, showAlert}, {progress, references}) {
    let timer = null;
    let lastState = null;
    let lastInputs = null;
    // Where images sent from the editor go: 'input' or 'reference' (set in the Generate tab)
    let editorTarget = 'input';
    // The ib:hr switch, shown as a badge on the Generate tab of the popup
    const hiresFixWatch = createHiresFixWatch(() => ops.getHiresFix(), popup);

    /**
     * @returns {'txt2img'|'img2img'|'inpaint'}
     */
    function getMode() {
        if (!ops.getRoleTarget(MARKER_ROLES.image))
            return 'txt2img';

        return ops.getRoleTarget(MARKER_ROLES.mask) ? 'inpaint' : 'img2img';
    }

    /**
     * Start or stop sending the parameters (the Generate tab is shown or hidden)
     * @param {boolean} active
     */
    function subscribe(active) {
        clearInterval(timer);
        timer = null;
        progress.subscribe(active);

        if (active) {
            lastState = null;
            lastInputs = null;
            timer = setInterval(poll, POLL_INTERVAL);
            poll();
        }
    }

    function poll() {
        if (!popup.isOpen()) {
            subscribe(false);
            return;
        }

        const state = captureState();
        const json = JSON.stringify(state);

        if (json !== lastState) {
            lastState = json;
            popup.sendMessage({type: "WEBUI_PARAMS", ...state});
        }

        sendInputImages(state.mode);
    }

    function pollIfActive() {
        if (timer)
            poll();
    }

    function captureState() {
        const mode = getMode();
        const {params, options, features, sliderKind} = ops.params.read(mode);

        return {
            mode,
            params,
            sliderKind,
            tokens: {prompt: null, negativePrompt: null},
            options,
            features,
            references: references.captureState(),
            busy: progress.takeBusy(),
            locked: false,
            // Nodes and model files the workflow uses that ComfyUI does not have (runErrors.js)
            problems: checkWorkflow(app),
            // The workflow dropdown: the saved workflows and the active one, which follows the tabs of ComfyUI
            ...captureWorkflows(app)
        };
    }

    function getInputUrl(role) {
        const target = ops.getRoleTarget(role);
        return target && getTargetImageUrl(target, getRoleWidgetName(role, ops.nodeConfig, target) ?? 'image');
    }

    /**
     * Images of the nodes marked ib:img and ib:mask; the mask is shown white on black
     * @param {string} mode
     */
    async function sendInputImages(mode) {
        const image = mode === 'txt2img' ? null : getInputUrl(MARKER_ROLES.image);
        const mask = mode === 'inpaint' ? getInputUrl(MARKER_ROLES.mask) : null;
        const signature = [mode, image, mask].join('|');

        if (signature === lastInputs)
            return;

        lastInputs = signature;

        let maskPreview = null;

        try {
            maskPreview = mask && await getMaskPreview(mask);
        } catch (error) {
            console.warn('[Image Bench] Unable to read the mask:', error);
        }

        // A newer state was sent meanwhile
        if (signature === lastInputs)
            popup.sendMessage({type: "INPUT_IMAGES", mode, image, mask: maskPreview});
    }

    function applyParams(params) {
        ops.params.apply(params, getMode());
        app.graph.setDirtyCanvas(true, true);
        setTimeout(pollIfActive, APPLY_SETTLE_DELAY);
    }

    /**
     * Put an image chosen in the popup into the node marked ib:img or ib:mask
     * @param {'image'|'mask'} kind
     * @param {File} file
     */
    async function setInputImage(kind, file) {
        if (!ops.getRoleTarget(kind === 'mask' ? MARKER_ROLES.mask : MARKER_ROLES.image)) {
            showAlert(`No node is marked "${kind === 'mask' ? 'ib:mask' : 'ib:img'}".`);
            return;
        }

        try {
            const name = kind === 'mask'
                ? await uploadInputMask(file, INPUT_FILES.mask)
                : await uploadInputImage(file, INPUT_FILES.image);

            ops.setInpaintUploadImage(kind, name);
        } catch (error) {
            showAlert(error.message);
        }

        pollIfActive();
    }

    async function editReferences(edit) {
        try {
            await references.edit(edit);
        } catch (error) {
            showAlert(error.message);
        }

        pollIfActive();
    }

    // The video of an "Extend video" image action
    async function setContinuation(url) {
        try {
            if (!await references.setContinuation(url))
                showAlert('Unable to extend the video: no node is marked "ib:ext". Open a video workflow with an '
                    + '"Extend from video" group.');
        } catch (error) {
            showAlert(error.message);
        }

        pollIfActive();
    }

    const handlers = {
        MIRROR_SUBSCRIBE: payload => subscribe(payload.active),
        HIRES_FIX_SUBSCRIBE: () => hiresFixWatch.subscribe(),
        LIVE_PROGRESS_SUBSCRIBE: () => progress.watch(),
        SET_WEBUI_PARAMS: payload => applyParams(payload.params),
        SET_INPUT_IMAGE: payload => setInputImage(payload.kind, payload.file),
        CLEAR_INPUT_IMAGES: () => {
            ops.clearInpaintUploadImages();
            pollIfActive();
        },
        EDIT_REFERENCES: payload => editReferences(payload.edit),
        SET_CONTINUATION: payload => setContinuation(payload.url),
        SET_EDITOR_TARGET: payload => editorTarget = payload.target,
        // WebUI features the Generate tab does not offer in ComfyUI
        REUSE_SEED: () => {},
        LOCK_WEBUI_PROMPTS: () => {},
        SET_GENERATION_MODE: () => {}
    };

    return {handlers, getMode, getEditorTarget: () => editorTarget, pollIfActive};
}
