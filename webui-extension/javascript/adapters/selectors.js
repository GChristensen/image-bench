/**
 * CSS Selectors for SD WebUI/Forge
 * Centralized constants to avoid duplication and ease maintenance
 */

export const SELECTORS = {
    // Generation buttons
    TXT2IMG_GENERATE: 'txt2img_generate',
    IMG2IMG_GENERATE: 'img2img_generate',
    TXT2IMG_INTERRUPT: 'txt2img_interrupt',
    IMG2IMG_INTERRUPT: 'img2img_interrupt',
    // "Interrupting..." placeholder shown until an interrupted job ends (absent in older versions)
    TXT2IMG_INTERRUPTING: 'txt2img_interrupting',
    IMG2IMG_INTERRUPTING: 'img2img_interrupting',

    // Prompts
    TXT2IMG_PROMPT: '#txt2img_prompt textarea',
    TXT2IMG_NEG_PROMPT: '#txt2img_neg_prompt textarea',

    // Seeds
    TXT2IMG_SEED: '#txt2img_seed input',
    TXT2IMG_SUBSEED: '#txt2img_subseed input',
    TXT2IMG_SUBSEED_STRENGTH: '#txt2img_subseed_strength input',
    TXT2IMG_SUBSEED_SHOW: '#txt2img_subseed_show input',

    // Parameters
    TXT2IMG_STEPS: '#txt2img_steps input',
    TXT2IMG_CFG_SCALE: '#txt2img_cfg_scale input',
    TXT2IMG_DISTILLED_CFG: '#txt2img_distilled_cfg_scale input',
    TXT2IMG_DISTILLED_CFG_ID: 'txt2img_distilled_cfg_scale',
    TXT2IMG_WIDTH: '#txt2img_width input',
    TXT2IMG_HEIGHT: '#txt2img_height input',
    TXT2IMG_BATCH_COUNT: '#txt2img_batch_count input[type="number"]',
    IMG2IMG_BATCH_COUNT: '#img2img_batch_count input[type="number"]',
    TXT2IMG_DENOISING: '#txt2img_denoising_strength input',
    TXT2IMG_SAMPLING: '#txt2img_sampling input',
    TXT2IMG_SCHEDULER: '#txt2img_scheduler input',

    // img2img prompts and parameters
    IMG2IMG_PROMPT: '#img2img_prompt textarea',
    IMG2IMG_NEG_PROMPT: '#img2img_neg_prompt textarea',
    IMG2IMG_SEED: '#img2img_seed input',
    IMG2IMG_SUBSEED: '#img2img_subseed input',
    IMG2IMG_SUBSEED_STRENGTH: '#img2img_subseed_strength input',
    IMG2IMG_SUBSEED_SHOW: '#img2img_subseed_show input',
    IMG2IMG_STEPS: '#img2img_steps input',
    IMG2IMG_CFG_SCALE: '#img2img_cfg_scale input',
    IMG2IMG_DISTILLED_CFG: '#img2img_distilled_cfg_scale input',
    IMG2IMG_DISTILLED_CFG_ID: 'img2img_distilled_cfg_scale',
    IMG2IMG_WIDTH: '#img2img_width input',
    IMG2IMG_HEIGHT: '#img2img_height input',
    IMG2IMG_DENOISING: '#img2img_denoising_strength input',
    IMG2IMG_SAMPLING: '#img2img_sampling input',
    IMG2IMG_SCHEDULER: '#img2img_scheduler input',

    // img2img mode tabs and the inpaint upload images
    IMG2IMG_MODE_TABS: 'mode_img2img',
    IMG2IMG_INPAINT_UPLOAD_TAB: 'img2img_inpaint_upload_tab',
    IMG2IMG_INPAINT_UPLOAD_IMAGE: 'img_inpaint_base',
    IMG2IMG_INPAINT_UPLOAD_MASK: 'img_inpaint_mask',
    IMAGE_COMPONENT: '[data-testid="image"]',
    FILE_INPUT: 'input[type="file"]',

    // Model/VAE/Settings
    MODEL_CHECKPOINT: '#setting_sd_model_checkpoint input, .model_selection input',
    SD_VAE: '#setting_sd_vae input',
    CLIP_SKIP: '#setting_CLIP_stop_at_last_layers input',
    FORGE_UI_PRESET: '#forge_ui_preset input',
    FORGE_UI_PRESET_ID: 'forge_ui_preset',

    // Hires fix
    HIRES_CHECKBOX: 'txt2img_hr-visible-checkbox',
    HIRES_SCALE: '#txt2img_hr_scale input',

    // Config presets
    CONFIG_PRESET_TXT2IMG_DROPDOWN: '#config_preset_txt2img_dropdown input',
    CONFIG_PRESET_WRAPPER: (kind) => `config_preset_wrapper_${kind}`,
    RESULTS_DIV: (kind) => `${kind}_results`,

    // Gallery & ControlNet (generated images are filtered out by the backend)
    TXT2IMG_GALLERY: '#txt2img_gallery_container .thumbnail-item img[src*="file="]',

    // Progress
    PROGRESS_BAR: '.progressDiv .progress',

    // Dropdown elements
    DROPDOWN_BLOCK: '.block',
    DROPDOWN_LIST: 'ul',
    DROPDOWN_OPTION: 'li',

    // Forge detection
    FORGE_INDICATOR: '[id^="forge"]',

    // PNG Info / Send to
    SEND_TO_TXT2IMG: '#tab_pnginfo #txt2img_tab',

    // Quick settings
    QUICK_SETTINGS: 'quicksettings'
};

/**
 * Helper to get element by ID (without # prefix)
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
export function getElementById(id) {
    return document.getElementById(id);
}

/**
 * Helper to query selector
 * @param {string} selector - CSS selector
 * @returns {HTMLElement|null}
 */
export function querySelector(selector) {
    return document.querySelector(selector);
}

/**
 * Helper to query all selectors
 * @param {string} selector - CSS selector
 * @returns {NodeList}
 */
export function querySelectorAll(selector) {
    return document.querySelectorAll(selector);
}
