window.kraftwerk = window.kraftwerk || {};
kraftwerk = window.kraftwerk;

kraftwerk.core = (function () {

    async function init() {
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
            await new Promise(rs => setTimeout(rs, 2000));
            await repositionConfigPresetsDropdown("txt2img");
            await repositionConfigPresetsDropdown("img2img");
        }

        initUI();

        //document.getElementById("txt2img_generate").click();
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
        let quickSettings = gradioApp().getElementById("quicksettings");
        let className = quickSettings.querySelector('button').className;

        quickSettings.appendChild(kraftwerk.utils.html.createHeaderButton('Kraftwerk', "🏭", className, {}, onShowWindow));

        kraftwerk.popup = null;

        window.addEventListener("message", onMessage);
    }

    function createSocket() {
        if (!kraftwerk.socket) {
            kraftwerk.socket = new WebSocket("ws://" + location.host + "/kraftwerk/websocket");
            // kraftwerk.socket.onopen = e => {
            // }
            kraftwerk.socket.onmessage = e => {
                if (e?.data) {
                    const msg = JSON.parse(e.data);
                    kraftwerk.popup?.onSDEvent(msg);
                }
            };
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

    function onCloseWindow(e) {
        print(e)
    }

    function onMessage(msg) {
        console.log(msg)
    }

    function getGenerationState() {
        return "BATCH_GENERATION";
    }

    return { init };
}());
