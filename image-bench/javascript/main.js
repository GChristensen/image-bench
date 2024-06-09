document.addEventListener('DOMContentLoaded', async function() {
    const core = await import("./core.js");
    onUiLoaded(core.init);
});
