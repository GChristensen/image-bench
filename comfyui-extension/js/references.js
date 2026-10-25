/**
 * References of the Generate tab: the LoadImage nodes marked ib:ref:0, ib:ref:1, ... (e.g. those feeding ReferenceLatent
 * or the image inputs of TextEncodeQwenImageEditPlus), the LoadVideo nodes marked ib:vref:N (reference and guide
 * videos) and the LoadAudio nodes marked ib:aref:N, and the LoadVideo node marked ib:ext, the video that an
 * "Extend video" continues.
 * The panel lists the slots in use; a removed slot is bypassed together with the nodes that need its file
 * (see getBypassChain), and an added file goes into the first free slot of its kind, or replaces the last one.
 */

import {
    MARKER_ROLES, getMarkerTargets, getNodeMarkerIndex, getRoleMarker, getRoleWidgetName, getTargetWidget
} from "./workflow.js";
import {getBypassChain, MODE_ALWAYS, MODE_BYPASS} from "./graph.js";
import {getTargetImageUrl, getViewUrl, setLoadImage, uploadInputImage} from "./images.js";

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'mkv', 'm4v'];
const AUDIO_EXTENSIONS = ['wav', 'mp3', 'flac', 'ogg', 'opus', 'm4a', 'aac'];

// Kinds of slots: their marker role, the widget of a loader the config does not name and the file names
const KINDS = {
    image: {role: MARKER_ROLES.reference, widget: 'image', fileName: index => `image_bench_reference_${index}.png`},
    video: {role: MARKER_ROLES.videoReference, widget: 'file',
            fileName: (index, ext) => `image_bench_reference_video_${index}.${ext}`},
    audio: {role: MARKER_ROLES.audioReference, widget: 'audio',
            fileName: (index, ext) => `image_bench_reference_audio_${index}.${ext}`},
    continuation: {role: MARKER_ROLES.continuation, widget: 'file',
                   fileName: (index, ext) => `image_bench_continuation.${ext}`}
};

// Maximum number of nodes followed downstream to find the node that takes a clip
const MAX_FOLLOWED = 64;

function extensionOf(name) {
    const ext = (name || '').split(/[?#]/)[0].split('.').pop().toLowerCase();
    return ext && ext.length <= 5 ? ext : '';
}

/**
 * Kind of an added file: video or audio by its MIME type or extension, else image
 * @param {File|Blob|string} file - A file, or the name of a file in the input directory
 */
function kindOf(file) {
    const type = typeof file === 'string' ? '' : file.type || '';
    const ext = extensionOf(typeof file === 'string' ? file : file.name);

    if (/^video\//.test(type) || VIDEO_EXTENSIONS.includes(ext))
        return 'video';

    return /^audio\//.test(type) || AUDIO_EXTENSIONS.includes(ext) ? 'audio' : 'image';
}

/**
 * @param {Object} ctx - {app, ops}
 */
export function createReferences({app, ops}) {
    // Original names of the files uploaded under the fixed names, by the fixed name
    const originalNames = new Map();

    function getSlots(kind) {
        const {role, widget} = KINDS[kind];
        const marker = getRoleMarker(role, ops.nodeConfig);

        return getMarkerTargets(app, role, ops.nodeConfig)
            .map((target, order) => ({target, order, index: getNodeMarkerIndex(target.host, marker) ?? 0}))
            .sort((a, b) => a.index - b.index || a.order - b.order)
            .map(({target}) => ({
                kind,
                target,
                widgetName: getRoleWidgetName(role, ops.nodeConfig, target) ?? widget,
                // A slot inside a subgraph cannot be bypassed alone
                canBypass: target.host === target.source
            }));
    }

    const isUsed = slot => !slot.canBypass || slot.target.source.mode !== MODE_BYPASS;

    function setUsed(slot, used) {
        if (!slot.canBypass)
            return;

        for (const node of getBypassChain(slot.target.source, ops.nodeConfig?.bypass_when_empty ?? {}))
            node.mode = used ? MODE_ALWAYS : MODE_BYPASS;
    }

    /**
     * The node downstream of a slot whose type has limits for clips (the limits section of the role), with them
     * @returns {Object|null} {consumer: node id, type, ...limits}
     */
    function getLimits(slot) {
        const limits = ops.nodeConfig?.[KINDS[slot.kind].role.configKey]?.limits;

        if (!limits || !slot.canBypass)
            return null;

        const node = slot.target.source;
        const queue = [node];
        const visited = new Set(queue);

        while (queue.length && visited.size < MAX_FOLLOWED) {
            const current = queue.shift();

            for (const output of current.outputs ?? []) {
                for (const linkId of output.links ?? []) {
                    const link = current.graph?.getLink?.(linkId) ?? current.graph?.links?.[linkId];
                    const consumer = link && current.graph.getNodeById(link.target_id);

                    if (!consumer || visited.has(consumer))
                        continue;

                    if (limits[consumer.type])
                        return {consumer: consumer.id, type: consumer.type, ...limits[consumer.type]};

                    visited.add(consumer);
                    queue.push(consumer);
                }
            }
        }

        return null;
    }

    // {url, name, limits} of a video or audio slot in use; the name is that of the file added, while it is known
    function describe(slot) {
        const value = getTargetWidget(slot.target, slot.widgetName)?.value;
        const fileName = typeof value === 'string' ? value.replace(/\s*\[\w+]$/, '').split('/').pop() : null;

        return {url: getViewUrl(value), name: originalNames.get(fileName) ?? fileName, limits: getLimits(slot)};
    }

    /**
     * The references in the shape of the WebUI ones; null if no node is marked (the tab shows no references).
     * videos / audios are null without slots of their kind, continuation without an ib:ext node
     * @returns {Object|null}
     */
    function captureState() {
        const slots = Object.fromEntries(Object.keys(KINDS).map(kind => [kind, getSlots(kind)]));

        if (!Object.values(slots).some(list => list.length))
            return null;

        const media = kind => slots[kind].length ? slots[kind].filter(isUsed).map(describe) : null;
        const continuation = slots.continuation[0];

        return {
            enabled: null,
            maxSize: null,
            edit: null,
            images: slots.image.filter(isUsed).map(slot => getTargetImageUrl(slot.target, slot.widgetName)),
            videos: media('video'),
            audios: media('audio'),
            hasContinuation: !!continuation,
            continuation: continuation && isUsed(continuation) ? describe(continuation) : null
        };
    }

    /**
     * Put a file into a slot: upload it under the slot's own name, set it and use the slot
     * @param {Object} slot
     * @param {number} index - Index of the slot among those of its kind
     * @param {File|Blob|string} file - A file, or the name of a file in the input directory (copied)
     */
    async function fillSlot(slot, index, file) {
        const sourceName = typeof file === 'string' ? file : file.name;
        const blob = typeof file === 'string' ? await (await fetch(getViewUrl(file))).blob() : file;
        const fileName = KINDS[slot.kind].fileName(index, extensionOf(sourceName) || (slot.kind === 'audio' ? 'mp3' : 'mp4'));
        const name = await uploadInputImage(blob, fileName);

        if (sourceName)
            originalNames.set(fileName, sourceName.split(/[\\/]/).pop());

        setLoadImage(slot.target, slot.widgetName, name);
        setUsed(slot, true);
    }

    /**
     * Put files into the free slots of their kinds; the last file of a kind replaces its last slot if none is free.
     * Each slot has its own file, so a file of the input directory (sent from the editor) is copied
     * @param {Array<File|string>} files - Files, or names of files in the input directory
     * @returns {Promise<boolean>} Whether the workflow has slots for all of the files
     */
    async function addFiles(files) {
        let placed = true;

        for (const file of files) {
            const slots = getSlots(kindOf(file));

            if (!slots.length) {
                placed = false;
                continue;
            }

            const slot = slots.find(slot => !isUsed(slot)) ?? slots[slots.length - 1];
            await fillSlot(slot, slots.indexOf(slot), file);
        }

        app.graph.setDirtyCanvas(true, true);
        return placed;
    }

    /**
     * Set the video an "Extend video" continues
     * @param {string} url - URL of the video (a /view URL)
     * @returns {Promise<boolean>} Whether the workflow has a node marked ib:ext
     */
    async function setContinuation(url) {
        const slot = getSlots('continuation')[0];

        if (!slot)
            return false;

        const blob = await (await fetch(url)).blob();
        const name = new URL(url, location.href).searchParams.get('filename') || 'video.mp4';
        await fillSlot(slot, 0, new File([blob], name, {type: blob.type}));
        app.graph.setDirtyCanvas(true, true);
        return true;
    }

    /**
     * @param {string} kind - image, video, audio or continuation
     * @param {number} index - Index among the slots of the kind in use, as the panel lists them
     */
    function removeFile(kind, index) {
        const slot = getSlots(kind).filter(isUsed)[index];

        if (slot)
            setUsed(slot, false);

        app.graph.setDirtyCanvas(true, true);
    }

    // All references; the video to extend stays
    function clearFiles() {
        for (const kind of ['image', 'video', 'audio'])
            for (const slot of getSlots(kind))
                setUsed(slot, false);

        app.graph.setDirtyCanvas(true, true);
    }

    /**
     * Edit the references: {add: File[]} | {remove: number, kind?} | {clear: true}
     */
    async function edit(change) {
        if (change.add)
            await addFiles(change.add);
        else if (change.remove !== undefined)
            removeFile(change.kind ?? 'image', change.remove);
        else if (change.clear)
            clearFiles();
    }

    return {captureState, addImages: addFiles, setContinuation, edit};
}
