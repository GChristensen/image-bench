/**
 * Generation parameters of the workflow by their Generate tab names, located through the sampler marked ib:smp
 * (and ib:smp:1 for Hires. fix) as described by the "generation_params" section of node_config.json,
 * so that KSampler and SamplerCustomAdvanced workflows (seed in RandomNoise, steps in BasicScheduler, ...) are
 * handled alike. Prompts and the checkpoint come from their own markers.
 * The ComfyUIOperations facade reads and sets single parameters here, the Generate tab mirror all of them.
 */

import {getTargetWidget, setTargetWidgetValue} from './workflow.js';
import {findUpstream} from './graph.js';

// ComfyUI's randomize picks seeds below 2^50
const RANDOM_SEED_MAX = 1125899906842624;

// Located parameters, in the order of the generation_params section
const LOCATED_PARAMS = ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'guidance', 'shift',
    'width', 'height', 'hiresSteps', 'hiresDenoise', 'hiresScale', 'hiresUpscaler'];

const CONTROL_WIDGET = 'control_after_generate';

/**
 * @param {Object} widget
 * @returns {Array|null} The choices of a combo widget
 */
export function getWidgetChoices(widget) {
    const values = widget?.options?.values;
    const list = typeof values === 'function' ? values() : values;
    return Array.isArray(list) ? list : null;
}

/**
 * @param {ComfyUIOperations} ops - Provides the marker targets of the sampler, prompts and checkpoint
 */
export function createParamRegistry(ops) {
    const getConfig = () => ops.nodeConfig?.generation_params ?? {};
    const getStopTypes = () => ops.nodeConfig?.sampler?.nodeTypes ?? [];

    function getRoleTarget(role) {
        return role === 'hiresSampler' ? ops.getHiresSamplerTarget() : ops.getSamplerTarget();
    }

    /**
     * Locate a parameter by its generation_params locators
     * @param {string} name
     * @returns {{target: Object, widget: Object, widgetName: string}|null}
     */
    function locate(name) {
        for (const locator of getConfig()[name] ?? []) {
            const start = getRoleTarget(locator.role);
            const target = start && findUpstream(start, {...locator, stopTypes: getStopTypes()});
            const widget = target && getTargetWidget(target, locator.widget);

            if (widget)
                return {target, widget, widgetName: locator.widget};
        }

        return null;
    }

    function locateAll() {
        return Object.fromEntries(LOCATED_PARAMS.map(name => [name, locate(name)]));
    }

    /**
     * The control_after_generate widget that goes with a seed widget
     */
    function getControlWidget(located) {
        return located?.widget.linkedWidgets?.find(widget => widget.name === CONTROL_WIDGET)
            ?? getTargetWidget(located?.target, CONTROL_WIDGET);
    }

    function setLocated(located, value) {
        if (!located)
            return false;

        // Number widgets keep numbers, the popup may send strings
        if (typeof located.widget.value === 'number' && value !== '' && !isNaN(Number(value)))
            value = Number(value);

        return setTargetWidgetValue(located.target, located.widgetName, value);
    }

    /**
     * The parameter that a Generate tab name stands for in a generation mode
     * @param {string} name - Generate tab name
     * @param {string} mode - txt2img, img2img or inpaint
     * @param {Object} located - Result of locateAll()
     * @returns {string}
     */
    function resolveName(name, mode, located) {
        if (name === 'denoising')
            return mode === 'txt2img' ? 'hiresDenoise' : 'denoise';

        // The shift field of the Generate tab is Distilled CFG for Flux (FluxGuidance), else Shift
        if (name === 'shift')
            return located.guidance ? 'guidance' : 'shift';

        return name;
    }

    // ---------- Single parameters (facade) ----------

    /**
     * @param {string} name - Located parameter name (seed, steps, cfg, sampler, scheduler, denoise, ...)
     * @returns {any|null}
     */
    function getValue(name) {
        return locate(name)?.widget.value ?? null;
    }

    /**
     * Set a located parameter as it is (a seed of -1 is not translated)
     * @returns {boolean} Whether the parameter was found
     */
    function setValue(name, value) {
        return setLocated(locate(name), value);
    }

    function getSeedControl() {
        return getControlWidget(locate('seed'))?.value ?? null;
    }

    function setSeedControl(value) {
        const control = getControlWidget(locate('seed'));

        if (control)
            control.value = value;
    }

    // ---------- Generate tab mirror ----------

    /**
     * Read the parameters of the Generate tab
     * @param {string} mode - txt2img, img2img or inpaint
     * @returns {{params: Object, options: Object, features: Object, sliderKind: string|null}}
     */
    function read(mode) {
        const located = locateAll();
        const params = {};

        for (const name of ['steps', 'cfg', 'sampler', 'scheduler', 'width', 'height',
                            'hiresSteps', 'hiresScale', 'hiresUpscaler', 'denoising', 'shift'])
            params[name] = located[resolveName(name, mode, located)]?.widget.value ?? null;

        // The seed is -1 while it is randomized after each generation
        if (located.seed)
            params.seed = getControlWidget(located.seed)?.value === 'randomize' ? -1 : located.seed.widget.value;

        const prompt = ops.getPromptWidget('positive');
        const negativePrompt = ops.getPromptWidget('negative');
        const checkpoint = ops.getCheckpointWidget();

        params.prompt = prompt?.value ?? null;
        params.negativePrompt = negativePrompt?.value ?? null;
        params.checkpoint = checkpoint?.value ?? null;
        params.hiresFix = ops.getHiresFix();

        const options = {
            checkpoints: getWidgetChoices(checkpoint) ?? undefined,
            samplers: getWidgetChoices(located.sampler?.widget) ?? undefined,
            schedulers: getWidgetChoices(located.scheduler?.widget) ?? undefined,
            upscalers: getWidgetChoices(located.hiresUpscaler?.widget) ?? []
        };

        const features = {
            checkpoint: !!checkpoint,
            negativePrompt: !!negativePrompt,
            seed: !!located.seed,
            steps: !!located.steps,
            cfg: !!located.cfg,
            sampler: !!located.sampler,
            scheduler: !!located.scheduler,
            shift: !!(located.guidance || located.shift),
            size: !!(located.width && located.height),
            denoising: !!located[resolveName('denoising', mode, located)],
            hires: !!ops.getHiresSamplerTarget(),
            hiresFix: params.hiresFix !== null,
            hiresSteps: !!located.hiresSteps,
            hiresScale: !!located.hiresScale,
            hiresUpscaler: !!located.hiresUpscaler
        };

        const sliderKind = located.guidance ? 'distilledCfg' : located.shift ? 'shift' : null;

        return {params, options, features, sliderKind};
    }

    /**
     * Apply parameters edited in the Generate tab
     * @param {Object} values - By Generate tab names
     * @param {string} mode - txt2img, img2img or inpaint
     */
    function apply(values, mode) {
        const located = locateAll();

        for (const [name, value] of Object.entries(values)) {
            if (value === undefined || value === null)
                continue;

            if (name === 'prompt' || name === 'negativePrompt')
                ops.setPromptWidgetValue(name === 'prompt' ? 'positive' : 'negative', value);
            else if (name === 'checkpoint')
                ops.setCheckpoint(value);
            else if (name === 'hiresFix')
                ops.setHiresFix(value);
            else if (name === 'seed')
                applySeed(located.seed, Number(value));
            else
                setLocated(located[resolveName(name, mode, located)], value);
        }
    }

    /**
     * A seed of -1 randomizes the seed after each generation, as -1 generates with a random seed in WebUI;
     * any other seed is kept. ComfyUI randomizes after queueing, so a random seed is set at once too: the next
     * prompt would repeat the previous seed (and be cached whole) otherwise
     */
    function applySeed(located, seed) {
        const control = getControlWidget(located);

        if (seed < 0) {
            // The range of ComfyUI's own randomize
            setLocated(located, Math.floor(Math.random() * RANDOM_SEED_MAX));

            if (control)
                control.value = 'randomize';
            return;
        }

        setLocated(located, seed);

        if (control)
            control.value = 'fixed';
    }

    /**
     * Execution ids and widget names of the located parameters, used to read them from /history
     * @returns {Object} {name: {executionId, widget}}
     */
    function getExecutionIds() {
        return Object.fromEntries(Object.entries(locateAll())
            .filter(([, located]) => located)
            .map(([name, located]) => [name, {executionId: located.target.executionId, widget: located.widgetName}]));
    }

    return {locate, getValue, setValue, getSeedControl, setSeedControl, read, apply, getExecutionIds};
}
