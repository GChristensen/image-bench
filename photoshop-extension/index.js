/**
 * Image Bench Photoshop plugin
 * Sends the active document and its selection (as a black and white mask)
 * to the inpaint upload tab of img2img in SD WebUI with the Image Bench extension,
 * and places images sent from the Image Bench window into Photoshop
 */

const {entrypoints, storage} = require("uxp");
const {action, app, core, imaging} = require("photoshop");

const fs = storage.localFileSystem;

const DEFAULT_WEBUI_URL = "http://127.0.0.1:7860";
const WEBUI_URL_KEY = "webuiUrl";
const PLUGIN_WEBSOCKET_PATH = "/image-bench/photoshop/plugin-websocket";
const RECONNECT_DELAY = 5000;

function getWebuiUrl() {
    return (localStorage.getItem(WEBUI_URL_KEY) || DEFAULT_WEBUI_URL).replace(/\/+$/, "");
}

/**
 * Read 8-bit pixels of the whole document area, whatever the source bounds of the returned data are
 * @param {Function} getPixels - Imaging API call returning {imageData, sourceBounds}
 * @param {Document} doc - Photoshop document
 * @param {string} commandName - Name of the modal operation shown in Photoshop
 * @returns {Promise<{data: Uint8Array, width: number, height: number, components: number}>}
 */
async function readPixels(getPixels, doc, commandName) {
    const width = Math.round(doc.width);
    const height = Math.round(doc.height);
    const documentBounds = {left: 0, top: 0, right: width, bottom: height};

    return core.executeAsModal(async () => {
        const {imageData, sourceBounds} = await getPixels({
            documentID: doc.id,
            sourceBounds: documentBounds,
            componentSize: 8
        });

        try {
            const data = await imageData.getData({chunky: true});
            return placeOnCanvas(data, imageData, sourceBounds ?? documentBounds, width, height);
        } finally {
            imageData.dispose();
        }
    }, {commandName});
}

/**
 * Put pixel data into a document-sized canvas (filled with zeros) at its source bounds
 * @returns {{data: Uint8Array, width: number, height: number, components: number}}
 */
function placeOnCanvas(data, imageData, bounds, width, height) {
    const components = imageData.components;

    if (bounds.left === 0 && bounds.top === 0 && imageData.width === width && imageData.height === height)
        return {data, width, height, components};

    const canvas = new Uint8Array(width * height * components);
    const rowLength = imageData.width * components;

    for (let y = 0; y < imageData.height; y++) {
        const row = data.subarray(y * rowLength, (y + 1) * rowLength);
        canvas.set(row, ((bounds.top + y) * width + bounds.left) * components);
    }

    return {data: canvas, width, height, components};
}

function getActiveDocument() {
    const doc = app.activeDocument;

    if (!doc)
        throw new Error("No document is open");

    return doc;
}

async function readDocumentImage(doc) {
    return readPixels(options => imaging.getPixels({...options, colorSpace: "RGB"}),
        doc, "Image Bench: Read Image");
}

async function readSelectionMask(doc) {
    if (doc.selection && !doc.selection.bounds)
        throw new Error("There is no selection");

    return readPixels(options => imaging.getSelection(options), doc, "Image Bench: Read Selection");
}

/**
 * Send pixels to the WebUI backend, which forwards them to the connected WebUI pages
 * @param {'image'|'mask'} kind - Image kind
 * @param {{data: Uint8Array, width: number, height: number, components: number}} pixels
 */
async function upload(kind, pixels) {
    const {data, width, height, components} = pixels;
    const query = Object.entries({kind, width, height, components})
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join("&");
    const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

    let response;
    try {
        response = await fetch(`${getWebuiUrl()}/image-bench/photoshop/upload?${query}`, {
            method: "POST",
            headers: {"Content-Type": "application/octet-stream"},
            body
        });
    } catch (error) {
        throw new Error(`Unable to connect to WebUI at ${getWebuiUrl()}`);
    }

    if (!response.ok)
        throw new Error(`WebUI responded with ${response.status}: ${await response.text()}`);

    const {clients} = await response.json();

    if (!clients)
        throw new Error("No WebUI page is open");
}

async function sendImage() {
    const doc = getActiveDocument();
    await upload("image", await readDocumentImage(doc));
    return "Image sent";
}

async function sendMask() {
    const doc = getActiveDocument();
    await upload("mask", await readSelectionMask(doc));
    return "Mask sent";
}

async function sendImageAndMask() {
    const doc = getActiveDocument();
    // Read the selection first, so nothing is sent if there is no selection
    const mask = await readSelectionMask(doc);
    await upload("image", await readDocumentImage(doc));
    await upload("mask", mask);
    return "Image and mask sent";
}

// ==================== RECEIVING ====================

let socket = null;
let reconnectTimer = null;

/**
 * Connect to WebUI to receive images sent from the Image Bench window.
 * The connection lives as long as the plugin is loaded, regardless of the panel visibility,
 * and is restored if lost (e.g. when WebUI restarts)
 */
function connect() {
    clearTimeout(reconnectTimer);

    let websocket;
    try {
        websocket = new WebSocket(getWebuiUrl().replace(/^http/i, "ws") + PLUGIN_WEBSOCKET_PATH);
    } catch (error) {
        console.error(error);
        setStatus(`Invalid WebUI URL: ${getWebuiUrl()}`, true);
        return;
    }

    socket = websocket;

    websocket.onopen = () => setConnected(true);
    websocket.onmessage = onWebuiMessage;
    websocket.onclose = () => {
        // A replaced connection is closed deliberately
        if (socket === websocket) {
            setConnected(false);
            reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
        }
    };
}

function reconnect() {
    const websocket = socket;
    socket = null;
    websocket?.close();
    setConnected(false);
    connect();
}

async function onWebuiMessage(e) {
    const msg = JSON.parse(e.data);

    if (msg.type !== "OPEN_IMAGE")
        return;

    try {
        await openImage(msg);
        setStatus(`Received ${msg.name}`);
    } catch (error) {
        console.error(error);
        setStatus(error.message, true);

        if (!panelVisible)
            await app.showAlert(`Image Bench: ${error.message}`);
    }
}

/**
 * Place a received image as a new layer of the active document, or open it if there is no document
 * or a new document is requested
 * @param {{name: string, imageUrl: string, newDocument?: boolean}} msg - Image file name, its URL relative to WebUI
 *   and whether to open it as a new document
 */
async function openImage({name, imageUrl, newDocument}) {
    const response = await fetch(getWebuiUrl() + imageUrl);

    if (!response.ok)
        throw new Error(`Unable to download ${name}: WebUI responded with ${response.status}`);

    const folder = await fs.getTemporaryFolder();
    const file = await folder.createFile(name, {overwrite: true});
    await file.write(await response.arrayBuffer(), {format: storage.formats.binary});

    await core.executeAsModal(async () => {
        if (app.documents.length && !newDocument)
            await placeAsLayer(file);
        else
            await app.open(file);
    }, {commandName: "Image Bench: Open Image"});
}

/**
 * Place a file as a smart object layer centered in the active document, named after the file
 */
async function placeAsLayer(file) {
    const [result] = await action.batchPlay([{
        _obj: "placeEvent",
        null: {_path: fs.createSessionToken(file), _kind: "local"},
        freeTransformCenterState: {_enum: "quadCenterState", _value: "QCSAverage"},
        offset: {
            _obj: "offset",
            horizontal: {_unit: "pixelsUnit", _value: 0},
            vertical: {_unit: "pixelsUnit", _value: 0}
        }
    }], {});

    if (result?._obj === "error")
        throw new Error(`Unable to place ${file.name}: ${result.message}`);
}

// ==================== UI ====================

let panelReady = false;
let panelVisible = false;

function setStatus(text, isError = false) {
    const status = document.getElementById("status");
    status.textContent = text;
    status.classList.toggle("error", isError);
}

function setConnected(connected) {
    const connection = document.getElementById("connection");
    connection.textContent = connected ? "Connected to WebUI" : "Not connected to WebUI";
    connection.classList.toggle("error", !connected);
}

/**
 * Run an action, reporting the result in the panel, or errors in an alert when invoked as a menu command
 * @param {Function} action - Action returning a status message
 * @param {boolean} fromPanel - Whether the action is invoked from the panel
 */
async function run(action, fromPanel = false) {
    try {
        if (fromPanel)
            setStatus("Sending...");

        const result = await action();

        if (fromPanel)
            setStatus(result);
    } catch (error) {
        console.error(error);

        if (fromPanel)
            setStatus(error.message, true);
        else
            await app.showAlert(`Image Bench: ${error.message}`);
    }
}

function initPanel() {
    if (panelReady)
        return;

    const urlField = document.getElementById("webui-url");
    urlField.value = getWebuiUrl();
    urlField.addEventListener("change", () => {
        localStorage.setItem(WEBUI_URL_KEY, urlField.value.trim());
        reconnect();
    });

    document.getElementById("send-image").addEventListener("click", () => run(sendImage, true));
    document.getElementById("send-mask").addEventListener("click", () => run(sendMask, true));
    document.getElementById("send-image-and-mask").addEventListener("click", () => run(sendImageAndMask, true));

    panelReady = true;
}

entrypoints.setup({
    commands: {
        sendImage: () => run(sendImage),
        sendMask: () => run(sendMask),
        sendImageAndMask: () => run(sendImageAndMask)
    },
    panels: {
        imageBenchPanel: {
            show() {
                initPanel();
                panelVisible = true;
            },
            hide() {
                panelVisible = false;
            }
        }
    }
});

connect();
