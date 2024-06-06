window.imageBench = window.imageBench || {};
imageBench = window.imageBench;

imageBench.core = (function () {

    async function init() {
        imageBench.generationState = "BATCH_GENERATION";

        await fetch('/image-bench/config.json?_=' + (+new Date()))
            .then(response => response.json())
            .then(config => {
                try {
                    imageBench.config = config;
                } catch (error) {
                    console.error('[state]: Error:', error);
                }
            })
            .catch(error => console.error('[state]: Error getting JSON file:', error));

        if (imageBench.config?.repositionConfigPresetsDropdown) {
            await imageBench.utils.sleep(2000);
            await repositionConfigPresetsDropdown("txt2img");
            await repositionConfigPresetsDropdown("img2img");
        }

        initUI();

        //document.getElementById("txt2img_generate").click();
    }

    function getGenerationState() {
        return imageBench.generationState;
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

        quickSettings.appendChild(imageBench.utils.html.createHeaderButton('Image Bench', "🔬", className, {}, onShowWindow));

        imageBench.popup = null;

        const generateButton = document.getElementById("txt2img_generate");
        generateButton.addEventListener("mousedown", onGenerateMousedown);
        const interruptButton = document.getElementById("txt2img_interrupt");
        generateButton.addEventListener("mousedown", onInterruptMousedown);

        window.addEventListener("message", onMessage);
    }

    function onGenerateMousedown(e) {
        imageBench.generationState = "BATCH_GENERATION";
    }

    function onInterruptMousedown(e) {
        if (imageBench.generationState === "HIRES_FIX") {
            if (imageBench.upscaleQueue.length)
                imageBench.upscaleQueue = [];
        }
        else if (imageBench.generationState === "EXPLORE_MODELS") {
            if (imageBench.exploreQueue.length)
                imageBench.exploreQueue = [];
        }

        imageBench.generationState = "BATCH_GENERATION";
    }

    function createSocket() {
        if (!imageBench.socket) {
            imageBench.socket = new WebSocket("ws://" + location.host + "/image-bench/websocket");
            // imageBench.socket.onopen = e => {
            // }
            imageBench.socket.onmessage = onBackendMessage;
        }
    }

    function onBackendMessage(e) {
        if (e?.data) {
            const msg = JSON.parse(e.data);
            imageBench.popup?.onSDEvent(msg);

            if (msg.type === "SAVED_IMAGE") {
                if (imageBench.generationState === "HIRES_FIX") {
                    upscaleNextImage();
                }
                if (imageBench.generationState === "EXPLORE_MODELS") {
                    exploreNextImage();
                }
            }
        }
    }

    function onShowWindow() {
        if (!imageBench.popup) {
            createSocket();

            const windowFeatures = 'width=800,height=600,left=100,top=100';
            imageBench.popup = window.open("/image-bench/window", '_blank', windowFeatures);
            imageBench.popup.getGenerationState = getGenerationState;
            imageBench.popup.addEventListener("unload", () => {
                if (imageBench.popup.location.href !== "about:blank")
                    imageBench.popup = null;
            });
        }
        else {
            imageBench.popup.focus();
        }
    }

    function onMessage(msg) {
        const payload = msg.data;

        if (payload.type === "EXPLORE_MODELS")
            exploreModels(payload.models, payload.generateImages);
        else if (payload.type === "UPSCALE_IMAGES")
            upscaleImages(payload.images);
        else if (payload.type === "SET_IMAGE_SEED")
            setImageSeed(payload.parameters)
        else if (payload.type === "SET_IMAGE_PARAMS")
            setImageParams(payload.parameters)
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

    async function upscaleImages(images) {
        imageBench.generationState = "HIRES_FIX";
        imageBench.upscaleQueue = images;

        const batchesInput = document.querySelector("#txt2img_batch_count input[type='number']");

        enableHiresFix();
        setInputValue(batchesInput, 1);

        return upscaleImage(imageBench.upscaleQueue.shift());
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

        await imageBench.utils.sleep(500);

        generateButton.click();
    }

    function upscaleNextImage() {
        const nextImage = imageBench.upscaleQueue.shift();

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

    async function setImageSeed(params) {
        if (!params)
            return;

        const seedInput = document.querySelector("#txt2img_seed input");
        setInputValue(seedInput, params["seed"]);

        if ("variation seed" in params) {
            const subseedInput = document.querySelector("#txt2img_subseed input");
            setInputValue(subseedInput, params["variation seed"]);
        }
    }

    async function setImageParams(params) {
        if (!params)
            return;

        const promptInput = document.querySelector("#txt2img_prompt textarea");
        setInputValue(promptInput, params["prompt"]);
        const negativePromptInput = document.querySelector("#txt2img_neg_prompt textarea");
        setInputValue(negativePromptInput, params["negative"]);
        // const samplerInput = document.querySelector("#txt2img_sampling input");
        // setInputValue(samplerInput, params["sampler"]);
        // const schedulerInput = document.querySelector("#txt2img_scheduler input");
        // setInputValue(schedulerInput, params["scheduler type"]);
        const stepsInput = document.querySelector("#txt2img_steps input");
        setInputValue(stepsInput, params["steps"]);
        const cfgScaleInput = document.querySelector("#txt2img_cfg_scale input");
        setInputValue(cfgScaleInput, params["cfg scale"])
        const seedInput = document.querySelector("#txt2img_seed input");
        setInputValue(seedInput, params["seed"]);
        if ("variation seed" in params) {
            const subseedInput = document.querySelector("#txt2img_subseed input");
            setInputValue(subseedInput, params["variation seed"]);
            const subseedStrengthInput = document.querySelector("#txt2img_subseed_strength input");
            setInputValue(subseedStrengthInput, params["variation seed strength"]);
        }
        const sizes = params["size"].split("x");
        const widthInput = document.querySelector("#txt2img_width input");
        setInputValue(widthInput, sizes[0]);
        const heightInput = document.querySelector("#txt2img_height input");
        setInputValue(heightInput, sizes[1]);
        const clipSkipInput = document.querySelector("#setting_CLIP_stop_at_last_layers input");
        if (clipSkipInput && "clip skip" in params)
            setInputValue(clipSkipInput, params["clip skip"]);
        const denoisingInput = document.querySelector("#txt2img_denoising_strength input");
        if (denoisingInput && "denoising strength" in params)
            setInputValue(denoisingInput, params["denoising strength"]);
        const hiresStepsInput = document.querySelector("#txt2img_hr_scale input");
        if (hiresStepsInput && "hires steps" in params)
            setInputValue(hiresStepsInput, params["hires steps"]);
        const hiresUpscaleInput = document.querySelector("#txt2img_hr_scale input");
        if (hiresUpscaleInput && "hires upscale" in params) {
            setInputValue(hiresUpscaleInput, params["hires upscale"]);
            enableHiresFix();
        }

        const optionsURL = `http://${location.host}/sdapi/v1/options`;
        const opts = await fetch(optionsURL).then(r => r.json());
        opts.sd_model_checkpoint = params["model"];
        opts.sd_vae = params["vae"];
        await fetch(optionsURL, {method: "post", body: JSON.stringify(opts), headers: {"content-type": "application/json"}});
    }

    async function exploreModels(models, generateImages) {
        if (!models.length)
            return;

        imageBench.generationState = "EXPLORE_MODELS";
        imageBench.exploreQueue = [];
        imageBench.exploreModel = models[0];
        await setActiveModel(imageBench.exploreModel.model_name);

        const batchesInput = document.querySelector("#txt2img_batch_count input[type='number']");
        setInputValue(batchesInput, 1);
        const seedInput = document.querySelector("#txt2img_seed input");
        setInputValue(seedInput, -1);

        for (const model of models) {
            for (let i = 0; i < generateImages; ++i) {
                imageBench.exploreQueue.push(model);
            }
        }

        return exploreImage(imageBench.exploreQueue.shift());
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

        if (imageBench.exploreModel.hash !== model.hash) {
            await setActiveModel(model.model_name);
            imageBench.exploreModel = model;
        }

        await imageBench.utils.sleep(1000);

        const generateButton = document.getElementById("txt2img_generate");
        generateButton.click();
    }

    function exploreNextImage() {
        const model = imageBench.exploreQueue.shift();

        if (model)
            return exploreImage(model);
    }

    return { init };
}());
