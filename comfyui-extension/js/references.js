/**
 * Reference images of the edit models in the Generate tab: the LoadImage nodes marked ib:ref:0, ib:ref:1, ...
 * (e.g. those feeding ReferenceLatent or the image inputs of TextEncodeQwenImageEditPlus).
 * The panel lists the slots in use; a removed slot is bypassed together with the nodes that need its image
 * (see getBypassChain), and an added image goes into the first free slot, or replaces the last one.
 */

import {MARKER_ROLES, getMarkerTargets, getNodeMarkerIndex, getRoleMarker, getRoleWidgetName} from "./workflow.js";
import {getBypassChain, MODE_ALWAYS, MODE_BYPASS} from "./graph.js";
import {getTargetImageUrl, getViewUrl, setLoadImage, uploadInputImage} from "./images.js";

/**
 * @param {Object} ctx - {app, ops}
 */
export function createReferences({app, ops}) {
    const role = MARKER_ROLES.reference;

    function getSlots() {
        const marker = getRoleMarker(role, ops.nodeConfig);

        return getMarkerTargets(app, role, ops.nodeConfig)
            .map((target, order) => ({target, order, index: getNodeMarkerIndex(target.host, marker) ?? 0}))
            .sort((a, b) => a.index - b.index || a.order - b.order)
            .map(({target}) => ({
                target,
                widgetName: getRoleWidgetName(role, ops.nodeConfig, target) ?? 'image',
                // A slot inside a subgraph cannot be bypassed alone
                canBypass: target.host === target.source
            }));
    }

    const isUsed = slot => !slot.canBypass || slot.target.source.mode !== MODE_BYPASS;

    function setUsed(slot, used) {
        if (!slot.canBypass)
            return;

        for (const node of getBypassChain(slot.target.source))
            node.mode = used ? MODE_ALWAYS : MODE_BYPASS;
    }

    /**
     * The references in the shape of the WebUI ones; null if no node is marked (the tab shows no references)
     * @returns {Object|null}
     */
    function captureState() {
        const slots = getSlots();

        if (!slots.length)
            return null;

        return {
            enabled: null,
            maxSize: null,
            edit: null,
            images: slots.filter(isUsed).map(slot => getTargetImageUrl(slot.target, slot.widgetName))
        };
    }

    /**
     * Put images into the free slots; the last image replaces the last slot if none is free.
     * Each slot has its own file, so a file of the input directory (sent from Photoshop) is copied
     * @param {Array<File|string>} files - Files, or names of files in the input directory
     * @returns {Promise<boolean>} Whether the workflow has reference slots
     */
    async function addImages(files) {
        const slots = getSlots();

        if (!slots.length)
            return false;

        for (const file of files) {
            const slot = slots.find(slot => !isUsed(slot)) ?? slots[slots.length - 1];

            const image = typeof file === 'string' ? await (await fetch(getViewUrl(file))).blob() : file;
            const name = await uploadInputImage(image, `image_bench_reference_${slots.indexOf(slot)}.png`);
            setLoadImage(slot.target, slot.widgetName, name);
            setUsed(slot, true);
        }

        app.graph.setDirtyCanvas(true, true);
        return true;
    }

    /**
     * @param {number} index - Index among the slots in use, as the panel lists them
     */
    function removeImage(index) {
        const slot = getSlots().filter(isUsed)[index];

        if (slot)
            setUsed(slot, false);

        app.graph.setDirtyCanvas(true, true);
    }

    function clearImages() {
        for (const slot of getSlots())
            setUsed(slot, false);

        app.graph.setDirtyCanvas(true, true);
    }

    /**
     * Edit the references: {add: File[]} | {remove: number} | {clear: true}
     */
    async function edit(change) {
        if (change.add)
            await addImages(change.add);
        else if (change.remove !== undefined)
            removeImage(change.remove);
        else if (change.clear)
            clearImages();
    }

    return {captureState, addImages, edit};
}
