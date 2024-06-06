window.kraftwerk = window.kraftwerk || {};
kraftwerk = window.kraftwerk;

kraftwerk.core = (function () {

    async function init() {
        kraftwerk.generationState = "BATCH_GENERATION";

        await fetch('/kraftwerk/config.json?_=' + (+new Date()))
            .then(response => response.json())
            .then(config => {
                try {
                    kraftwerk.config = config;
                } catch (error) {
                    console.error('[state]: Error:', error);
                }
            })
            .catch(error => console.error('[state]: Error getting JSON file:', error));

        if (kraftwerk.config?.repositionConfigPresetsDropdown) {
            await kraftwerk.utils.sleep(2000);
            await repositionConfigPresetsDropdown("txt2img");
            await repositionConfigPresetsDropdown("img2img");
        }

        initUI();

        //document.getElementById("txt2img_generate").click();
    }

    function getGenerationState() {
        return kraftwerk.generationState;
    }

    async function repositionConfigPresetsDropdown(kind) {
        const configPresetsDiv = document.getElementById(`config_preset_wrapper_${kind}`);

        if (configPresetsDiv) {
            const resultsDiv = document.getElementById(`${kind}_results`);

            configPresetsDiv.parentNode.removeChild(configPresetsDiv);
            resultsDiv.insertBefore(configPresetsDiv, resultsDiv.firstChild);
        }
    }

    function initUI() {
        //window.name = "sd-webui-main-window";
        let quickSettings = gradioApp().getElementById("quicksettings");
        let className = quickSettings.querySelector('button').className;

        quickSettings.appendChild(kraftwerk.utils.html.createHeaderButton('Kraftwerk', "🏭", className, {}, onShowWindow));

        kraftwerk.popup = null;

        const generateButton = document.getElementById("txt2img_generate");
        generateButton.addEventListener("mousedown", onGenerateMousedown);
        const interruptButton = document.getElementById("txt2img_interrupt");
        generateButton.addEventListener("mousedown", onInterruptMousedown);

        window.addEventListener("message", onMessage);
    }

    function onGenerateMousedown(e) {
        kraftwerk.generationState = "BATCH_GENERATION";
    }

    function onInterruptMousedown(e) {
        if (kraftwerk.generationState === "HIRES_FIX") {
            if (kraftwerk.upscaleQueue.length)
                kraftwerk.upscaleQueue = [];
        }
        else if (kraftwerk.generationState === "EXPLORE_MODELS") {
            if (kraftwerk.exploreQueue.length)
                kraftwerk.exploreQueue = [];
        }

        kraftwerk.generationState = "BATCH_GENERATION";
    }

    function createSocket() {
        if (!kraftwerk.socket) {
            kraftwerk.socket = new WebSocket("ws://" + location.host + "/kraftwerk/websocket");
            // kraftwerk.socket.onopen = e => {
            // }
            kraftwerk.socket.onmessage = onBackendMessage;
        }
    }

    function onBackendMessage(e) {
        if (e?.data) {
            const msg = JSON.parse(e.data);
            kraftwerk.popup?.onSDEvent(msg);

            if (msg.type === "SAVED_IMAGE") {
                if (kraftwerk.generationState === "HIRES_FIX") {
                    upscaleNextImage();
                }
                if (kraftwerk.generationState === "EXPLORE_MODELS") {
                    exploreNextImage();
                }
            }
        }
    }

    function onShowWindow() {
        if (!kraftwerk.popup) {
            createSocket();

            const windowFeatures = 'width=800,height=600,left=100,top=100';
            kraftwerk.popup = window.open("/kraftwerk/window", '_blank', windowFeatures);
            kraftwerk.popup.getGenerationState = getGenerationState;
            kraftwerk.popup.addEventListener("unload", () => {
                if (kraftwerk.popup.location.href !== "about:blank")
                    kraftwerk.popup = null;
            });
        }
        else {
            kraftwerk.popup.focus();
        }
    }

    function onMessage(msg) {
        const payload = msg.data;

        if (payload.type === "EXPLORE_MODELS")
            exploreModels(payload.models, payload.generateImages);
        else if (payload.type === "UPSCALE_IMAGES")
            upscaleImages(payload.images);
        else if (payload.type === "SET_IMAGE_PARAMS")
            setImageParams(payload.parameters)
    }

    async function upscaleImages(images) {
        kraftwerk.generationState = "HIRES_FIX";
        kraftwerk.upscaleQueue = images;

        const batchesInput = document.querySelector("#txt2img_batch_count input[type='number']");

        enableHiresFix();
        setInputValue(batchesInput, 1);

        return upscaleImage(kraftwerk.upscaleQueue.shift());
    }

    async function upscaleImage(imageData) {
        if (!imageData)
            return;

        const seedInput = document.querySelector("#txt2img_seed input");
        const generateButton = document.getElementById("txt2img_generate");

        const parameters = imageData.parameters;

        setInputValue(seedInput, parameters["seed"]);

        if ("variation seed" in parameters) {
            const subseedInput = document.querySelector("#txt2img_subseed input");
            setInputValue(subseedInput, parameters["variation seed"]);
        }

        await kraftwerk.utils.sleep(500);

        generateButton.click();
    }

    function upscaleNextImage() {
        const nextImage = kraftwerk.upscaleQueue.shift();

        if (nextImage)
            return upscaleImage(nextImage);
        else {
            const seedInput = document.querySelector("#txt2img_seed input");
            const subseedInput = document.querySelector("#txt2img_subseed input");

            setInputValue(seedInput, -1);
            setInputValue(subseedInput, -1);
        }
    }

    function enableHiresFix() {
        const hrFixCheckbox = document.getElementById("txt2img_hr-visible-checkbox");

        if (!hrFixCheckbox.checked) {
            var inputEvent = new Event('input', {
                'bubbles': true,
                'cancelable': true
            });

            var clickEvent = new MouseEvent('click', {
                'view': window,
                'bubbles': true,
                'cancelable': true,
                'buttons': 1
            });

            hrFixCheckbox.dispatchEvent(clickEvent);
            hrFixCheckbox.dispatchEvent(inputEvent);
        }
    }

    function setInputValue(inputElement, value, blur = true) {
        inputElement.value = value;

        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        inputElement.dispatchEvent(inputEvent);

        if (blur) {
            const blurEvent = new Event('blur', {bubbles: true, cancelable: true});
            inputElement.dispatchEvent(blurEvent);
        }
    }

    async function setImageParams(params) {
        if (!params)
            return;

        const seedInput = document.querySelector("#txt2img_seed input");
        const parameters = params;

        setInputValue(seedInput, parameters["seed"]);

        if ("variation seed" in parameters) {
            const subseedInput = document.querySelector("#txt2img_subseed input");
            setInputValue(subseedInput, parameters["variation seed"]);
        }
    }

    async function exploreModels(models, generateImages) {
        if (!models.length)
            return;

        kraftwerk.generationState = "EXPLORE_MODELS";
        kraftwerk.exploreQueue = [];
        kraftwerk.exploreModel = models[0];
        await setActiveModel(kraftwerk.exploreModel.model_name);

        const batchesInput = document.querySelector("#txt2img_batch_count input[type='number']");
        setInputValue(batchesInput, 1);
        const seedInput = document.querySelector("#txt2img_seed input");
        setInputValue(seedInput, -1);

        for (const model of models) {
            for (let i = 0; i < generateImages; ++i) {
                kraftwerk.exploreQueue.push(model);
            }
        }

        return exploreImage(kraftwerk.exploreQueue.shift());
    }

    async function setActiveModel(modelName) {
        const optionsURL = `http://${location.host}/sdapi/v1/options`;
        const opts = await fetch(optionsURL).then(r => r.json());

        opts.sd_model_checkpoint = modelName;
        await fetch(optionsURL, {method: "post", body: JSON.stringify(opts), headers: {"content-type": "application/json"}});
    }

    async function exploreImage(model) {
        if (!model)
            return;

        if (kraftwerk.exploreModel.hash !== model.hash) {
            await setActiveModel(model.model_name);
            kraftwerk.exploreModel = model;
        }

        await kraftwerk.utils.sleep(1000);

        const generateButton = document.getElementById("txt2img_generate");
        generateButton.click();
    }

    function exploreNextImage() {
        const model = kraftwerk.exploreQueue.shift();

        if (model)
            return exploreImage(model);
    }

    return { init };
}());
