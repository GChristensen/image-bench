window.imageBench = window.imageBench || {};
imageBench = window.imageBench;

// TODO: refactor to modules
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
        checkConnection();
        imageBench.generationState = "BATCH_GENERATION";
        imageBench.popup?.onSDEvent({type: "BEGIN_PROCESSING"});
    }

    function onInterruptMousedown(e) {
        if (imageBench.generationState === "HIRES_FIX") {
            if (imageBench.processingQueue.length)
                imageBench.processingQueue = [];
        }
        else if (imageBench.generationState === "EXPLORE_MODELS") {
            if (imageBench.exploreQueue.length)
                imageBench.exploreQueue = [];
        }

        imageBench.generationState = "BATCH_GENERATION";
        finishProcessing();
    }

    function createSocket() {
        if (!imageBench.socket) {
            imageBench.socket = new WebSocket("ws://" + location.host + "/image-bench/websocket");
            // imageBench.socket.onopen = e => {
            // }
            imageBench.socket.onmessage = onBackendMessage;
        }
    }

    function checkConnection() {
        if (imageBench.socket?.readyState === WebSocket.CLOSED) {
            //imageBench.popup?.onSDEvent({type: "SOCKET_CLOSED"});
            createSocket();
            return false
        }

        return true;
    }

    function onBackendMessage(e) {
        if (e?.data) {
            const msg = JSON.parse(e.data);

            if (msg.type === "SAVED_IMAGE" && imageBench.setSteps) {
                msg.setSteps = true;
            }

            imageBench.popup?.onSDEvent(msg);

            revertVaryingParams();

            if (msg.type === "SAVED_IMAGE") {
                if (imageBench.generationState === "HIRES_FIX"
                    || imageBench.generationState === "BATCH_GENERATION" && imageBench.setSteps) {
                    processNextImage();
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
        checkConnection();

        const payload = msg.data;

        if (payload.type === "EXPLORE_MODELS")
            exploreModels(payload.models, payload.generateImages);
        if (payload.type === "BATCH_GENERATE")
            batchGenerate(payload.preset);
        else if (payload.type === "UPSCALE_IMAGES")
            processImages(payload.images, payload.preset);
        else if (payload.type === "SET_IMAGE_SEED")
            setImageSeed(payload.parameters)
        else if (payload.type === "SET_IMAGE_PARAMS")
            setImageParams(payload.parameters)
        else if (payload.type === "GENERATE_VARYING_STEPS")
            generateVaryingSteps(payload.image, payload.steps)
        else if (payload.type === "UPSCALE_VARYING_DENOISING")
            upscaleVaryingDenoising(payload.image, payload.denoising)
    }

    async function setImageSeed(params) {
        if (!params)
            return;

        setInputValue("#txt2img_seed input", params["seed"]);

        if ("variation seed" in params)
            setInputValue("#txt2img_subseed input", params["variation seed"]);
    }

    async function setImageParams(params) {
        if (!params)
            return;

        await setDropdownValue("#setting_sd_model_checkpoint input", params["model"]);
        await setDropdownValue("#setting_sd_vae input", params["vae"]);

        setInputValue("#txt2img_prompt textarea", params["prompt"]);
        setInputValue("#txt2img_neg_prompt textarea", params["negative"]);
        await setDropdownValue("#txt2img_sampling input", params["sampler"]);
        await setDropdownValue("#txt2img_scheduler input", params["schedule type"]);
        setInputValue("#txt2img_steps input", params["steps"]);
        setInputValue("#txt2img_cfg_scale input", params["cfg scale"])
        setInputValue("#txt2img_seed input", params["seed"]);
        if ("variation seed" in params) {
            setInputValue("#txt2img_subseed input", params["variation seed"]);
            setInputValue("#txt2img_subseed_strength input", params["variation seed strength"]);
        }
        const sizes = params["size"].split("x");
        setInputValue("#txt2img_width input", sizes[0]);
        setInputValue("#txt2img_height input", sizes[1]);
        if ("clip skip" in params)
            setInputValue("#setting_CLIP_stop_at_last_layers input", params["clip skip"]);
        if ("denoising strength" in params)
            setInputValue("#txt2img_denoising_strength input", params["denoising strength"]);
        if ("hires steps" in params)
            setInputValue("#txt2img_hr_scale input", params["hires steps"]);
        if ("hires upscale" in params) {
            setInputValue("#txt2img_hr_scale input", params["hires upscale"]);
            toggleHiresFix(true);
        }
    }

    function getInputValue(inputElementSelector) {
        const inputElement = document.querySelector(inputElementSelector);
        if (inputElement)
            return inputElement.value;
    }

    function setInputValue(inputElementSelector, value, blur = true) {
        const inputElement = document.querySelector(inputElementSelector);
        if (!inputElement) {
            console.log(`Input element ${inputElementSelector} not found.`);
            return;
        }
        inputElement.value = value;

        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        inputElement.dispatchEvent(inputEvent);

        if (blur) {
            const blurEvent = new Event('blur', {bubbles: true, cancelable: true});
            inputElement.dispatchEvent(blurEvent);
        }
    }

    async function setDropdownValue(inputElementSelector, value, blur = true) {
        const inputElement = document.querySelector(inputElementSelector);
        if (!inputElement) {
            console.log(`Input element ${inputElementSelector} not found.`);
            return;
        }

        if (inputElement.value.includes(value))
            return;

        inputElement.value = value;

        const focusEvent = new Event("focus", { bubbles: true, cancelable: true });
        inputElement.dispatchEvent(focusEvent);
        inputElement.focus();

        await imageBench.utils.sleep(333);

        const optionList = inputElement.closest(".block").querySelector("ul");

        if (optionList) {
            const options = Array.from(optionList.querySelectorAll("li"));

            for (const optionElement of options) {
                if (optionElement.getAttribute("data-value").includes(value)) {
                    const mousedownEvent = new MouseEvent('mousedown', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        button: 0
                    });

                    optionElement.dispatchEvent(mousedownEvent)
                    return;
                }
            }
        }
    }

    function toggleHiresFix(onlyEnable) {
        const hrFixCheckbox = document.getElementById("txt2img_hr-visible-checkbox");
        let toggle = true;

        if (onlyEnable)
            toggle = !hrFixCheckbox.checked;

        if (toggle) {
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

    async function batchGenerate(preset) {
        imageBench.generationState = "BATCH_GENERATION";
        imageBench.popup?.onSDEvent({type: "BEGIN_PROCESSING"});

        setInputValue("#txt2img_seed input", -1);

        if (preset)
            await setDropdownValue("#config_preset_txt2img_dropdown input", preset);

        await imageBench.utils.sleep(500);

        const generateButton = document.getElementById("txt2img_generate");
        generateButton.click();
    }

    async function processImages(images, preset, options) {
        imageBench.generationState = options?.setSteps? "BATCH_GENERATION": "HIRES_FIX";
        imageBench.popup?.onSDEvent({type: "BEGIN_PROCESSING"});
        imageBench.processingQueue = images;
        imageBench.setDenoising = options?.setDenoising;
        imageBench.setSteps = options?.setSteps;
        imageBench.stepsBeforeProcessing = getInputValue("#txt2img_steps input");
        imageBench.denoisingBeforeProcessing = getInputValue("#txt2img_denoising_strength input");

        if (preset) {
            await setDropdownValue("#config_preset_txt2img_dropdown input", preset);
            await imageBench.utils.sleep(500);
        }

        if (!imageBench.setSteps)
            toggleHiresFix(true);

        setInputValue("#txt2img_batch_count input[type='number']", 1);

        return processImage(imageBench.processingQueue.shift());
    }

    async function processImage(imageData) {
        if (!imageData)
            return;

        const parameters = imageData.parameters;

        setInputValue("#txt2img_seed input", parameters["seed"]);

        if ("variation seed" in parameters)
            setInputValue("#txt2img_subseed input", parameters["variation seed"]);

        if (imageBench.setDenoising && "denoising strength" in parameters)
            setInputValue("#txt2img_denoising_strength input", parameters["denoising strength"]);

        if (imageBench.setSteps || imageData.setSteps)
            setInputValue("#txt2img_steps input", parameters["steps"]);

        await imageBench.utils.sleep(500);

        const generateButton = document.getElementById("txt2img_generate");
        generateButton.click();
    }

    function processNextImage() {
        const nextImage = imageBench.processingQueue.shift();

        if (nextImage)
            return processImage(nextImage);
        else {
            if (!imageBench.setSteps)
                toggleHiresFix();

            finishProcessing();
        }
    }

    function finishProcessing() {
        revertVaryingParams();

        imageBench.stepsBeforeProcessing = undefined;
        imageBench.denoisingBeforeProcessing = undefined;
        imageBench.setDenoising = false;
        imageBench.setSteps = false;
    }

    function revertVaryingParams() {
        if (imageBench.stepsBeforeProcessing)
            setInputValue("#txt2img_steps input", imageBench.stepsBeforeProcessing);

        if (imageBench.denoisingBeforeProcessing)
            setInputValue("#txt2img_denoising_strength input", imageBench.denoisingBeforeProcessing);
    }

    function generateVaryingSteps(image, steps) {
        const stepValues = steps.split(",").map(s => s.trim());

        const images = [];
        for (const stepValue of stepValues) {
            const nextImage = {...image};
            nextImage.parameters = {...image.parameters};
            nextImage.parameters["steps"] = parseInt(stepValue);
            images.push(nextImage);
        }

        return processImages(images, null, {setSteps: true});
    }

    function upscaleVaryingDenoising(image, denoising) {
        const denoisingLevels = denoising.split(",").map(s => s.trim());

        const images = [];
        for (const level of denoisingLevels) {
            const nextImage = {...image};
            nextImage.parameters = {...image.parameters};
            nextImage.parameters["denoising strength"] = parseFloat(level);
            images.push(nextImage);
        }

        return processImages(images, null, {setDenoising: true});
    }

    async function exploreModels(models, generateImages) {
        if (!models.length)
            return;

        imageBench.generationState = "EXPLORE_MODELS";
        imageBench.popup?.onSDEvent({type: "BEGIN_PROCESSING"});
        imageBench.exploreQueue = [];
        imageBench.exploreModel = models[0];
        await setActiveModel(imageBench.exploreModel.hash);

        setInputValue("#txt2img_batch_count input[type='number']", 1);
        setInputValue("#txt2img_seed input", -1);

        for (const model of models) {
            for (let i = 0; i < generateImages; ++i) {
                imageBench.exploreQueue.push(model);
            }
        }

        return exploreImage(imageBench.exploreQueue.shift());
    }

    async function setActiveModel(modelName) {
        // const optionsURL = `http://${location.host}/sdapi/v1/options`;
        // const opts = await fetch(optionsURL).then(r => r.json());
        //
        // opts.sd_model_checkpoint = modelName;
        // await fetch(optionsURL, {method: "post", body: JSON.stringify(opts), headers: {"content-type": "application/json"}});
        return setDropdownValue("#setting_sd_model_checkpoint input", modelName);
    }

    async function exploreImage(model) {
        if (!model)
            return;

        if (imageBench.exploreModel.hash !== model.hash) {
            await setActiveModel(model.hash);
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
