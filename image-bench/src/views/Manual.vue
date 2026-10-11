<script setup>
import {computed, onMounted, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {dialog} from "@/dialogs/useDialog.js";
import {HOST_NAME, isComfy, isWebUI} from "@/host.js";

const SECTIONS = [
  {id: "overview", title: "What it is for"},
  {id: "window", title: "The window"},
  {id: "generate", title: "Generate"},
  {id: "controlnet", title: "ControlNet"},
  {id: "explore", title: "Explore"},
  {id: "generated", title: "Generated"},
  {id: "trays", title: "Concept & image trays"},
  ...(isWebUI ? [{id: "upscaled", title: "Upscaled"}] : []),
  {id: "images", title: "Working with images"},
  {id: "settings", title: "Settings & actions"},
  {id: "photoshop", title: "Photoshop"},
  ...(isComfy ? [{id: "comfy-setup", title: "ComfyUI setup"}] : []),
  {id: "shortcuts", title: "Keyboard & mouse"},
  {id: "troubleshooting", title: "Troubleshooting"},
];

const content = ref(null);
const activeSection = ref(SECTIONS[0].id);

function scrollTo(id) {
  content.value?.querySelector(`#manual-${id}`)?.scrollIntoView({behavior: "smooth", block: "start"});
}

// Highlights the last section whose heading has scrolled to the top of the content
function onScroll() {
  const top = content.value.getBoundingClientRect().top + 40;
  let current = SECTIONS[0].id;

  for (const section of SECTIONS) {
    const element = content.value.querySelector(`#manual-${section.id}`);

    if (element && element.getBoundingClientRect().top <= top)
      current = section.id;
  }

  activeSection.value = current;
}

// Photoshop plugin supplied with the extension
const PLUGIN_URL = "/image-bench/photoshop/plugin";
const plugin = ref(null);
const installing = ref(false);
// Install copies the plugin to the computer running the host, which is not this one for a remote host
const hostOrigin = location.origin;
const isRemoteHost = !["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname);

const pluginState = computed(() => {
  const status = plugin.value;

  if (!status)
    return "";
  if (!status.available)
    return "The plugin files are missing from the extension.";
  if (!status.installed)
    return `Version ${status.available} is supplied; not installed${isRemoteHost ? " on the server computer" : ""}.`;
  if (status.installed !== status.available)
    return `Version ${status.installed} is installed, ${status.available} is supplied: install to update.`;

  return `Version ${status.installed} is installed${isRemoteHost ? " on the server computer" : ""}.`;
});

async function loadPluginStatus() {
  try {
    const response = await fetch(PLUGIN_URL);
    plugin.value = response.ok ? await response.json() : null;
  } catch (e) {
    plugin.value = null;
  }
}

// The elevated installer runs on its own; the status changes once it has written the plugin registry
async function waitForInstall(version) {
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await loadPluginStatus();

    if (plugin.value?.installed === version)
      return true;
  }

  return false;
}

async function onInstallPlugin() {
  if (isRemoteHost && !await dialog.confirm(
      `${HOST_NAME} runs on another computer (${location.hostname}). The plugin will be installed there, `
      + "not on this computer. Download the .ccx file to install it here.", {okText: "Install there"}))
    return;

  installing.value = true;

  try {
    const response = await fetch(`${PLUGIN_URL}/install`, {method: "POST"});
    const result = await response.json();

    if (!response.ok)
      throw new Error(result.detail || response.statusText);

    if (result.result === "elevating") {
      dialog.alert("Confirm the Windows administrator prompt to finish the installation.", {title: "Photoshop plugin"});

      if (!await waitForInstall(plugin.value?.available)) {
        await dialog.alert("The plugin was not installed. If the administrator prompt was declined, try again, "
            + "or install the downloaded .ccx file with the Creative Cloud app.", {title: "Photoshop plugin"});
        return;
      }
    } else
      await loadPluginStatus();

    await dialog.alert("The plugin is installed. Restart Photoshop and open Plugins › Image Bench.",
        {title: "Photoshop plugin"});
  } catch (e) {
    await dialog.alert(`Unable to install the plugin: ${e.message}`, {title: "Photoshop plugin"});
  } finally {
    installing.value = false;
  }
}

onMounted(loadPluginStatus);
</script>

<template>
<div class="manual">
  <nav class="manual-toc" aria-label="Manual contents">
    <h2>Manual</h2>
    <button v-for="section in SECTIONS" :key="section.id" class="toc-item"
            :class="{on: activeSection === section.id}" @click="scrollTo(section.id)">{{ section.title }}</button>
  </nav>

  <article class="manual-content scrollable" ref="content" @scroll.passive="onScroll">

    <section id="manual-overview">
      <h1>Image Bench for {{ HOST_NAME }}</h1>
      <p class="lead">
        Image Bench automates the repetitive micro-tasks of working with
        {{ isWebUI ? "SD WebUI (Forge / Forge Neo)" : "ComfyUI" }}: generating batches, comparing models,
        collecting the best images, moving images to and from Photoshop, etc. Everything is done from one window,
        without hunting for controls in the {{ HOST_NAME }} page.
      </p>
      <p>
        Image Bench does not generate anything itself; it drives {{ HOST_NAME }}. The two stay in sync in both
        directions: Image Bench shows the
        {{ isWebUI ? "controls of the WebUI page" : "nodes of the open workflow" }}, and a change made on either
        side appears on the other. You can therefore switch between them at any time. Every image that
        {{ HOST_NAME }} generates, even one started from {{ HOST_NAME }} itself, arrives in Image Bench together
        with its generation parameters.
      </p>
      <div class="note">
        <AppIcon name="info" :size="15"/>
        <div>
          Image Bench works through the {{ HOST_NAME }} page, so that page must stay open in a browser window and
          remain the active tab of that window. The window itself need not be visible: minimize it, move it to
          another display or let other windows cover it, and keep only Image Bench and Photoshop on screen.
        </div>
      </div>
      <p>The window is organised into the following tabs:</p>
      <ul>
        <li><b>Generate</b> and <b>ControlNet</b> — compact editors for the generation parameters and the
          ControlNet units.</li>
        <li><b>Explore</b> — runs one prompt on many checkpoints and LoRAs and shows the results side by side.</li>
        <li><b>Generated</b> — batches, variations and endless generation, with images streaming in as they
          finish.</li>
        <li><b>Concept tray</b> and <b>Image tray</b> — lasting collections of the images worth keeping.</li>
        <li v-if="isWebUI"><b>Upscaled</b> — upscaled (Hires. fix) versions of the images you choose.</li>
        <li><b>Settings</b> and <b>Manual</b> — the options of the window, and this manual.</li>
      </ul>
      <p>
        A Photoshop plugin comes with the extension. It sends images from Photoshop to {{ HOST_NAME }} and places
        any image from Image Bench back into Photoshop as a layer (see
        <a href="#" @click.prevent="scrollTo('photoshop')">Photoshop</a>).
      </p>
    </section>

    <section id="manual-window">
      <h2>The window</h2>
      <p>
        To open Image Bench, click the <b>🔬 Image Bench</b> button
        {{ isWebUI ? "in the header of the WebUI page" : "in the ComfyUI toolbar" }}. It opens in a window of its
        own, which stays connected to the {{ HOST_NAME }} page it was opened from.
      </p>
      <p>
        Keep that page open, and keep it as the active tab of its browser window. The browser window may be
        minimized or hidden behind others, but if you bring another tab to the front in it, the browser slows the
        page down and Image Bench starts to lag. If the page is closed or reloaded, the tab bar shows
        <span class="kbd warn">Disconnected from {{ HOST_NAME }}</span>; open Image Bench again from the page.
      </p>
      <div class="note">
        <AppIcon name="info" :size="15"/>
        <div>
          The layout is designed for a window of <b>1200×800</b> pixels placed next to Photoshop, so that the two
          share the screen while {{ HOST_NAME }} stays in the background. A larger window fits more images in a
          row; a smaller one still works, though some toolbars wrap onto two lines.
        </div>
      </div>
      <p>
        Generated images reach Image Bench over a WebSocket connection to the address the page was opened on.
        Open {{ HOST_NAME }} at its usual address and port: behind a proxy that does not pass WebSockets
        through, no images will arrive.
      </p>
    </section>

    <section id="manual-generate">
      <h2><AppIcon name="generate" :size="17"/>Generate</h2>
      <p>
        This tab holds the main controls of a single generation. While it is shown, it mirrors
        {{ HOST_NAME }} in both directions: whatever you change here is applied in {{ HOST_NAME }} at once,
        and whatever you change in {{ HOST_NAME }} shows up here.
      </p>
      <p>From top to bottom, the tab offers:</p>
      <ul>
        <li><b>Prompt and negative prompt.</b> As in WebUI, <span class="kbd">Ctrl</span>+<span class="kbd">↑</span> /
          <span class="kbd">↓</span> raises or lowers the attention of the selected text, or of the word at the
          cursor.</li>
        <li><b>Checkpoint.</b> The <AppIcon name="info" :size="13" class="inline-icon"/> button next to it opens
          the model's Civitai page.</li>
        <li><b>LoRA list.</b> Checking a LoRA adds its <code>&lt;lora:name:weight&gt;</code> tag, along with any
          activation text, to the prompt; unchecking it removes them. A LoRA stays checked for as long as its tag
          is in the prompt.
          <span v-if="isComfy">In ComfyUI this requires the <b>Image Bench Prompt</b> node (see
            <a href="#" @click.prevent="scrollTo('comfy-setup')">ComfyUI setup</a>).</span></li>
        <li><b>References</b> (beside the LoRA list) — the reference images of edit models such as Flux Kontext /
          Klein or Qwen Image Edit. Drop, paste or browse for images, or drag them in from the image lists. The
          <span class="kbd">Ps</span> <b>sends to</b> option decides whether an image arriving from Photoshop
          becomes the input image or a new reference.</li>
        <li><b>Sampling, Seed and Hires. fix</b> groups. A seed of −1 means a random seed; the reuse button takes
          the seed of the latest image.</li>
        <li v-if="isWebUI"><b>Mode switch</b> (at the right of the toolbar) — txt2img, img2img or Inpaint. It
          switches the WebUI tab and remembers the parameters of each mode separately. In img2img and Inpaint, the
          size becomes "Resize to", and the Hires. fix column holds the denoising strength and the resize and mask
          options instead.</li>
        <li v-else><b>Mode</b> — set by the workflow rather than by a switch: txt2img by default, img2img when a
          load node is marked <code>ib:img</code>, and inpaint when a mask loader is marked <code>ib:mask</code>
          as well.</li>
        <li><b>Result, Input and Mask</b> panes. Upload, drop or paste an input image or a mask onto its pane.</li>
        <li><b>Generate</b> — makes one image and shows it with a live preview. Ask for more than one image (or
          for <AppIcon name="infinity" :size="13" class="inline-icon"/>), and the batch runs in the Generated tab
          instead. <b>Skip</b> abandons the current image; <b>Stop</b> ends the batch.</li>
        <li v-if="isWebUI"><b>UI preset buttons</b> — switch the Forge UI preset (sd, xl, flux, ...); Settings
          decides which presets they offer. <b><AppIcon name="lock" :size="13" class="inline-icon"/> Prompt
          lock</b> covers the prompts in WebUI, so that they can only be edited here.</li>
      </ul>
      <p v-if="isComfy" class="muted">
        A control whose node cannot be found in the workflow is hidden, so a missing control usually points to a
        missing marker.
      </p>
    </section>

    <section id="manual-controlnet">
      <h2><AppIcon name="controlnet" :size="17"/>ControlNet</h2>
      <p>
        This tab edits one ControlNet unit at a time and, like the Generate tab, mirrors it in both directions.
        <template v-if="isWebUI">The units are those of Forge "ControlNet Integrated" in the WebUI tab currently
          shown; the toolbar switches between txt2img and img2img.</template>
        <template v-else>Unit N is the ControlNet apply node titled <code>ib:cn:N</code>.</template>
      </p>
      <p>Each unit has the following controls:</p>
      <ul>
        <li><b>Enable</b>, <b>model</b>, <b>weight</b>, and the <b>starting and ending steps</b>.</li>
        <li><b>Source</b> pane — the control image. Drop, paste or browse for it, or click
          <AppIcon name="controlnet" :size="13" class="inline-icon"/> <b>Send to ControlNet</b> on any image in
          the lists to send it to the unit selected here.</li>
        <li><b>Preprocessor</b> and <b>Run preprocessor</b> — the result appears in the <b>Preview</b> pane,
          from where <b>To Photoshop</b> passes it on. <b>Pixel Perfect</b> derives the preprocessor resolution
          from the image and the generation size.
          <span v-if="isComfy">Preprocessors require the comfyui_controlnet_aux node pack.</span></li>
        <li><b>Use Mask</b> — restricts the unit to the masked area.
          <span v-if="isComfy">This requires an Advanced-ControlNet apply node.</span></li>
        <li v-if="isWebUI"><b>Upload independent control image</b> — in img2img, this is checked for you as soon
          as you set an image, because WebUI would otherwise use the img2img image.</li>
      </ul>
    </section>

    <section id="manual-explore">
      <h2><AppIcon name="flask" :size="17"/>Explore</h2>
      <p>
        Explore runs the current prompt on every checked checkpoint, with every checked LoRA, and groups the
        results by model, so that models and LoRAs can be compared at a glance.
      </p>
      <p>To run an exploration:</p>
      <ol>
        <li>Check models in the <b>Checkpoints</b> list and, if you like, LoRAs in the <b>LoRAs</b> list. A folder
          can be checked as a whole.</li>
        <li>Set the number of images per model (<b>×</b>) and press <b>Explore</b>.</li>
        <li>When the run ends or is stopped, the checkpoint that was selected in {{ HOST_NAME }} is restored.</li>
      </ol>
      <p>The tab also offers:</p>
      <ul>
        <li><b>Per-model settings</b> (the <AppIcon name="sliders" :size="13" class="inline-icon"/> button of the
          focused model) — the sampler, schedule type, steps, CFG, distilled CFG or shift to use with that model,
          since different model families need different settings. LoRAs have their own settings: weight and extra
          text (activation words).</li>
        <li><b>Presets</b> — save the checked models or LoRAs under a name, such as "SDXL anime" or "Flux".</li>
        <li><b>LoRA-free images</b> — when LoRAs are checked, each model also gets an image without them for
          comparison. Settings can turn this off.<span v-if="isComfy"> In ComfyUI, exploring LoRAs requires a
            LoRA loader titled <code>ib:lora</code>.</span></li>
        <li><b>Save results</b> stores the whole comparison as a single HTML page; <b>Clear results</b> empties
          the tab.</li>
        <li>The <AppIcon name="info" :size="13" class="inline-icon"/> button opens the Civitai page of the focused
          model or LoRA.</li>
      </ul>
    </section>

    <section id="manual-generated">
      <h2><AppIcon name="images" :size="17"/>Generated</h2>
      <p>
        This tab collects every image {{ HOST_NAME }} generates while Image Bench is open, newest first, each
        with its parameters.
      </p>
      <p>Its toolbar, and what to do with the results:</p>
      <ul>
        <li><b>Generate × N</b> — runs a batch with the current parameters and a random seed for each image. The
          count button beside it sets the number chosen in Settings, and
          <AppIcon name="infinity" :size="13" class="inline-icon"/> keeps generating until you stop it.</li>
        <li v-if="isWebUI"><b>Variations…</b> — generates variations of the current seed. The variation seed and
          strength are set for the batch and cleared once it is done.</li>
        <li v-if="isWebUI"><b>Apply preset</b> — applies a preset of the Config Presets extension before the
          batch (shown only when that extension is installed).</li>
        <li>Move the images worth keeping to a tray with
          <AppIcon name="concept" :size="13" class="inline-icon"/> or
          <AppIcon name="palette" :size="13" class="inline-icon"/>. The tab is emptied whenever a new batch
          starts, unless "Automatically clear generated images" is turned off in Settings.</li>
      </ul>
    </section>

    <section id="manual-trays">
      <h2><AppIcon name="palette" :size="17"/>Concept tray and image tray</h2>
      <p>
        The two trays are lasting collections, stored on the {{ HOST_NAME }} server, so they survive restarts.
        One way to use them: let the <b>concept tray</b> gather promising ideas — compositions, prompts, seeds
        to return to — and the <b>image tray</b> the images you mean to finish by upscaling, refining or editing
        them in Photoshop. The same buttons move images from one tray to the other.
      </p>
      <p>Both trays offer:</p>
      <ul>
        <li><b>Markings</b> (👍 👎 🔴 🟠 🟡 🟢 🔵 🟣) — hover over an image and click one. Middle-click a marking
          to show only the images that carry it; the <AppIcon name="filter" :size="13" class="inline-icon"/>
          button shows only marked images.</li>
        <li><b>Comments</b> <AppIcon name="comment" :size="13" class="inline-icon"/> on images.</li>
        <li><b>Generate with steps</b> <AppIcon name="steps" :size="13" class="inline-icon"/> — asks for a list of
          step counts and generates the image again with each of them, in the Generated tab.</li>
        <li v-if="isWebUI"><b>Upscale with denoising</b> <AppIcon name="denoise" :size="13" class="inline-icon"/>
          — asks for a list of denoising strengths and upscales the image with each of them. <b>Upscale
          selected</b> upscales every checked image.</li>
        <li><b>Download</b> <AppIcon name="download" :size="13" class="inline-icon"/> saves the tray as a .zip
          file; <b>Import</b> <AppIcon name="upload" :size="13" class="inline-icon"/> adds .png files (parameters
          included) or a saved tray.</li>
      </ul>
    </section>

    <section v-if="isWebUI" id="manual-upscaled">
      <h2><AppIcon name="upscale" :size="17"/>Upscaled</h2>
      <p>
        Here appear the results of the <AppIcon name="upscale" :size="13" class="inline-icon"/> upscale button:
        the image is generated again from its parameters, this time with Hires. fix, using the Hires. fix
        settings currently set in WebUI.
      </p>
    </section>

    <section id="manual-images">
      <h2>Working with images</h2>
      <p>Hovering over an image reveals its buttons:</p>
      <table>
        <tr><td><AppIcon name="seed" :size="14"/></td><td>Left click reuses the seed; middle click reuses all the
          parameters (prompt, sampler, size, ...) in {{ HOST_NAME }}.</td></tr>
        <tr><td><AppIcon name="params" :size="14"/></td><td>Shows the generation parameters.</td></tr>
        <tr><td><AppIcon name="controlnet" :size="14"/></td><td>Sends the image to the control image of the
          ControlNet tab.</td></tr>
        <tr><td><AppIcon name="external" :size="14"/></td><td>Sends the image to Photoshop as a layer of the active
          document; middle click opens it as a new document.</td></tr>
        <tr><td><AppIcon name="concept" :size="14"/> <AppIcon name="palette" :size="14"/></td><td>Places the image
          in the concept tray or the image tray.</td></tr>
      </table>
      <p>
        Click an image to view it large. In that view, <span class="kbd">←</span> and
        <span class="kbd">→</span> page through the images, <span class="kbd">Ctrl</span>+click switches between
        full size and fit to screen, and <span class="kbd">Esc</span> closes it. Middle-click an image to open it
        in a new browser tab.
      </p>
      <p>
        Images can be dragged into the input, reference and ControlNet panes. An image marked with
        <AppIcon name="alert" :size="13" class="inline-icon"/> was made with a prompt that differs from the
        current one.
      </p>
    </section>

    <section id="manual-settings">
      <h2><AppIcon name="settings" :size="17"/>Settings and actions</h2>
      <p>
        <b>Settings</b> covers the accent color, the clearing of generated images,
        <template v-if="isWebUI">the UI preset buttons and count button of the Generate tab, </template>
        LoRA-free images in exploration and the Civitai domain<template v-if="isWebUI">, along with options for
          the WebUI page itself: the Civitai info button, the Config Presets dropdown, and keeping prompts across
          WebUI reloads</template>.
      </p>
      <p>
        The <AppIcon name="more" :size="13" class="inline-icon"/> button at the right end of the tab bar opens the
        maintenance actions: deleting the generated images, clearing all images and trays from the window, and
        deleting every file in the Image Bench output folder.
      </p>
    </section>

    <section id="manual-photoshop">
      <h2>Photoshop</h2>
      <p>
        The <b>Image Bench</b> plugin for Photoshop (2024 / version 25.0 or newer) comes with this extension and
        links Photoshop to {{ HOST_NAME }}. Sending images from Photoshop works even while the Image Bench window
        is closed.
      </p>

      <div class="plugin-card">
        <div class="plugin-card-header">
          <span class="ps-badge">Ps</span>
          <div>
            <div class="plugin-title">Image Bench plugin</div>
            <div class="plugin-status">{{ pluginState || "Checking the plugin…" }}</div>
          </div>
        </div>
        <div class="plugin-actions">
          <button class="btn primary" :disabled="installing || !plugin?.available || !plugin?.supported"
                  :title="plugin && !plugin.supported ? `Not supported on ${plugin.platform}` : 'Copy the plugin to the Photoshop plugin folder'"
                  @click="onInstallPlugin"><AppIcon name="download" :size="14"/>{{ installing ? "Installing…" : "Install" }}</button>
          <a class="btn outline" :class="{disabled: !plugin?.available}" :href="`${PLUGIN_URL}.ccx`" download
            ><AppIcon name="save" :size="14"/>Download .ccx</a>
        </div>
        <ul class="plugin-notes">
          <li><b>Install</b> copies the plugin into the folder where the Creative Cloud app keeps plugins
            (<code>Common Files\Adobe\UXP\Plugins\External</code> on Windows) and registers it with Photoshop.
            Windows will ask for administrator rights. The plugin is installed on the computer that runs
            {{ HOST_NAME }}.</li>
          <li><b>Download .ccx</b> is for any other computer: double-click the file there to install it with the
            Creative Cloud app.</li>
          <li>Either way, restart Photoshop afterwards.</li>
          <li>The plugin is not signed by Adobe. If it is missing from the <b>Plugins</b> menu after the restart,
            turn on <b>Preferences › Plugins › Enable Developer Mode</b> in Photoshop and restart it once more
            (or run <code>just ps-enable</code> from an elevated shell in the repository).</li>
        </ul>
      </div>

      <h3>Connecting</h3>
      <ol>
        <li>In Photoshop, open <b>Plugins › Image Bench › Image Bench</b> and dock the panel.</li>
        <li>Enter the address of {{ HOST_NAME }} in the panel. The default is
          <code>{{ isComfy ? "http://127.0.0.1:8188" : "http://127.0.0.1:7860" }}</code>; this page is served from
          <code>{{ hostOrigin }}</code>. The plugin talks to one host at a time.</li>
        <li>The panel shows whether it is connected. Once connected, the plugin stays connected for as long as
          Photoshop runs.</li>
      </ol>

      <h3>Photoshop → {{ HOST_NAME }}</h3>
      <p>The plugin panel offers these commands:</p>
      <ul>
        <li><b>Send image</b> — the composite image of the document becomes the input image:
          <template v-if="isWebUI">it goes into the img2img canvas when img2img is shown, and into img2img ›
            Inpaint upload otherwise,</template>
          <template v-else>it goes into the load node marked <code>ib:img</code>,</template>
          unless the Generate tab's <span class="kbd">Ps</span> sends to option makes it a new reference.</li>
        <li><b>Send selection as mask</b> — the selection, as a black-and-white mask, goes to
          {{ isWebUI ? "the inpaint upload mask" : "the node marked ib:mask" }}. Feathered selections give soft
          edges.</li>
        <li><b>Send image and mask</b> — both at once; the usual way to inpaint part of a document.</li>
        <li><b>ControlNet: preprocess</b> — loads the image into the unit shown in the ControlNet tab, runs its
          preprocessor, and places the result back in Photoshop as a layer. <b>ControlNet: image</b> uses the image
          as the control image as it is, without a preprocessor, and <b>ControlNet: mask</b> sends the selection as
          the unit's mask.</li>
      </ul>
      <p class="muted">
        The same commands appear in the <b>Plugins › Image Bench</b> menu, so you can assign keyboard shortcuts to
        them under <b>Edit › Keyboard Shortcuts › Plugins</b>.
      </p>

      <h3>{{ HOST_NAME }} → Photoshop</h3>
      <p>
        The <AppIcon name="external" :size="13" class="inline-icon"/> <b>Send to Photoshop</b> button of any image,
        like <b>To Photoshop</b> in the ControlNet preview, places the image as a new layer of the active document.
        Middle-click it to open the image as a new document instead.
      </p>
    </section>

    <section v-if="isComfy" id="manual-comfy-setup">
      <h2>ComfyUI setup</h2>
      <p>
        A workflow may contain several loaders, samplers and text encoders, so Image Bench needs to be told which
        nodes to work with. You tell it by adding a <b>marker</b> to the title of each of those nodes
        (double-click the title, or right-click › Title). The marker can go anywhere in the title, as in
        <code>Main model ib:cp</code>.
      </p>
      <table class="markers">
        <tr><th>Marker</th><th>Node</th><th>Needed for</th></tr>
        <tr><td><code>ib:cp</code></td><td>Checkpoint / UNET loader</td><td>Checkpoint list, model exploration</td></tr>
        <tr><td><code>ib:pp</code></td><td>Positive prompt (Image Bench Prompt, CLIPTextEncode, ...)</td><td>Prompt, LoRA list</td></tr>
        <tr><td><code>ib:np</code></td><td>Negative prompt</td><td>Negative prompt</td></tr>
        <tr><td><code>ib:smp</code></td><td>KSampler or SamplerCustomAdvanced</td><td>Seed, steps, CFG, sampler, size, ...</td></tr>
        <tr><td><code>ib:smp:1</code></td><td>Second-pass sampler</td><td>Hires. fix group</td></tr>
        <tr><td><code>ib:lora</code></td><td>LoraLoader</td><td>LoRA exploration</td></tr>
        <tr><td><code>ib:img</code> / <code>ib:mask</code></td><td>LoadImage / LoadImageMask</td><td>img2img, inpaint, images from Photoshop</td></tr>
        <tr><td><code>ib:ref:0</code>, <code>ib:ref:1</code>, ...</td><td>LoadImage of edit-model references</td><td>References panel</td></tr>
        <tr><td><code>ib:cn:0</code>, <code>ib:cn:1</code>, ...</td><td>ControlNet apply node</td><td>ControlNet tab</td></tr>
      </table>
      <p>A few more things to know:</p>
      <ul>
        <li>The <b>Image Bench Prompt</b> node (category Image Bench) applies the
          <code>&lt;lora:name:weight&gt;</code> tags in its text to the model and CLIP, and passes on the text
          without them. Place it between the checkpoint loader and the text encoder and title it
          <code>ib:pp</code>, and the LoRA list works just as it does in WebUI.</li>
        <li><b>Example workflows</b>, with every node already marked, are listed under Image Bench in the ComfyUI
          template browser.</li>
        <li>Two node packs are optional: <b>comfyui_controlnet_aux</b> for ControlNet preprocessors, and
          <b>ComfyUI-Advanced-ControlNet</b> for ControlNet masks.</li>
        <li>A marker can also go on a subgraph node; promote the widgets that Image Bench should change.</li>
        <li>Custom loader or sampler nodes can be supported by adding them to <code>node_config.json</code> in the
          extension folder and reloading the page. The extension's README describes the format.</li>
        <li>The workflow needs an output node (Save Image or Preview Image), or no images will reach Image
          Bench.</li>
      </ul>
    </section>

    <section id="manual-shortcuts">
      <h2>Keyboard and mouse</h2>
      <p>The window responds to these shortcuts:</p>
      <table>
        <tr><td><span class="kbd">Ctrl</span>+<span class="kbd">↑</span> / <span class="kbd">↓</span></td><td>Raise or lower the attention in a prompt</td></tr>
        <tr><td><span class="kbd">←</span> <span class="kbd">→</span></td><td>Previous or next image in the image view</td></tr>
        <tr><td><span class="kbd">Esc</span></td><td>Close the image view, or the topmost dialog</td></tr>
        <tr><td><span class="kbd">Ctrl</span>+<span class="kbd">U</span></td><td>Unselect all images</td></tr>
        <tr><td><span class="kbd">Ctrl</span>+click</td><td>Switch between full size and fit to screen in the image view</td></tr>
        <tr><td>Middle click</td><td>On an image, open it in a new tab. On a button, perform the alternative action
          named in its tooltip (reuse all parameters, open as a new Photoshop document, filter by marking, ...)</td></tr>
      </table>
    </section>

    <section id="manual-troubleshooting">
      <h2>Troubleshooting</h2>
      <p>Common problems and how to fix them:</p>
      <dl>
        <dt>"Disconnected from {{ HOST_NAME }}"</dt>
        <dd>The page that opened the window was closed or reloaded. Open Image Bench again from that page.</dd>
        <dt>Images do not appear</dt>
        <dd>Check the address and port {{ HOST_NAME }} is opened on (see <a href="#"
          @click.prevent="scrollTo('window')">The window</a>)<template v-if="isComfy">, and make sure the
          workflow has an output node</template>.</dd>
        <dt>A control is missing from the Generate tab</dt>
        <dd v-if="isComfy">Its node is not marked, or cannot be found; see <a href="#"
          @click.prevent="scrollTo('comfy-setup')">ComfyUI setup</a>.</dd>
        <dd v-else>Some controls exist only for certain models or Forge versions (Distilled CFG, Shift,
          references, ...). Try another UI preset.</dd>
        <dt>The Photoshop plugin is not in the Plugins menu</dt>
        <dd>Restart Photoshop after installing. If the plugin is still missing, enable Developer Mode under
          Preferences › Plugins and restart Photoshop again (see
          <a href="#" @click.prevent="scrollTo('photoshop')">Photoshop</a>).</dd>
        <dt>The Photoshop panel shows "disconnected"</dt>
        <dd>Check the address in the panel, and that {{ HOST_NAME }} is running. The plugin reconnects on its
          own.</dd>
        <dt>Model exploration was aborted</dt>
        <dd>Parameters were changed in {{ HOST_NAME }} during the run<template v-if="isWebUI"> (by "Send to
          txt2img", for example)</template>. Start the exploration again.</dd>
      </dl>
    </section>
  </article>
</div>
</template>

<style scoped>
.manual {
  display: flex;
  height: 100%;
  min-height: 0;
}

.manual-toc {
  width: 190px;
  flex-shrink: 0;
  padding: 14px 8px;
  border-right: 1px solid var(--ib-border);
  background: var(--ib-surface);
  overflow-y: auto;
}

.manual-toc h2 {
  margin: 0 8px 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ib-muted);
}

.toc-item {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-left: 2px solid transparent;
  background: none;
  color: var(--ib-text-2);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.toc-item:hover {
  color: var(--ib-text);
  background: var(--ib-hover);
}

.toc-item.on {
  color: var(--ib-text);
  border-left-color: var(--ib-accent);
}

.manual-content {
  flex-grow: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 18px 28px 60px;
  line-height: 1.55;
}

.manual-content section {
  max-width: 820px;
  padding-bottom: 22px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--ib-border);
}

.manual-content section:last-child {
  border-bottom: none;
}

h1 {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 600;
}

h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;
}

h3 {
  margin: 16px 0 6px;
  font-size: 14px;
  font-weight: 600;
}

p, ul, ol, dl, table {
  margin: 0 0 10px;
}

ul, ol {
  padding-left: 22px;
}

li {
  margin-bottom: 4px;
}

.lead {
  color: var(--ib-text);
}

.muted {
  color: var(--ib-text-2);
}

a {
  color: var(--ib-accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

code {
  font-family: var(--ib-mono);
  font-size: 12px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--ib-elev);
  color: var(--ib-accent);
}

.kbd {
  display: inline-block;
  padding: 0 5px;
  border: 1px solid var(--ib-border-2);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--ib-elev);
  font-size: 11.5px;
  line-height: 1.5;
}

.kbd.warn {
  color: var(--ib-warn);
}

.inline-icon {
  display: inline-block;
  vertical-align: -2px;
}

table {
  border-collapse: collapse;
}

td, th {
  padding: 5px 12px 5px 0;
  vertical-align: top;
  text-align: left;
  border-bottom: 1px solid var(--ib-border);
}

th {
  color: var(--ib-text-2);
  font-weight: 600;
}

td:first-child {
  white-space: nowrap;
}

td :deep(.app-icon) {
  display: inline-block;
}

dt {
  font-weight: 600;
  margin-top: 8px;
}

dd {
  margin: 2px 0 0 16px;
  color: var(--ib-text-2);
}

.note {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  margin: 0 0 10px;
  border: 1px solid var(--ib-accent-border);
  border-radius: 6px;
  background: var(--ib-accent-soft);
}

.note .app-icon {
  margin-top: 3px;
  color: var(--ib-accent);
}

.plugin-card {
  padding: 14px 16px 6px;
  margin: 12px 0 6px;
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  background: var(--ib-surface);
}

.plugin-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ps-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 2px solid #31a8ff;
  border-radius: 6px;
  background: #001e36;
  color: #31a8ff;
  font-weight: 700;
}

.plugin-title {
  font-weight: 600;
}

.plugin-status {
  color: var(--ib-text-2);
}

.plugin-actions {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.plugin-actions a.btn {
  text-decoration: none;
}

.plugin-actions a.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.plugin-notes {
  color: var(--ib-text-2);
  font-size: 12.5px;
}
</style>
