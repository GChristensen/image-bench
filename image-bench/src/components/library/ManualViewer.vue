<script setup>
/**
 * Right pane of the Library manual: the text, scrolled to the chapter chosen in the contents (ManualBrowser.vue)
 */
import {nextTick, onActivated, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import PluginCard from "@/components/library/PluginCard.vue";
import {HOST_NAME, isComfy, isWebUI} from "@/host.js";
import {MANUAL_SECTIONS, useManualStore} from "@/stores/manual.js";

// Chapters and their subchapters in the order of the text
const CHAPTERS = MANUAL_SECTIONS.flatMap(section => [section, ...section.children ?? []]);

const manual = useManualStore();
const content = ref(null);

function scrollTo(id) {
  content.value?.querySelector(`#manual-${id}`)?.scrollIntoView({behavior: "smooth", block: "start"});
}

// While the Library tab is moved out by KeepAlive, the request waits for restoreScroll()
watch(() => manual.target, target => {
  if (target && content.value?.isConnected) {
    scrollTo(target.id);
    manual.target = null;
  }
});

// Marks the last chapter whose heading has scrolled to the top of the text
function onScroll() {
  // Detached, the text loses its scroll position; it is restored when shown again
  if (!content.value.isConnected || !content.value.clientHeight)
    return;

  const top = content.value.getBoundingClientRect().top + 40;
  let current = CHAPTERS[0].id;

  for (const chapter of CHAPTERS) {
    const element = content.value.querySelector(`#manual-${chapter.id}`);

    if (element && element.getBoundingClientRect().top <= top)
      current = chapter.id;
  }

  manual.active = current;
  manual.scrollTop = content.value.scrollTop;
}

// Continues where it was left, or at the chapter requested meanwhile
async function restoreScroll() {
  await nextTick();

  if (!content.value)
    return;

  if (manual.target)
    content.value.querySelector(`#manual-${manual.target.id}`)?.scrollIntoView({block: "start"});
  else
    content.value.scrollTop = manual.scrollTop;

  manual.target = null;
  manual.scrollTop = content.value.scrollTop;
}

// The pane is created again when the manual section is shown, and moved out with the Library tab by KeepAlive
onMounted(() => {
  manual.opened = true;
  restoreScroll();
});

onActivated(restoreScroll);

// The plugins connect to the host at this address
const hostOrigin = location.origin;
</script>

<template>
<div class="manual">
  <article class="manual-content" ref="content" @scroll.passive="onScroll">

    <section id="manual-overview">
      <h1>Image Bench for {{ HOST_NAME }}</h1>
      <p class="lead">
        Image Bench automates the small repetitive tasks of working with
        {{ isWebUI ? "SD WebUI (Forge / Forge Neo)" : "ComfyUI" }}: generating batches, comparing models,
        collecting the best images, moving images to and from a graphics editor, and so on. All of it is done from
        one window, so you do not have to look for controls in the {{ HOST_NAME }} page.
      </p>
      <p>
        For example, to upscale an image you usually find it in the filesystem, extract its id and prompt, enable
        Hires. fix, upscale, disable Hires. fix again and randomize the seed. In Image Bench you press one button
        on an image saved in a tray, and Image Bench does the rest.
      </p>
      <p>
        Image Bench does not generate anything itself; it drives {{ HOST_NAME }}. The two stay in sync in both
        directions: Image Bench shows the
        {{ isWebUI ? "controls of the WebUI page" : "nodes of the open workflow" }}, and a change made on either
        side appears on the other. You can switch between them at any time. Every image that
        {{ HOST_NAME }} generates arrives in Image Bench together
        with its generation parameters.
      </p>
      <p>
        It may be hard to read this manual at once. Read only the parts of interest at first, and refer to it while
        exploring the application tabs.
      </p>
      <p>The window has the following tabs:</p>
      <ul>
        <li><b>Generate</b> and <b>ControlNet</b>: compact editors for the generation parameters and the
          ControlNet units.</li>
        <li><b>Explore</b> runs one prompt on many checkpoints and LoRAs and shows the results side by side.</li>
        <li><b>Generated</b> holds batches, variations and endless generation. Images appear as they
          finish.</li>
        <li><b>Compare</b> shows chosen images side by side, and the same region of each of them, so you can pick
          the best of several variants.</li>
        <li><b>Concept tray</b> and <b>Image tray</b> are permanent collections of the images worth keeping.</li>
        <li><b>Upscaled</b> holds upscaled (Hires. fix) versions of the images you choose.</li>
        <li><b>Library</b> holds docs (your Markdown notes), snippets (prompt text inserted from the Generate tab)
          and this manual.</li>
        <li><AppIcon name="box" :size="13" class="inline-icon"/> <b>Project</b> (the chip at the right of the tab
          bar) shows the current project and, when clicked, all projects. A project keeps the trays and the
          generation parameters of a piece of work.</li>
        <li><AppIcon name="settings" :size="13" class="inline-icon"/> <b>Settings</b> (at the right end of the tab
          bar) holds the application options.</li>
      </ul>
      <p>
        Plugins for Photoshop, Krita and GIMP come with the extension. They send images from the editor to {{ HOST_NAME }}
        and open any image from Image Bench in the editor as a new document or a layer (see
        <a href="#" @click.prevent="scrollTo('editors')">Editors</a>).
      </p>
    </section>

    <section id="manual-window">
      <h2>Launching Image Bench</h2>
      <p>
        The URL <a :href="`${hostOrigin}/image-bench/app`" target="_blank">{{ hostOrigin }}/image-bench/app</a> (bookmark
        it) opens Image Bench in a browser tab, which also loads {{ HOST_NAME }} in the background. Clicking the
        <AppIcon name="appWindow" :size="13" class="inline-icon"/> icon shows the {{ HOST_NAME }}
        page. If the
        page is reloaded in that tab, or {{ HOST_NAME }} restarts, Image Bench shows <span class="kbd warn"><AppIcon name="alert" :size="12" class="inline-icon"/>
        Connecting to {{ HOST_NAME }}</span> until the page is back, and then continues.
      </p>
      <p>
        The <b>🔬 Image Bench</b> button {{ isWebUI ? "in the header of the WebUI page" : "in the ComfyUI toolbar" }}
        shows this link in a dialog. Clicking the link loads Image Bench in place of the
        {{ HOST_NAME }} page in that tab.
      </p>

      <p>
        With the setting <b>Open Image Bench from the {{ HOST_NAME }} interface</b>, the button opens Image Bench from
        the {{ HOST_NAME }} page instead. Image Bench then opens in a browser tab that stays connected to the
        {{ HOST_NAME }} page it was opened from. Drag that tab into a window of its own, so that the {{ HOST_NAME }}
        page remains the active tab of its window (see below).
      </p>

      <div class="note">
        <AppIcon name="info" :size="15"/>
        <div>
          <p>
            When Image Bench is opened from the {{ HOST_NAME }} page, it drives that same page, so {{ HOST_NAME }}
            must stay open in a browser window as the active tab of that window. The window does not need to be
            visible: you can minimize it, move it to another display or cover it with other windows.
          </p>
        </div>
      </div>
    </section>

    <section id="manual-workflow">
      <h2>Typical workflow</h2>
      <p>
        Most work with Image Bench follows a few patterns: drafting small images and upscaling the good ones,
        guiding new generations with ControlNet, editing and inpainting images together with a graphics editor, and
        keeping the results in trays and projects.
      </p>
      <p>
        Small images generate faster, so drafts are usually made at about 1 megapixel (1024×1024) or 0.5 megapixel,
        and the good ones are upscaled 2× or 4×. The more pixels an image has, the more detail it can hold. Some
        models can generate at 2 megapixels directly. The
        <a href="#" @click.prevent="scrollTo('upscaled')">Upscaled</a> tab keeps its images until you remove them,
        so you can use it as the store of your upscaled images.
      </p>
      <p>
        To guide a generation with ControlNet, send an image to the
        <a href="#" @click.prevent="scrollTo('controlnet')">ControlNet</a> tab and run the preprocessor. Send the
        processed image to the graphics editor, correct it there, and send it back as the control image to generate
        new images from it.
      </p>
      <p>
        Edit models change an image by an instruction in the prompt, or by reference images, without a mask.
        Activate img2img mode at the Generate tab. Send
        the image from a tray or from the editor to <template v-if="isWebUI">img2img</template><template v-else>the load node
        marked <code>ib:img</code></template> and describe the
        change in the prompt.
      </p>
      <p>
        For inpainting, activate the inpaint mode at the Generate tab, select the area to change in the editor and send the image with the selection as the mask
        to <template v-if="isWebUI">img2img › Inpaint upload</template><template v-else>the nodes marked
        <code>ib:img</code> and <code>ib:mask</code></template>.
        Add the inpainted variants to the <a href="#" @click.prevent="scrollTo('compare')">Compare</a> tab as they arrive, pick the
        best one there, and put it into the image tray or the concept tray.
      </p>
      <p>
        The two <a href="#" @click.prevent="scrollTo('trays')">trays</a> can also be split by how long their images
        stay: one tray holds the images you keep, and the other holds experiments and is emptied regularly.
      </p>
      <p>
        A <a href="#" @click.prevent="scrollTo('projects')">project</a> is meant for one or a few images. For a long
        series, make a project per image and group the projects in folders.
      </p>
    </section>

    <section id="manual-images">
      <h2>Working with images</h2>
      <p>
        Holding <span class="kbd">Ctrl</span> over an image shows its action rim. So does the
        <AppIcon name="rim" :size="13" class="inline-icon"/> button at the top right of the image,
        until it is clicked again or the pointer leaves the image card. The rim is a
        ring of colored sectors, one per a kind of action. The middle of the
        ring shows the name and keyboard key of the sector under the pointer. Sectors with an alternative action perform it on a
        middle click or Shift+click; holding Shift shows their alternative icons. Clicking the image inside or
        outside the ring opens the image as usual.
      </p>
      <p>
        With <b>Show the action rim of an image on hover (without holding Ctrl)</b> turned on in the Settings tab,
        hovering alone opens the ring. In this mode, holding <span class="kbd">Ctrl</span> hides the
        ring and all other controls, so a click anywhere on the image opens it.
      </p>
      <p>
        The button in the middle shows the marking of the image; click it to switch
        the ring to the markings and back. The marking is also shown at the bottom-right corner of the image. Click
        it there to show only the images with that marking, or middle-click it to remove the marking. While the
        pointer is over an image, the hotkeys act on that image:
        <span class="kbd">1</span>–<span class="kbd">9</span> set its marking (<span class="kbd">0</span> removes it) and
        <span class="kbd">V</span> views it large.
      </p>

      <h3>The menu actions</h3>
      <table>
        <tr><td><AppIcon name="params" :size="14"/></td><td><span class="kbd">I</span> Shows the generation
          parameters, with buttons for the Civitai information of the image's checkpoint and LoRAs, and the
          ControlNet units the image was made with: the settings of each enabled unit with its control image,
          mask and preprocessor preview as they were when the generation started. The <AppIcon name="seed" :size="13" class="inline-icon"/>
          button next to the title reuses the image's seed, and <AppIcon name="sliders" :size="13"
                                                                         class="inline-icon"/> all its parameters (prompt, sampler, size, ...), in {{ HOST_NAME }}.</td></tr>
        <tr><td><AppIcon name="comment" :size="14"/></td><td><span class="kbd">C</span> Adds a comment to the image.</td></tr>
        <tr><td><AppIcon name="steps" :size="14"/></td><td><span class="kbd">G</span> Generates the image with a
          list of step counts.</td></tr>
        <tr><td><AppIcon name="upscale" :size="14"/></td><td><span class="kbd">U</span> Upscales the
          image.</td></tr>
        <tr><td><AppIcon name="denoise" :size="14"/></td><td><span class="kbd">D</span> Upscales the
          image with a list of denoising strengths.</td></tr>
        <tr v-if="isWebUI"><td><AppIcon name="imageIn" :size="14"/></td><td><span class="kbd">M</span> Sends
          the image to the img2img input image (img2img › img2img, which is shown).</td></tr>
        <tr><td><AppIcon name="brush" :size="14"/></td><td><span class="kbd">B</span> <template v-if="isWebUI">Sends
          the image to the inpaint upload image (img2img › Inpaint upload, which is shown).</template><template
            v-else>Sends the image to the load node marked <code>ib:img</code>.</template></td></tr>
        <tr><td><AppIcon name="controlnet" :size="14"/></td><td><span class="kbd">N</span> Sends the image to the
          control image of the ControlNet tab.</td></tr>
        <tr><td><AppIcon name="photoshop" :size="14"/></td><td><span class="kbd">P</span> Sends the image to
          the editor (Photoshop, Krita or GIMP) as a new document. Middle-click or
          <span class="kbd">Shift</span>+<span class="kbd">P</span> places it as a layer of the active document.</td></tr>
        <tr><td><AppIcon name="compare" :size="14"/></td><td><span class="kbd">A</span> Adds the image to the
          Compare tab.</td></tr>
        <tr><td><AppIcon name="concept" :size="14"/> <AppIcon name="palette" :size="14"/></td><td>
          <span class="kbd">Y</span> / <span class="kbd">T</span> Places the image in the concept tray or the
          image tray.</td></tr>
      </table>
      <p>
        Right-click an image for a menu with all of its actions. <span class="kbd">Shift</span>+right-click shows the browser's own menu.
      </p>
      <p>
        Click an image to view it large. In that view, <span class="kbd">←</span> and
        <span class="kbd">→</span> page through the images, a left click switches between
        full size and fit to screen, the <AppIcon name="params" :size="13" class="inline-icon"/> <b>Show
        generation parameters</b> button at the top left shows the parameters over the image
        (a second click hides them; they stay shown while paging), and <span class="kbd">Esc</span> closes the view.
        Middle-click an image to open it in a new browser tab.
      </p>
      <p>
        Images can be dragged into the input, reference and ControlNet panes.
      </p>

      <h3 id="manual-images-media">Video and audio</h3>
      <p>
        Videos and audio files generated by {{ HOST_NAME }} arrive among the images<template v-if="isComfy"> (the
        outputs of Save Video, Save WEBM, VideoHelperSuite's Video Combine and the Save Audio nodes)</template><template
          v-else> (the videos of Forge Neo)</template>. A video card shows a frame of the video, and an audio card
        shows a placeholder. Only the <AppIcon name="play" :size="13" class="inline-icon"/> button in the middle of the card
        plays the file, inside the card; starting another one stops it. A click anywhere else opens the large view,
        which plays the file immediately with sound (<span class="kbd">Space</span> pauses). Videos and audio go into the trays and
        projects like images, but not into Compare, the editor, the input images or the upscaling actions.
      </p>
      <p>
        The server takes the frame with PyAV (part of ComfyUI) or the <code>ffmpeg</code> program on the
        path. Without either, the card shows the start of the video itself. In the Projects tab, only the final
        file plays in its card; the videos and audio of the trays and the folder show their frames and placeholders
        and play in the large view.
      </p>
    </section>


    <section id="manual-generate">
      <h2><AppIcon name="generate" :size="17"/>Generate</h2>
      <p>
        This tab has the main controls of a single generation. While the tab is shown, it mirrors {{ HOST_NAME }} in
        both directions: a change made on either side appears on the other immediately.
      </p>
      <ul>
        <li><b>Prompts.</b> <span class="kbd">Ctrl</span>+<span class="kbd">↑</span> / <span class="kbd">↓</span>
          in a text box raises or lowers the attention of the selection or of the word at the cursor.</li>
        <li><b>Snippets</b> <AppIcon name="snippet" :size="13" class="inline-icon"/> opens a floating panel with the
          snippets of the <a href="#" @click.prevent="scrollTo('library')">Library</a>. Clicking a snippet inserts it
          into the prompt you last clicked in, and inserts its negative part (marked
          <span class="snippet-badge negative">−</span> when there is one) into the negative prompt. Middle-click
          inserts only the part for that prompt; Shift+click wraps the selection. <b>From selection</b> saves the
          selected text as a new snippet.</li>
        <li><b>Checkpoint</b>: <AppIcon name="info" :size="13" class="inline-icon"/> opens the model's Civitai
          page.<template v-if="isWebUI"> The <AppIcon name="box" :size="13" class="inline-icon"/>/<AppIcon
          name="puzzle" :size="13" class="inline-icon"/> button before it switches to the Forge Neo VAE / Text
          Encoder list, which is kept per <b>UI preset</b> (the setting in the WebUI).</template></li>
        <li><b>LoRA list</b>: checking a LoRA adds its <code>&lt;lora:name:weight&gt;</code> tag (and activation
          text) to the prompt, and the LoRA stays checked while the tag is there.
          <AppIcon name="refresh" :size="13" class="inline-icon"/> rescans the checkpoints and LoRAs.
          <span v-if="isComfy">This requires the <b>Image Bench Prompt</b> node (see
            <a href="#" @click.prevent="scrollTo('comfy-setup')">ComfyUI setup</a>).</span></li>
        <li><b>References</b> (beside the LoRA list) holds the reference images of edit models (Flux Kontext / Klein,
          Qwen Image Edit, ...).<template v-if="isWebUI"> <b>Edit</b> turns reference editing on for the current
          model family.</template> The option named <span class="kbd">Ps</span> <b>sends to</b> decides whether an image
          from the editor becomes the input image or a new reference.</li>
        <li><b>Sampling, Seed and Hires. fix.</b> <AppIcon name="dice" :size="13" class="inline-icon"/> sets a
          random seed (−1), and <AppIcon name="recycle" :size="13" class="inline-icon"/> takes the seed of the Result
          image.</li>
        <li v-if="isWebUI"><b>Mode switch</b> (right of the toolbar): txt2img, img2img or Inpaint. The parameters
          are remembered per mode. In img2img and Inpaint, the Hires. fix column holds the denoising, resize and
          mask options.</li>
        <li v-else><b>Mode</b> is set by the workflow: img2img with a node marked <code>ib:img</code>, inpaint with
          <code>ib:mask</code> as well, otherwise txt2img.</li>
        <li><b>Size</b>: preset sizes or width and height inputs. The
          <AppIcon name="list" :size="13" class="inline-icon"/> / <AppIcon name="ruler" :size="13" class="inline-icon"/>
          button before it switches between them. The presets have the same aspect ratios in four grades, from
          0.25 to 2 MP, followed by sizes for particular models. The rectangle before a size shows its shape, and
          <b>≈</b> joins two neighbouring sizes of nearly the same ratio. The icons at the right show the medium a ratio comes from:
          <AppIcon name="easel" :size="13" class="inline-icon"/> 4:3, the painting canvas;
          <AppIcon name="photoCamera" :size="13" class="inline-icon"/> 3:2, 35 mm photography;
          <AppIcon name="tv" :size="13" class="inline-icon"/> 16:9, television and video;
          <AppIcon name="cinemaCamera" :size="13" class="inline-icon"/> 12:5, anamorphic cinema.
          <AppIcon name="bucketOff" :size="13" class="inline-icon"/> marks A4, which is no training bucket of any
          model.</li>
        <li><b>Result, Input and Mask</b>: upload, drop or paste the input image or mask onto its pane. Hold
          <span class="kbd">Ctrl</span> over the result, or click its <AppIcon name="rim" :size="13" class="inline-icon"/>
          button, to show its action rim. Drag the grips to resize the panes; double-click restores them.</li>
        <li><b>Session filmstrip</b> (the tabs at the right edge of the parameters): the images generated while
          the window is open, grouped by batch. It is shown during a batch of several images. Click an image to
          open it, or middle-click it to show it in the Result pane.</li>
        <li><b>Generate</b> makes one image with a live preview. With a count above 1 (or
          <AppIcon name="infinity" :size="13" class="inline-icon"/>), it runs a batch in the Generated tab.
          <b>Stop</b> ends the batch<template v-if="isComfy"> and clears the ComfyUI queue</template>; <b>Skip</b>
          skips the current image.</li>
        <li v-if="isWebUI"><b>UI preset buttons</b> switch the Forge UI preset.
          <AppIcon name="lock" :size="13" class="inline-icon"/> <b>Prompt lock</b> makes the prompts editable only
          here, and <AppIcon name="eraser" :size="13" class="inline-icon"/> clears them.</li>
        <li><b><AppIcon name="fileSearch" :size="13" class="inline-icon"/> PNG Info</b> shows the parameters of an
          image chosen, pasted or dropped there (or on the prompt). <b>Apply</b> sets the checked groups and lists
          the values that {{ HOST_NAME }} does not have.</li>
        <li><b><AppIcon name="terminal" :size="13" class="inline-icon"/> Console</b> opens a drawer with the terminal
          output of {{ HOST_NAME }}. Use its <AppIcon name="power" :size="13" class="inline-icon"/> button to restart
          {{ HOST_NAME }} when it hangs or crashes, for example after running out of memory. The restart kills the
          {{ HOST_NAME }} process and its console window, then runs the script that starts {{ HOST_NAME }}. While the
          connection to {{ HOST_NAME }} is lost, the <AppIcon name="unplug" :size="13" class="inline-icon"/> icon
          after the Library tab shows whether the process is still running, and clicking the icon restarts
          {{ HOST_NAME }} as well. To enable restarts, create <code>host_restart.json</code> in the
          <code>store</code> folder of the extension with the path of your start script, for example
          <code>{"command": "D:\\sd\\run.bat"}</code>. Until the file exists, the button tells you where to create it
          and which script started {{ HOST_NAME }}; <b>Settings › Host restart</b> shows the same information. The
          file can only be edited by hand, so nobody who reaches {{ HOST_NAME }} over the network can change the
          command. If {{ HOST_NAME }} still responds, the restart request goes through it. If it hangs, the browser
          contacts a small helper process that runs alongside {{ HOST_NAME }}. The helper listens on the same
          addresses as {{ HOST_NAME }} (including the network with <code>--listen</code>), on the
          {{ HOST_NAME }} port plus 100; set <code>"port"</code> in the file to use a different port. When
          {{ HOST_NAME }} uses https, the helper uses the same certificate. If the certificate is self-signed, your
          browser has to accept it once for the helper's port too; <b>Settings › Host restart</b> has a link for
          this.</li>
      </ul>
      <p v-if="isComfy" class="muted">
        A control whose node cannot be found in the workflow is hidden, so a missing control usually means a
        missing marker.
      </p>
    </section>

    <section id="manual-controlnet">
      <h2><AppIcon name="controlnet" :size="17"/>ControlNet</h2>
      <p>
        This tab edits one ControlNet unit at a time and mirrors it in both directions, like the Generate tab.
        <template v-if="isWebUI">The units are those of Forge "ControlNet Integrated" in the WebUI tab currently
          shown; the toolbar switches between txt2img and img2img.</template>
        <template v-else>Unit N is the ControlNet apply node titled <code>ib:cn:N</code>.</template>
      </p>
      <p>
        The <b>Unit</b> buttons of the toolbar choose the unit, and a dot marks the enabled ones. The unit chosen
        here also receives the images sent with <b>Send to ControlNet</b> and the ControlNet commands of the editor
        plugins.
      </p>
      <p>Each unit has the following controls:</p>
      <ul>
        <li><b>Enable</b>, <b>model</b>, <b>weight</b>, and the <b>starting and ending steps</b>.</li>
        <li v-if="isWebUI"><b>Control type</b> works as in WebUI: it narrows the preprocessors and lists only the
          models whose file names match it. <b>Refresh models</b> reloads the model list and shows all models until
          the control type changes. <b>Control mode</b> and <b>Resize mode</b> are the WebUI ones.</li>
        <li v-else><b>Refresh models</b> reloads the list of ControlNet models. The model is the loader connected
          to the apply node, and <b>Enable</b> bypasses the unit's nodes.</li>
        <li><b>Source</b> pane: the control image. Drop, paste or browse for it, or click
          <AppIcon name="controlnet" :size="13" class="inline-icon"/> <b>Send to ControlNet</b> on any image in
          the lists to send it to the unit selected here. <b>To Photoshop</b> (or <b>To Krita</b>, <b>To GIMP</b>) sends the shown control
          image or mask to the editor.</li>
        <li><b>Preprocessor</b> and <b>Run preprocessor</b>: the result appears in the <b>Preview</b> pane.
          From there, <b>To Photoshop</b> / <b>To Krita</b> / <b>To GIMP</b> passes it on (middle-click or Shift+click: as a new layer), and the other buttons copy,
          save and clear the preview. <b>Pixel Perfect</b> derives the preprocessor resolution
          from the image and the generation size.
          <span v-if="isWebUI"><b>Pixel Perfect</b> and <b>Allow Preview</b> are checked automatically the first time a
            unit is used after the WebUI page loads. The preprocessor sliders (for example <i>Remove Near %</i> and
            <i>Remove Background %</i> of depth_leres, and <i>Resolution</i> without Pixel Perfect) appear under it
            and are synchronized with WebUI. If they change after the preview was made, the preview shows
            <b>Parameters changed — run again</b>.</span>
          <span v-if="isComfy">Preprocessors require the comfyui_controlnet_aux node pack. Without it, the
            preprocessor controls are hidden.</span></li>
        <li v-if="isWebUI"><AppIcon name="pencil" :size="13" class="inline-icon"/> <b>Edit pose</b>: after an
          openpose preprocessor has run, this button in the Preview pane opens the pose in the OpenPose editor
          (the <a href="https://github.com/fabiencomte/sd-webui-openpose-editor" target="_blank" rel="noopener"
          >sd-webui-openpose-editor</a> extension; you are asked to install it if it is missing), with the
          control image as the background. <b>Send pose to ControlNet</b> in the editor renders the edited pose
          into the preview, which the unit then uses as its control image.</li>
        <li><b>Use Mask</b> restricts the unit to the masked area. The <b>Source</b> / <b>Mask</b> switch of the
          pane then shows the mask (ControlNet applies where it is white). Upload, drop or paste the mask like the
          control image.
          <span v-if="isComfy">This requires an Advanced-ControlNet apply node. Unchecking Use Mask bypasses the
            mask loader.</span></li>
        <li v-if="isWebUI"><b>Upload independent control image</b>: in img2img, this is checked automatically as
          soon as you set an image, because otherwise WebUI uses the img2img image.</li>
      </ul>
    </section>

    <section id="manual-explore">
      <h2><AppIcon name="flask" :size="17"/>Explore</h2>
      <p>
        Explore runs the current prompt on every checked checkpoint with every checked LoRA, and groups the
        results by model, so that you can compare models and LoRAs.
      </p>
      <p>To run an exploration:</p>
      <ol>
        <li>Check models in the <b>Checkpoints</b> list and, optionally, LoRAs in the <b>LoRAs</b> list. You can
          check a whole folder.</li>
        <li>Set the number of images per model (<b>×</b>) and press <b>Explore</b>.</li>
        <li>When the run ends or is stopped, the checkpoint previously selected in {{ HOST_NAME }} is restored.</li>
      </ol>
      <p>
        Do not change the parameters in {{ HOST_NAME }} during the run<template v-if="isWebUI"> (with <b>Send to
        txt2img</b>, for example)</template>. If you do, the exploration is aborted and has to be started again.
      </p>
      <p>The tab also offers:</p>
      <ul>
        <li><b>Per-model settings</b> (the <AppIcon name="sliders" :size="13" class="inline-icon"/> button of the
          focused model): the sampler, schedule type, steps, CFG, distilled CFG or shift to use with that model,
          since different model families need different settings. LoRAs have their own settings: weight and extra
          text (activation words).</li>
        <li><b>Presets</b> save the checked models or LoRAs under a name, such as "SDXL anime" or "Flux". Choosing a
          preset checks its items, <AppIcon name="save" :size="13" class="inline-icon"/> saves the checked items
          to it, and the menu next to it creates or deletes presets. <b>Clear</b> above the list unchecks all
          items.</li>
        <li><b>No LoRA</b>: the toggle after the layout switch, available when LoRAs are checked. While it is on
          (the default), each model also gets an image without the LoRAs as a baseline for comparison. The setting
          is kept.<span v-if="isComfy"> In ComfyUI, exploring LoRAs requires a
            LoRA loader titled <code>ib:lora</code>.</span></li>
        <li><b>By model / Matrix</b>: the switch next to <b>×</b>, available when LoRAs are checked. Matrix
          generates one image per model and LoRA, all with the same seed, and lays them out as a grid with a row
          per model and a column per LoRA (plus the No LoRA column). When you switch back to By model, the number
          of images is 3 again.</li>
        <li><b>Save results</b> stores the whole comparison as a single HTML page; <b>Clear results</b> empties
          the tab.</li>
        <li>The <AppIcon name="info" :size="13" class="inline-icon"/> button shows the Civitai information of the
          focused model or LoRA: preview, version, base model and trained words, with buttons to open its Civitai
          page and, for a LoRA, to use the trained words as its activation text. If Civitai does not know a model,
          you can search for it by name. The first lookup of a model takes a while, because its file is hashed.
          Found models are kept in the
          <code>store/civitai</code> folder of the extension, one file per model hash. To look a model up again
          when its information is outdated, delete its file (or the whole folder).</li>
      </ul>
      <div v-if="isWebUI" class="note">
        <AppIcon name="info" :size="15"/>
        <div>
          Model exploration switches the
          <b>UI Preset</b> for each model automatically, based on the model's folder and file name. A preset is
          chosen when its name appears in them (<code>flux</code>, <code>klein</code>, <code>qwen</code>, ...), and
          <code>sd</code>, <code>xl</code> and <code>zit</code> are recognised by <code>sd/</code>,
          <code>sdxl</code> and <code>z-image</code>. When several presets match, the longest match wins, so
          <code>flux/klein/model.safetensors</code> selects <code>klein</code>, not <code>flux</code>.
          Models that match nothing keep the current preset. To make this reliable, sort checkpoints into folders
          named after their family (<code>sdxl/</code>, <code>flux/</code>, <code>klein/</code>, ...).
        </div>
      </div>
    </section>

    <section id="manual-generated">
      <h2><AppIcon name="images" :size="17"/>Generated</h2>
      <p>
        This tab collects every image that {{ HOST_NAME }} generates while Image Bench is open, each
        with its parameters.
      </p>
      <p>The toolbar and what you can do with the results:</p>
      <ul>
        <li><b>Generate × N</b> runs a batch with the current parameters and a random seed for each image. The
          count button beside it sets the number chosen in <b>Settings › Images set by the count button</b>,
          clicking <b>×</b> resets the count to 1, and
          <AppIcon name="infinity" :size="13" class="inline-icon"/> keeps generating until you stop it.</li>
        <li v-if="isWebUI"><b>Variations…</b> generates variations of the current seed. The variation seed and
          strength are set for the batch and cleared when it is done.</li>
        <!--li v-if="isWebUI"><b>Apply preset</b> — applies a preset of the Config Presets extension before the
          batch (shown only when that extension is installed).</li-->
        <li>Move the images worth keeping to a tray with
          <AppIcon name="concept" :size="13" class="inline-icon"/> or
          <AppIcon name="palette" :size="13" class="inline-icon"/>. While the
          <AppIcon name="recycle" :size="13" class="inline-icon"/> <b>Clear automatically when a
          new batch starts</b> toggle is on, the tab is emptied whenever a new batch starts; turn it off to keep
          the images of successive runs. <b>Clear</b> removes all images
          from the tab (the files stay on disk).</li>
        <li><b>Selecting images</b>: check images with the circle at the top left of the thumbnail, or all of them
          with <b>Select all</b> in the toolbar. While images are checked, the toolbar can add them all at once to
          the Compare tab
          (<AppIcon name="compare" :size="13" class="inline-icon"/>), the concept tray
          (<AppIcon name="concept" :size="13" class="inline-icon"/>) or the image tray
          (<AppIcon name="palette" :size="13" class="inline-icon"/>), and dragging a checked thumbnail takes them
          all along. <span class="kbd">Ctrl</span>+<span class="kbd">U</span> unchecks them.</li>
        <li><b>Filtering by markings</b>: as in the trays, <AppIcon name="filter" :size="13" class="inline-icon"/>
          shows only the marked images, and clicking the marking of an image shows only the images with that
          marking (click it again to show all).</li>
      </ul>
    </section>

    <section id="manual-compare">
      <h2><AppIcon name="compare" :size="17"/>Compare</h2>
      <p>
        The Compare tab shows images next to each other, for example inpainted variants of a face, or the same
        prompt with different seeds or LoRAs. To add an image, use its <AppIcon name="compare" :size="13"
        class="inline-icon"/> button (key <span class="kbd">A</span>) in any view, drag it onto the
        <b>Compare</b> tab, add files with <AppIcon name="upload" :size="13"
        class="inline-icon"/>, or use the <b>Compare</b> button of the editor plugin. Like the trays, the tab
        keeps its images across restarts
        and is saved with the trays into a <a href="#" @click.prevent="scrollTo('projects')">project</a>.
        <b>Clear</b> removes them all from the tab (the files stay on disk).
      </p>
      <ul>
        <li><b>Layout</b>: the images follow each other, separated by a thin line whose color you set with the
          <b>Separator color</b> swatch button. Images that all have the same landscape aspect ratio are stacked
          and scroll vertically; portrait, square and mixed images are placed in a row that the mouse wheel
          scrolls horizontally. Drag an image to scroll.</li>
        <li><b>Numbers and order</b>: each image shows its number. To move an image, drag the
          <AppIcon name="grip" :size="13" class="inline-icon"/> grip next to the number onto another image, or press
          <span class="kbd">←</span> / <span class="kbd">→</span> over it.</li>
        <li><b>Zoom</b>: <b>100%</b> and <b>200%</b> show the first image at its actual pixel size and at twice that
          size, <span class="kbd">Ctrl</span>+wheel zooms around the pointer, and <AppIcon name="fit" :size="13"
          class="inline-icon"/> fits the images again. All images zoom and pan together, so dragging any of them
          shows the same spot in each.</li>
        <li><b>Region</b>: turn on <AppIcon name="region" :size="13" class="inline-icon"/> (key
          <span class="kbd">R</span>) and drag on any image to select a rectangle. It appears on every image at the
          same relative position. Drag inside it to move it, or drag its handles to resize it. The <b>Aspect ratio</b> menu
          next to the button fixes its aspect ratio, holding <span class="kbd">Shift</span> while dragging keeps the
          current one, and the <AppIcon name="close" :size="13" class="inline-icon"/> next to the menu removes the
          region. The region, its aspect ratio and the separator color are remembered.</li>
        <li><b>Crops</b> (key <span class="kbd">X</span>) shows only the region of every image, packed as large
          as the window allows. The wheel scales them around the pointer (so do the zoom buttons; 100% is the
          native resolution of the largest crop), and dragging pans them. <AppIcon name="save" :size="13" class="inline-icon"/> saves the crops as one PNG at
          their native resolution, and <AppIcon name="photoshop" :size="13" class="inline-icon"/> opens that image in
          the editor as a new document.</li>
        <li><b>Image actions</b>: images and crops show only their number, comment and marking. Hold
          <span class="kbd">Ctrl</span> over one to show its action rim (parameters, ControlNet, editor, the trays,
          a comment, Remove from compare at the bottom, and the markings in the middle), right-click it for its
          actions, or use the keys. Middle-click or Shift+click an image to view it large (in Crops, click or
          middle-click it).</li>
        <li><b>Clear</b>: <b>Marked</b> / <b>Unmarked</b> remove the images with or without a marking, and
          <b>All</b> removes all of them. The files stay on disk.</li>
      </ul>
    </section>

    <section id="manual-trays">
      <h2><AppIcon name="palette" :size="17"/>Concept tray and image tray</h2>
      <p>
        The two trays are permanent collections stored on the {{ HOST_NAME }} server, so they survive restarts.
        One way to use them is to collect promising ideas (compositions, prompts, seeds to return to) in the
        <b>concept tray</b>, and the images you mean to finish by upscaling, refining or editing them in the editor
        in the <b>image tray</b>.
      </p>
      <p>
        To put an image into a tray, use the <AppIcon name="concept" :size="13" class="inline-icon"/> <b>Add to
        concept tray</b> or <AppIcon name="palette" :size="13" class="inline-icon"/> <b>Add to image tray</b>
        action of its card (hold <span class="kbd">Ctrl</span> over the image to show the action rim), of the full
        image view or of its context menu, or press <span class="kbd">Y</span> or <span class="kbd">T</span> over
        it. The tray's tab flashes when the image arrives. In a tray, only the action for the other tray is
        offered; it adds a copy of the image there.
      </p>
      <p>
        You can also drag a thumbnail by its image onto the <b>Concept tray</b> or <b>Image tray</b> tab. Images
        dragged from any other view are copied; images dragged from one tray to the other are moved.
        Dragging a selected thumbnail takes all selected images along. To change the order of a tray, drag
        thumbnails onto another thumbnail of the same tray: a bar shows whether they go before or after it.
      </p>
      <p>Both trays offer:</p>
      <ul>
        <li><b>Markings</b> (👍 👎 🔴 🟠 🟡 🟢 🔵 🟣, and 🏁 for the final choice), available through the action menu's
          <AppIcon name="tag" :size="13" class="inline-icon"/> button. In the
          full image view, hover over the badge at the bottom left (or the current marking) and click a marking, or
          press <span class="kbd">1</span>–<span class="kbd">9</span>; clicking the current marking or pressing
          <span class="kbd">0</span> removes it. On a thumbnail, click the marking to show only the
          images that carry it, and click it again to show all; middle-click it to remove it. The
          <AppIcon name="filter" :size="13" class="inline-icon"/> button shows only marked images, or the marking
          being shown. The markings of the same images are synchronized across tabs.</li>
        <li><b>Batch colors</b>: the colored bar at the left edge of a thumbnail shows where the image comes
          from. Images of the same generation run (one batch, or one run of model exploration, steps, denoising
          strengths, etc.) share a color, and each new run takes the next color.</li>
        <li><b>Comments</b> <AppIcon name="comment" :size="13" class="inline-icon"/> on images, shown at the top of the image.</li>
        <li><b>Removing images</b>: check them and use <b>Remove selected</b>, which appears in the toolbar
          while images are checked, or use the <AppIcon name="trash" :size="13" class="inline-icon"/> button of the
          full image view. <b>Clear</b> removes all images of the tray. In both cases the files stay on disk.</li>
        <li><b>Compare selected</b> adds the checked images to the Compare tab.</li>
        <li><b>Generate with steps</b> <AppIcon name="steps" :size="13" class="inline-icon"/> asks for a list of
          step counts and generates the image again with each of them in the Generated tab.</li>
        <li v-if="isWebUI"><b>Generate with text encoders</b> <AppIcon name="puzzle" :size="13" class="inline-icon"/>
          lists the text encoder files, filtered by the name of the image's own encoder (which is checked), and
          generates the image again with each checked encoder, keeping its seed and other modules. If the image
          used several encoders (CLIP-L and T5), the one whose name is most similar to the checked one is replaced.
          The modules set before are restored afterwards. This action is in the context menu of the image (key
          <span class="kbd">E</span>), not on the action rim.</li>
        <li><b>Upscale with denoising</b> <AppIcon name="denoise" :size="13" class="inline-icon"/>
          asks for a list of Hires. fix denoising strengths and upscales the image with each of them. <b>Upscale
          selected</b>, shown in the toolbar next to it, upscales each selected image.<template v-if="isComfy"> Upscaling
          needs a workflow with a Hires. fix sampler (<code>ib:smp:1</code>); its <code>ib:hr</code> switch is
          turned on for the run and restored afterwards.</template></li>
        <li><b>Download</b> <AppIcon name="download" :size="13" class="inline-icon"/> saves the tray as a .zip
          archive (images with their parameters), which can be imported into any tray.</li>
        <li><b>Import</b> <AppIcon name="upload" :size="13" class="inline-icon"/> adds .png files (with their
          parameters) or a tray archive (.zip). The
          trays themselves are saved into the
          <a href="#" @click.prevent="scrollTo('projects')">projects</a>.</li>
      </ul>
      <div v-if="isComfy" class="note warn">
        <AppIcon name="alert" :size="15"/>
        <div>
          <b>Re-generating an image uses the open workflow.</b> Buttons that make an image again (upscale,
          upscale with denoising, generate with steps) set the image's prompt, model, seed, etc. and run the
          workflow that is open. Generate the drafts and upscale them with the same workflow, or with one of the
          same structure.
        </div>
      </div>
    </section>

    <section id="manual-upscaled">
      <h2><AppIcon name="upscale" :size="17"/>Upscaled</h2>
      <p>
        This tab shows the results of the <AppIcon name="upscale" :size="13" class="inline-icon"/> upscale button.
        The image is generated again from its parameters, this time with Hires. fix, using the Hires. fix
        settings currently set in {{ isWebUI ? "WebUI" : "the workflow (the Hires. fix group of the Generate tab)" }}.
      </p>
      <p>
        Like the trays, the tab keeps its images until you remove them.
        A colored bar marks the images of one upscale run. Drag thumbnails onto another one to reorder them, as in
        the trays. <AppIcon name="download" :size="13" class="inline-icon"/> downloads
        them as a .zip, which can be imported into a tray.
      </p>
      <p>
        Images are checked as in the <a href="#" @click.prevent="scrollTo('generated')">Generated</a> tab, with the
        same buttons to add them to the Compare tab or a tray. <b>Remove selected</b> removes them from the tab
        (the files stay on disk).
      </p>
    </section>

    <section id="manual-library">
      <h2><AppIcon name="library" :size="17"/>Library</h2>
      <p>
        The Library tab has three parts, switched at the top of its left column: <b>Docs</b>
        <AppIcon name="book" :size="13" class="inline-icon"/>, <b>Snippets</b>
        <AppIcon name="snippet" :size="13" class="inline-icon"/> and <b>Manual</b>
        <AppIcon name="help" :size="13" class="inline-icon"/>.
      </p>
      <h3 id="manual-library-docs">Docs</h3>
      <p>
        Docs shows the Markdown files (<code>.md</code>) under the docs root (<b>Settings › Library › Docs root</b>; by default the
        <code>model_docs</code> folder of the extension) in a tree. Folders without documents are left out. Click a
        document to read it in the right pane. Docs are read-only: edit the files in any editor and press
        <AppIcon name="refresh" :size="13" class="inline-icon"/> to read them again. Images and links to other
        documents work when they are relative to the document; other links open in a new window.
      </p>
      <p>
        Extension updates replace the documents shipped in <code>model_docs</code>, so keep your own documents in a
        separate folder (you can copy the shipped ones there to start with) and set it as the docs root.
      </p>
      <p>
        Tag lists (<code>.csv</code> files for tag autocompletion, such as the Anima or Danbooru tags: tag, category,
        post count, aliases) are shown with a search field instead. Type part of a tag or of one of its aliases to
        find it (spaces and underscores are treated the same). Exact and leading matches come first, then the more
        frequently used tags. Click a tag to copy it with spaces instead of underscores, as it is written in prompts.
      </p>
      <h3 id="manual-library-snippets">Snippets</h3>
      <p>
        Snippets are pieces of prompt text with an optional negative part, organised in folders. You insert them
        from the Snippets panel of the Generate tab. <code>{}</code> or <code>{prompt}</code> (as in WebUI styles) in a
        snippet stands for the selected prompt text, which Shift+click wraps. For example, with the snippet
        <code>watercolor painting of {}, soft pastel colors</code>, selecting <code>a cat on a windowsill</code> in
        the prompt and Shift+clicking the snippet turns the selection into <code>watercolor painting of a cat on a
        windowsill, soft pastel colors</code>. Edit a snippet in the right pane; changes
        are saved as you type. Drag snippets to reorder them or to move them into a folder.
      </p>
      <p>
        Badges after the name show what a snippet does: <span class="snippet-badge negative">−</span> marks a
        snippet with a negative part, which is added to the negative prompt when the snippet is inserted, and
        <span class="snippet-badge wrap">{}</span> marks one that wraps the selected text. Hover over the name to see
        the whole text of the snippet, including the negative part. The <span class="snippet-badge negative">−</span>
        badge also appears in the Snippets panel of the Generate tab.
      </p>
      <p>
        The
        <AppIcon name="download" :size="13" class="inline-icon"/> button imports the styles of a WebUI
        <code>styles.csv</code> file<template v-if="isWebUI"> or of a file in this extension's format</template> as snippets.
      </p>
      <h3 id="manual-library-manual">Manual</h3>
      <p>
        This manual.
      </p>
    </section>

    <section id="manual-projects">
      <h2><AppIcon name="box" :size="17"/>Projects</h2>
      <p>
        Click the project chip at the right of the tab bar to show the projects.
      </p>
      <p>
        A project holds a piece of work: the image tray, the concept tray and the contents of the Compare tab,
        the parameters of the Generate and ControlNet tabs with the ControlNet images, and, in
        ComfyUI, the workflow. Projects are folders under the project root, which you set in <b>Settings › Library › Project root</b>.
        The root is a folder on the {{ HOST_NAME }} server computer and can be a network (UNC) path such as
        <code>\\server\share\projects</code>, since {{ HOST_NAME }} may run on another computer. A folder
        that contains an <code>ib_project</code> folder is a project. Image Bench keeps its data there, and the
        other image files of the project folder (your edits, Photoshop, Krita or GIMP files, references) are listed in the
        project.
      </p>
      <ul>
        <li><b>The tree</b> shows folders and projects. Create them with the buttons above the tree or from the
          context menu, rename them (<span class="kbd">F2</span>), move them by dragging onto a folder or with
          <b>Move to…</b>, and delete them (<span class="kbd">Del</span>; on local drives they go to the Recycle Bin).
          <b>Copy path</b> copies the path on the server; <b>Show in Explorer</b> is offered when {{ HOST_NAME }}
          runs on this computer. The letter after a project shows the host it was saved in: <b>W</b> (WebUI) or
          <b>C</b> (ComfyUI).</li>
        <li><b>Search</b>: words find projects by name and prompt, <code>#tag</code> keeps the projects with that
          tag, and <code>host:comfy</code> or <code>host:webui</code> keeps those of a host. Results are listed with
          their folders. The tags under the field, with their counts, add themselves to the search.</li>
        <li><b>The current project</b> is shown at the right of the tab bar, with a dot when the trays have
          changed since the last save. Its <AppIcon name="save" :size="13" class="inline-icon"/> button or
          <span class="kbd">Ctrl</span>+<span class="kbd">S</span> saves the workspace into it; nothing is saved
          automatically. Image Bench remembers the current project across restarts. Without a current project the
          chip reads <i>No project</i>, and its <AppIcon name="plus" :size="13" class="inline-icon"/> button
          creates a new project. Right-click the chip to open one of the recent projects.
          Drop image cards on the chip to copy them into the folder of the current project.</li>
        <li><b>New project</b> creates the folder and, unless unchecked, saves the workspace into it and makes it
          current.</li>
        <li><b>Open</b> (or double-click) restores the trays and parameters of a project and makes it current.
          If the current project has unsaved changes, you are asked to save or discard them first. The menu next
          to <b>Open</b> restores <b>Trays only</b> or <b>Parameters only</b>, offers <b>Merge trays into the
          workspace</b>, or saves the workspace into the project shown. <b>Revert</b> restores the saved state of the
          current project.</li>
        <li><b>Parameters</b> are those of the generation mode that was shown, as they were when the project was
          saved, with the enabled ControlNet units and their images and edited poses. Input and reference images
          are not saved. The <b>Apply to Generate</b> option restores the parameters without the trays. Parameter
          values that {{ HOST_NAME }} does not
          have (a missing checkpoint, LoRA or ControlNet model) keep their current value and are listed after
          opening. A project saved in the other host can be opened too: samplers, schedulers and checkpoints are
          matched by name, and anything without a counterpart is listed.</li>
        <li><b>Final image</b>: the image the project led to. Drop an image or a card on it, choose a file, or
          mark an image in the tabs below with <AppIcon name="star" :size="13" class="inline-icon"/>. It is copied
          into <code>ib_project</code> and kept even if the workspace is not saved. A project saved without a
          final image uses the image marked 🏁 in the image tray (or else in the concept tray).</li>
        <li><b>Tags</b> and <b>notes</b> are saved immediately. Click a tag to search by it.</li>
        <li>The tabs under the parameters, <b>Image tray</b>, <b>Concept tray</b>, <b>Compare</b> and <b>Files</b>,
          contain the images of the trays as of the last save, and the image files of the project folder.
          Click an image to view it
          (<span class="kbd">←</span> / <span class="kbd">→</span> page through them), middle-click to open it in
          a new tab, or right-click for the menu (final image, Compare, editor, and deleting a file of the project folder).</li>
      </ul>
    </section>

    <section id="manual-settings">
      <h2><AppIcon name="settings" :size="17"/>Settings and actions</h2>
      <p>The <b>Settings</b> tab has the following options, which are saved on the {{ HOST_NAME }} server:</p>
      <ul>
        <li><b>Accent color</b>: the highlight color of the window (buttons, active tabs, selections). It can help
          to tell apart Image Bench windows of different hosts (WebUI/ComfyUI).</li>
        <li><b>Open Image Bench from the {{ HOST_NAME }} interface</b>: the <b>🔬 Image Bench</b> button
          {{ isWebUI ? "in the header of the WebUI page" : "in the ComfyUI toolbar" }} opens Image Bench from that
          page. Off by default; Image Bench is then opened by its <code>/image-bench/app</code> link, which the
          button shows.</li>
        <li><b>Show the action rim of an image on hover (without holding Ctrl)</b>: opens the action rim of an image
          when the pointer is over it, as described in <a href="#" @click.prevent="scrollTo('images')">Working with images</a>.
          Off by default; the rim then shows while
          <span class="kbd">Ctrl</span> is held or through its toggle button.</li>
        <li><b>Open Image Bench in a popup window instead of a browser tab</b>: the 🔬 button and the
          <code>/image-bench/app</code> link open Image Bench in a popup window (without bookmarks and extension
          buttons) instead of a regular browser tab. The change takes effect the next time Image Bench is opened.</li>
        <li><b>Flash the Generated tab when an image arrives while another tab is shown</b>: generations started
          from the Generate tab or in {{ HOST_NAME }} itself leave Image Bench on the tab it shows, and the tab that
          receives each image flashes. Turn this setting
          off to stop the Generated tab from flashing; the Upscaled tab still flashes.</li>
        <template v-if="isWebUI">
          <li><b>UI preset buttons</b>: the Forge UI presets that the buttons of the Generate tab switch to. The
            other presets remain available in the menu next to them.</li>
          <li><b>Images set by the count button</b>: the number of images that one click of the count button sets in
            the Generate and Generated tabs. WebUI allows at most 100 images per batch. To go beyond that, raise
            <code>"txt2img/Batch count/maximum"</code> and <code>"img2img/Batch count/maximum"</code> in
            <code>ui-config.json</code> in the WebUI folder, then restart WebUI.</li>
        </template>
        <li><b>Project root</b>: the folder of the projects as the {{ HOST_NAME }} server sees it
          (a local or network path). <b>Check</b> tells whether it exists and is writable.</li>
        <li><b>Docs root</b>: the folder of the Library's Markdown documents. Leave it empty to use the
          <code>model_docs</code> folder of the extension, whose documents are replaced by updates. <b>Check</b> counts
          the documents in it.</li>
        <li v-if="isWebUI"><b>Add 'Civitai Model Info' settings button</b>: adds an ℹ️ button next to the
          checkpoint list of the WebUI page, which opens the Civitai page of the selected checkpoint. The button
          appears or disappears when you return to the WebUI window.</li>
        <li><b>Open models on</b>: the Civitai site that model pages open on, civitai.com or civitai.red.</li>
        <template v-if="isWebUI">
          <li><b>Remember prompts and generation parameters across WebUI reloads</b>: saves the prompts and
            parameters of txt2img and img2img in the browser each time a generation starts, and restores them
            when the WebUI page is reloaded. The seed and the variation seed are not remembered.</li>
        </template>
      </ul>
      <p>
        The <AppIcon name="broom" :size="13" class="inline-icon"/> button at the right end of the tab bar opens the
        clean-up actions. Each one asks for confirmation first. The number of
        <AppIcon name="nuke" :size="13" class="inline-icon"/> signs shows how much an action destroys:
      </p>
      <ul>
        <li><b>Clear generated images</b> <AppIcon name="nuke" :size="13" class="inline-icon"/> removes all
          images from the Generated, Upscaled and Explore tabs. The trays, the
          Compare tab, the prompts and the parameters are kept, and no files are deleted.</li>
        <li><b>Start a blank workspace</b> <AppIcon name="nuke" :size="13" class="inline-icon"/><AppIcon
          name="nuke" :size="13" class="inline-icon"/> is for starting a new project. It also empties both trays and
          the Compare tab, clears the prompts, sets a random seed<template v-if="isWebUI"> (and clears the variation
          seed)</template>, and closes the current project, whose saved state is kept. The other
          parameters are kept, and the image files stay on disk.</li>
        <li><b>Delete all output files</b> <AppIcon name="nuke" :size="13" class="inline-icon"/><AppIcon
          name="nuke" :size="13" class="inline-icon"/><AppIcon name="nuke" :size="13" class="inline-icon"/>
          clears all tabs and trays and permanently deletes every file and folder in the {{ HOST_NAME }} output
          folder, including tray and upscaled images. This cannot be
          undone.</li>
        <li v-if="isWebUI"><b>Reset saved generation parameters</b> <AppIcon name="reset" :size="13"
          class="inline-icon"/> forgets the prompts and parameters saved by <b>Remember prompts and generation
          parameters across WebUI reloads</b>, so that nothing is restored at the next reload.</li>
      </ul>
    </section>

    <section id="manual-editors">
      <h2>Editors</h2>
      <p>
        Plugins for <b>Photoshop</b>, <b>Krita</b> and <b>GIMP</b> come with this extension and connect the editor to
        {{ HOST_NAME }}. They send the document and its selection to the Generate, ControlNet and Compare tabs, and
        receive any image from Image Bench as a new document or layer.
      </p>
      <p>
        One editor is connected at a time. The send buttons of Image Bench show its name and icon
        (<AppIcon name="photoshop" :size="13" class="inline-icon"/>, <AppIcon name="krita" :size="13"
        class="inline-icon"/> or <AppIcon name="gimp" :size="13" class="inline-icon"/>); while no editor is
        connected, they keep the last one. When an editor connects, the previously connected one shows
        <b>Reconnect</b> with a grey dot and stays disconnected until you click it, so that
        two running editors do not take the connection from each other.
      </p>
      <div class="note warn">
        <AppIcon name="alert" :size="15"/>
        <div>
          <b>If {{ HOST_NAME }} uses https, the editor has to trust its certificate.</b> An exception accepted in the
          browser does not count, because the plugins check the certificate on their own. With a self-signed
          certificate, add it to the trusted root certificates of the computer where the editor runs (on Windows, run
          <code>certutil -addstore Root &lt;certificate&gt;.crt</code> as an administrator, or import it into
          <b>Trusted Root Certification Authorities</b> with <code>certmgr.msc</code>), then restart the editor. The
          certificate must be issued for the name or address you enter in the plugin; otherwise the connection still
          fails.
        </div>
      </div>

      <h3 id="manual-editor-photoshop">Photoshop</h3>
      <p>
        The <b>Image Bench</b> plugin for Photoshop (2024 / version 25.0 or newer) connects Photoshop to {{ HOST_NAME }}.
      </p>

      <PluginCard plugin="image-bench" title="Image Bench plugin">
        <li><b>Download .ccx</b> and double-click the file to install it with the Creative Cloud app, then restart
          Photoshop.</li>
        <li>To install it manually (as an administrator on Windows):
          <ol>
            <li>The .ccx file is a zip archive. Unpack it into a new folder named like the file without
              <code>.ccx</code> (<code>image-bench.photoshop_&lt;version&gt;</code>) in
              <code>C:\Program Files\Common Files\Adobe\UXP\Plugins\External</code>, so that the folder contains
              <code>manifest.json</code>. On macOS the folder is
              <code>/Library/Application Support/Adobe/UXP/Plugins/External</code>.</li>
            <li>Register the plugin with Photoshop: add this entry to the <code>plugins</code> list of
              <code>%APPDATA%\Adobe\UXP\PluginsInfo\v1\PS.json</code> (on macOS
              <code>~/Library/Application Support/Adobe/UXP/PluginsInfo/v1/PS.json</code>, with <code>/</code> in
              <code>path</code>). If the file does not exist, create it as <code>{"plugins": [ … ]}</code>.
              <pre v-pre>{
  "hostMinVersion": "25.0.0",
  "name": "Image Bench",
  "path": "$localPlugins\\External\\image-bench.photoshop_&lt;version&gt;",
  "pluginId": "image-bench.photoshop",
  "status": "enabled",
  "type": "uxp",
  "versionString": "&lt;version&gt;"
}</pre></li>
            <li>Restart Photoshop. To update, replace the folder with the folder of the new version and change both
              versions in the entry.</li>
          </ol>
        </li>
        <li>The plugin is not signed by Adobe. If it does not appear in the <b>Plugins</b> menu after the restart,
          turn on <b>Preferences › Plugins › Enable Developer Mode</b> in Photoshop and restart it again.</li>
      </PluginCard>

      <h4>Connecting</h4>
      <ol>
        <li>In Photoshop, open <b>Plugins › Image Bench › Image Bench</b> and dock the panel.</li>
        <li>Enter the address of {{ HOST_NAME }} in the panel and press Enter. The default is
          <code>{{ isComfy ? "http://127.0.0.1:8188" : "http://127.0.0.1:7860" }}</code>; this page is served from
          <code>{{ hostOrigin }}</code>. The plugin talks to one host at a time.</li>
        <li>The button next to the address shows the connection state (<b>Connected</b>, <b>Connecting...</b> or
          <b>Reconnect</b>, with a green, orange or red dot, or a grey one when another editor took the connection)
          and reconnects when clicked. Once connected, the plugin stays connected as long as Photoshop runs.</li>
      </ol>

      <h4>Photoshop → {{ HOST_NAME }}</h4>
      <p>The plugin panel has these commands:</p>
      <ul>
        <li><b>Input / Inpaint: Image</b>: the composite image of the document becomes the input image.
          <template v-if="isWebUI">It goes into the img2img canvas when img2img › img2img is shown, and into img2img ›
            Inpaint upload otherwise,</template>
          <template v-else>It goes into the load node marked <code>ib:img</code>,</template>
          unless the <span class="kbd">Ps</span> <b>sends to</b> option of the Generate tab makes it a new reference.</li>
        <li><b>Input / Inpaint: Mask</b> sends the selection as a black-and-white mask to
          {{ isWebUI ? "the inpaint upload mask (also while img2img › img2img is shown)" : "the node marked ib:mask" }}.
          Feathered selections give soft edges.</li>
        <li><b>Input / Inpaint: Both</b> sends both at once. This is the usual way to inpaint part of a document.</li>
        <li><b>ControlNet: preprocess</b> loads the image into the unit shown in the ControlNet tab, runs its
          preprocessor, and places the result back in Photoshop as a layer. <b>ControlNet: image</b> uses the image
          as the control image unchanged, without a preprocessor, and <b>ControlNet: mask</b> sends the selection as
          the unit's mask.</li>
        <li><b>Keep</b>: <b>Compare</b> adds the composite image of the document to the Compare tab, also while
          the Image Bench window is closed (the image appears when the window opens). <b>File</b> saves the document
          with its layers as <code>&lt;project name&gt;-NNN.psd</code> (the next free number) into the folder of the
          project open in Image Bench. <b>Final</b> saves it as <code>final-NNN.psd</code>, <code>.png</code> and a
          high-quality <code>.jpg</code> (the next free number, starting with <code>final-001</code>) and makes the
          PNG the project's final image. File and Final need an open project (see
          <a href="#" @click.prevent="scrollTo('projects')">Projects</a>). The Krita and GIMP plugins have the same
          buttons.</li>
      </ul>
      <p class="muted">
        The same commands are in the <b>Plugins › Image Bench</b> menu, so you can assign keyboard shortcuts to
        them under <b>Edit › Keyboard Shortcuts › Plugins</b>.
      </p>

      <h4>{{ HOST_NAME }} → Photoshop</h4>
      <p>
        The <AppIcon name="photoshop" :size="13" class="inline-icon"/> <b>Send to Photoshop</b> button of any image,
        like <b>To Photoshop</b> in the ControlNet panes, opens the image as a new document.
        Middle-click or Shift+click it to place the image as a new layer of the active document instead. The layer
        is rasterized, so you can edit its pixels directly; check <b>Place as smart objects</b> in the plugin panel
        to keep it a smart object. A notice at the bottom of the window shows the transfer until the image is in
        Photoshop. With a plugin installed before this notice was added, the notice lasts only until the server has
        passed the image on; reinstall the plugin above to fix this. The plugin panel also shows a blinking dot
        while an image is sent or received, and its buttons wait until the transfer ends.
      </p>

      <h3 id="manual-photoshop-canny">Canny Edges plugin</h3>
      <p>
        A second, standalone plugin computes the Canny edges of the document in Photoshop itself, the same edges as
        <code>cv2.Canny</code> of ControlNet's canny preprocessor. It needs no connection to {{ HOST_NAME }}.
        Use it to make a control image you can touch up: compute the edges, paint out or add lines on the layer,
        then send it with <b>ControlNet: image</b> of the Image Bench plugin. Install it like the Image Bench plugin
        (the notes above apply; for a manual install, its folder is <code>image-bench.canny_&lt;version&gt;</code> and
        its entry has <code>"name": "Canny Edges"</code> and <code>"pluginId": "image-bench.canny"</code>), then open
        <b>Plugins › Canny Edges</b>.
      </p>

      <PluginCard plugin="canny" title="Canny Edges plugin"/>

      <ul>
        <li><b>Threshold 1</b> and <b>Threshold 2</b> are the hysteresis thresholds: lines start at edges stronger
          than the higher one and continue down to the lower one.</li>
        <li><b>Blur</b> is the size of a Gaussian blur applied first (1 means no blur). It removes fine texture.</li>
        <li><b>Merged</b> or <b>Active layer</b> selects the image the edges are computed from. The plugin reads it
          again when another document or layer is selected, when you press <b>Refresh</b> after editing it, and
          before each apply.</li>
        <li>The preview updates live and shows the full-size result zoomed out. <b>Fast preview</b> computes it
          from a smaller copy instead, which is quicker for full images but does not show exactly the edges that
          are applied.</li>
        <li><b>Selection only</b> keeps the edges inside the selection.</li>
        <li><b>As layer</b> puts white-on-black edges into a layer named after the parameters, as one history
          step; applying again in the same document overwrites that layer. <b>As document</b> opens them as a new
          document.</li>
      </ul>

      <h3 id="manual-editor-krita">Krita</h3>
      <p>
        The <b>Image Bench</b> plugin for Krita (5.2 or newer) works like the Photoshop plugin.
      </p>

      <PluginCard plugin="krita" title="Image Bench plugin for Krita" badge="Kr">
        <li><b>Download .zip</b>, then in Krita choose <b>Tools › Scripts › Import Python Plugin from File</b> and
          select the file.</li>
        <li>Restart Krita afterwards. If the docker is missing, enable <b>Image Bench</b> in
          <b>Settings › Configure Krita › Python Plugin Manager</b> and restart Krita again.</li>
      </PluginCard>

      <h4>Connecting</h4>
      <p>
        Show the docker with <b>Settings › Dockers › Image Bench</b>, enter the address of {{ HOST_NAME }}
        (<code>{{ hostOrigin }}</code>) and press Enter. Recent addresses are in its dropdown. The button next to
        the address shows and restores the connection, as in the Photoshop panel. The connection lasts as long as
        Krita runs, whether or not the docker is shown.
      </p>

      <h4>Krita → {{ HOST_NAME }}</h4>
      <p>
        The docker has the commands of the Photoshop panel: <b>Input / Inpaint</b> (<b>Image</b>, <b>Mask</b>,
        <b>Image + Mask</b>), <b>ControlNet</b> (<b>Preprocess</b>, <b>Image</b>, <b>Mask</b>) and <b>Keep</b>
        (<b>Compare</b>, <b>File</b>, <b>Final</b>). The image is the merged document, converted to
        8-bit sRGB regardless of the document's color space; the mask is the selection. The same commands are in
        <b>Tools › Scripts › Image Bench</b>, and you can assign shortcuts to them in <b>Settings › Configure Krita › Keyboard
        Shortcuts</b>.
      </p>

      <h4>{{ HOST_NAME }} → Krita</h4>
      <p>
        <b>Send to Krita</b> opens the image as a new document. Middle-click or Shift+click places it as a new paint
        layer above the active one, centered on the canvas and converted to the color space of the document.
      </p>

      <h3 id="manual-editor-gimp">GIMP</h3>
      <p>
        The <b>Image Bench</b> plugin for GIMP (3.0 or newer) works like the Photoshop plugin. GIMP plugins
        cannot add docked panels, so its panel is a separate window.
      </p>

      <PluginCard plugin="gimp" title="Image Bench plugin for GIMP" badge="Gi">
        <li><b>Download .zip</b> and unpack it into the <code>plug-ins</code> folder shown in GIMP under
          <b>Edit › Preferences › Folders › Plug-ins</b> (<code>%APPDATA%\GIMP\3.x\plug-ins</code> on Windows;
          GIMP Portable keeps it in its own <code>Data\GimpAppData</code> folder), so that the folder contains an
          <code>image_bench</code> folder.</li>
        <li>Restart GIMP afterwards. The <b>Tools › Image Bench</b> menu then appears in the image window.</li>
      </PluginCard>

      <h4>Connecting</h4>
      <p>
        Open <b>Tools › Image Bench › Panel</b>, enter the address of {{ HOST_NAME }} (<code>{{ hostOrigin }}</code>) and
        press Enter. Recent addresses are in its dropdown. The button next to the address shows and restores the
        connection, as in the Photoshop panel. The connection lasts as long as the panel runs. Closing its window
        only hides it (<b>Tools › Image Bench › Panel</b> shows it again); <b>Quit</b> closes the panel and the
        connection.
      </p>

      <h4>GIMP → {{ HOST_NAME }}</h4>
      <p>
        The panel has the commands of the Photoshop panel: <b>Input / Inpaint</b> (<b>Image</b>, <b>Mask</b>,
        <b>Image + Mask</b>), <b>ControlNet</b> (<b>Preprocess</b>, <b>Image</b>, <b>Mask</b>) and <b>Keep</b>
        (<b>Compare</b>, <b>File</b>, <b>Final</b>). They send the image chosen in the
        panel's <b>Image</b> list, because GIMP does not tell plugins which image window is active; opening the
        panel from an image window selects that image. The image is the visible layers merged and converted to
        8-bit sRGB regardless of the image's mode and precision; the mask is the selection. The same commands are in
        the <b>Tools › Image Bench</b> menu. There they send the image of the window they are chosen in, also while
        the panel is closed, and you can assign shortcuts to them in <b>Edit › Keyboard Shortcuts</b>.
      </p>

      <h4>{{ HOST_NAME }} → GIMP</h4>
      <p>
        <b>Send to GIMP</b> opens the image as a new image. Middle-click or Shift+click places it as a new layer
        of the image chosen in the panel, above its selected layer and centered on the canvas. Images are
        received only while the panel runs.
      </p>
    </section>

    <section v-if="isComfy" id="manual-comfy-setup">
      <h2>ComfyUI setup</h2>
      <p>
        A workflow may contain several loaders, samplers and text encoders, so Image Bench needs to be told which
        nodes to use. To do this, add a <b>marker</b> to the title of each of those nodes
        (double-click the title, or right-click › <b>Title</b>). The marker can be anywhere in the title, as in
        <code>Main model ib:cp</code>.
      </p>
      <table class="markers">
        <tr><th>Marker</th><th>Accepted nodes</th><th>Needed for</th><th>Without it</th></tr>
        <tr><td><code>ib:cp</code></td><td>Load Checkpoint (also the older and unCLIP loaders), Load Diffusion
          Model (UNETLoader), Unet Loader (GGUF), GGUF Loader KJ</td><td>Checkpoint list, model
          exploration</td><td>No checkpoint list; model exploration fails</td></tr>
        <tr><td><code>ib:pp</code> / <code>ib:np</code></td><td>Image Bench Prompt, String Literal,
          CLIPTextEncode (also the SDXL, Flux and SD3 variants), Text Encode Qwen Image 2.1</td><td>Prompt and LoRA
          list / negative prompt</td><td>The first / second CLIPTextEncode of the graph. Which one that is depends on
          the order in which the nodes were created, so mark them. Without either, the negative prompt is hidden.</td></tr>
        <tr><td><code>ib:smp</code></td><td>KSampler, KSampler (Advanced), SamplerCustom,
          SamplerCustomAdvanced</td><td>Seed, steps, CFG, sampler, size, ... (also found in the nodes connected to
          the sampler, see <a href="#" @click.prevent="scrollTo('comfy-params')">Generation
          parameters</a>)</td><td>The first KSampler of the graph</td></tr>
        <tr><td><code>ib:smp:1</code></td><td>The same, as the second-pass sampler</td><td>Hires. fix
          group</td><td>No Hires. fix group; Upscale is refused</td></tr>
        <tr><td><code>ib:hr</code></td><td>If/Else Switch, Soft Switch, Boolean primitive between the first-pass
          and the Hires. fix image (all marked nodes are set together)</td><td>Hires. fix checkbox; the Upscale
          action</td><td>No Hires. fix checkbox; the Hires. fix pass always runs</td></tr>
        <tr><td><code>ib:lora</code></td><td>Load LoRA, LoraLoaderModelOnly</td><td>LoRA exploration</td>
          <td>Exploring LoRAs is refused</td></tr>
        <tr><td><code>ib:img</code> / <code>ib:mask</code></td><td>Load Image / Load Image (as Mask) or Load
          Image</td><td>img2img, inpaint, images from the editor</td><td>txt2img mode; images from the editor are
          saved, and a message says that no node is marked</td></tr>
        <tr><td><code>ib:ref:0</code>, <code>ib:ref:1</code>, ...</td><td>Load Image of edit-model
          references</td><td>References panel</td><td>No References panel</td></tr>
        <tr><td><code>ib:cn:0</code>, <code>ib:cn:1</code>, ...</td><td>Apply ControlNet (also the SD3 and old
          ones), the Advanced-ControlNet apply nodes</td><td>ControlNet tab</td><td>The ControlNet tab says that no
          node is marked</td></tr>
      </table>
      <p>Further notes:</p>
      <ul>
        <li>The <b>Image Bench Prompt</b> node (category <b>Image Bench</b>) applies the
          <code>&lt;lora:name:weight&gt;</code> tags in its text to the model and CLIP, and passes on the text
          without them. Place it between the checkpoint loader and the text encoder and title it
          <code>ib:pp</code>; the LoRA list then works as it does in WebUI (see
          <a href="#" @click.prevent="scrollTo('comfy-prompt')">Image Bench Prompt node</a>).</li>
        <li><b>Example workflows</b> with all nodes already marked are listed under <b>Image Bench</b> in the ComfyUI
          template browser. They are also copied into the <b>Image Bench</b> folder of your saved workflows (only the
          missing ones, so your saved edits are kept).</li>
        <li><b>Workflow dropdown</b> (at the right of the Generate toolbar): the saved workflows of the ComfyUI
          Workflows sidebar as a folder tree with a filter (Enter takes the first match). Choosing a workflow opens
          it as the sidebar does: if it is already open, it switches to its tab (keeping its changes); otherwise it
          opens it. The dropdown follows the active ComfyUI tab, and • marks
          unsaved changes. <AppIcon name="save" :size="13" class="inline-icon"/> after it saves the active workflow
          (like <span class="kbd">Ctrl</span>+<span class="kbd">S</span> in ComfyUI). For a workflow that has not
          been saved yet, it asks for a name, with folders separated by /.</li>
        <li>Two node packs are optional: <b>comfyui_controlnet_aux</b> for ControlNet preprocessors, and
          <b>ComfyUI-Advanced-ControlNet</b> for ControlNet masks.</li>
        <li>A marker can also go on a subgraph node; promote the widgets that Image Bench should change (see
          <a href="#" @click.prevent="scrollTo('comfy-subgraphs')">Subgraphs</a>).</li>
        <li>To support custom loader or sampler nodes, add them to <code>store/node_config.json</code>
          in the extension folder and reload the page. This file is merged over the shipped
          <code>node_config.json</code>, which updates replace, so it needs only the additions.
          <code>NODE_CONFIG.md</code> in the extension folder describes the format.</li>
        <li>The workflow needs an output node (Save Image or Preview Image); without one, no images reach Image
          Bench.</li>
      </ul>

      <h3 id="manual-comfy-markers">Markers in detail</h3>
      <ul>
        <li>The marker is case-insensitive and can be anywhere in the title, but it must be a separate word:
          <code>Main model ib:cp</code> and <code>IB:CP - base</code> work, <code>xib:cp</code> does not.</li>
        <li>One title can hold several markers, e.g. <code>Text to Image ib:pp ib:smp ib:cp</code>.</li>
        <li>The index after the marker is 0 when omitted (<code>ib:smp</code> is <code>ib:smp:0</code>). It
          matters for <code>ib:smp</code> (0 is the main sampler, 1 the Hires. fix sampler), <code>ib:ref</code> and
          <code>ib:cn</code>. For the other markers, the first marked node of the graph is used, so mark only one
          node for each.</li>
        <li>Mark the node that holds the prompt text: if the text of an encoder comes from a String Literal node,
          mark the String Literal. A node holding both prompts (Text Encode Qwen Image 2.1) can carry both
          <code>ib:pp</code> and <code>ib:np</code>. Otherwise <code>ib:np</code> skips the node of
          <code>ib:pp</code>, and <code>ib:mask</code> skips the node of <code>ib:img</code>.</li>
      </ul>
      <p>
        During LoRA exploration, the <code>ib:lora</code> loader receives each explored LoRA with its weight as both
        strengths; for the LoRA-free images the strengths are set to 0. A bypassed or muted loader is enabled for the
        run, and its LoRA, strengths and mode are restored afterwards.
      </p>

      <h3 id="manual-comfy-prompt">Image Bench Prompt node</h3>
      <p>
        Wire it as <b>Load Checkpoint</b> → <code>model</code> / <code>clip</code> → <b>Image Bench Prompt</b>
        (titled <code>ib:pp</code>) → <code>model</code> to the sampler, <code>clip</code> and <code>text</code> to
        a CLIPTextEncode whose <code>text</code> is converted to an input. Take the <code>clip</code> of the
        negative prompt encoder from the prompt node as well, so that both encoders use the same CLIP. Leave the
        <code>clip</code> input unconnected for model-only LoRAs.
      </p>
      <ul>
        <li><code>&lt;lora:name&gt;</code> uses weight 1, <code>&lt;lora:name:0.8&gt;</code> uses 0.8 for both the
          model and the text encoder, and <code>&lt;lora:name:0.5:1&gt;</code> uses 0.5 for the text encoder and 1
          for the model.</li>
        <li><code>name</code> is the path in the <code>loras</code> folder, with or without the extension, or just
          the file name: <code>styles/ink.safetensors</code>, <code>styles/ink</code> and <code>ink</code> all
          match.</li>
        <li>Unknown names are reported in the ComfyUI console ("LoRA ... is not found") and skipped. LoRAs with
          both weights at 0 are not loaded.</li>
      </ul>

      <h3 id="manual-comfy-params">Generation parameters</h3>
      <p>
        The sampling fields of the Generate tab are found starting from the sampler marked <code>ib:smp</code>, so
        both sampler styles work without further markers. Links are followed through Reroutes and out of subgraphs.
        A field whose node is not found is hidden.
      </p>
      <table>
        <tr><th>Field</th><th>KSampler</th><th>SamplerCustomAdvanced</th></tr>
        <tr><td>Seed</td><td><code>seed</code></td><td>RandomNoise</td></tr>
        <tr><td>Steps, schedule type, denoising</td><td>The sampler</td><td>BasicScheduler (or
          Flux2Scheduler)</td></tr>
        <tr><td>CFG scale</td><td><code>cfg</code></td><td>CFGGuider</td></tr>
        <tr><td>Sampling method</td><td><code>sampler_name</code></td><td>KSamplerSelect</td></tr>
        <tr><td>Distilled CFG</td><td colspan="2">FluxGuidance on the positive conditioning or in front of the
          guider</td></tr>
        <tr><td>Shift</td><td colspan="2">ModelSamplingSD3 / ModelSamplingAuraFlow along the model (when there is
          no FluxGuidance)</td></tr>
        <tr><td>Width × height</td><td colspan="2">The empty latent, or the integer primitives feeding it</td></tr>
      </table>
      <ul>
        <li><b>Hires. fix</b> (<code>ib:smp:1</code>) edits the steps and denoising of the second sampler (or of
          its scheduler and Split Sigmas Denoise), the <i>Upscale by</i> value of the Upscale Latent By / Upscale
          Image By node in front of it, and the upscaler: the Load Upscale Model node, or else the method of the
          scale node. For the checkbox, put an <b>If/Else Switch</b> titled <code>ib:hr</code> before the save node,
          with the first-pass image on <code>on_false</code> and the Hires. fix image on <code>on_true</code>. Its
          inputs are lazy, so the Hires. fix nodes do not run while it is off.</li>
        <li><b>Lists</b>: the checkpoint, sampler, scheduler and upscaler lists are the choices of the workflow's
          widgets, so a UNETLoader lists the diffusion models and a GGUF loader the <code>.gguf</code> files.
          <b>Model exploration lists only the <code>checkpoints</code> folder</b>, so with a UNETLoader or GGUF
          loader marked <code>ib:cp</code> it has no usable models; switch those models in the Generate tab
          instead.</li>
        <li><b>Seed −1</b> sets the seed widget's <i>control after generate</i> to <i>randomize</i>; any other
          seed sets it to <i>fixed</i>. A batch sets −1.</li>
      </ul>

      <h3 id="manual-comfy-images">Input images and inpainting</h3>
      <p>
        Image Bench only selects the file in the marked loader; what the workflow does with the image and the
        mask is up to the workflow (Set Latent Noise Mask, VAE Encode (for Inpainting), InpaintModelConditioning,
        ...). Mask files hold the mask in their color channels and its inverse in alpha, so both Load Image (as
        Mask) with any channel and the <code>MASK</code> output of Load Image can read it.
      </p>
      <table>
        <tr><th><code>ib:img</code></th><th><code>ib:mask</code></th><th></th></tr>
        <tr><td>Load Image</td><td>Load Image (as Mask)</td><td>The usual setup.</td></tr>
        <tr><td>Load Image</td><td>Another Load Image</td><td>Use the <code>MASK</code> output of the mask
          node.</td></tr>
        <tr><td>Load Image</td><td>—</td><td>img2img; a mask sent from the editor is reported.</td></tr>
        <tr><td>—</td><td>Either</td><td>Mask only; the image comes from elsewhere in the workflow (the Generate
          tab stays in txt2img mode).</td></tr>
      </table>
      <ul>
        <li>The mask never goes to the <code>ib:img</code> node, so a single Load Image marked
          <code>ib:img ib:mask</code> receives only the image.</li>
        <li>A bypassed or muted marked node receives the file but stays bypassed.</li>
        <li>Other loaders that select a file of the <code>input</code> folder by name can be added to
          <code>store/node_config.json</code>.</li>
      </ul>

      <h3 id="manual-comfy-references">References</h3>
      <p>
        Title the Load Image nodes of the reference images <code>ib:ref:0</code>, <code>ib:ref:1</code>, ... in
        the order the prompt refers to them (Image 1, Image 2, ...). An added image goes into the first unused
        slot, or replaces the last one when all slots are used. Removing an image bypasses its Load Image together
        with the nodes that cannot run without it (a VAE Encode, for example), up to a node that passes its other
        input through (Reference Latent) or takes the image as an optional input. On a new workflow, check the
        bypassed nodes once. Slots inside a subgraph cannot be bypassed and are always in use.
      </p>

      <h3 id="manual-comfy-controlnet">ControlNet units</h3>
      <p>
        Starting from the apply node titled <code>ib:cn:N</code>, the unit's other nodes are found through its
        inputs: the ControlNet loader on <code>control_net</code> (the Model), the Load Image on <code>image</code>,
        directly or through an AIO Aux Preprocessor (the control image), and, for the Advanced-ControlNet apply
        nodes, the mask loader on <code>mask_optional</code>. Weight and the starting and ending steps are the apply
        node's <code>strength</code>, <code>start_percent</code> and <code>end_percent</code>; <b>Enable</b> and
        <b>Use Mask</b> bypass the apply node and the mask loader.
      </p>
      <ul>
        <li>With an AIO Aux Preprocessor in the unit, the <b>Preprocessor</b> field is its widget, and the workflow
          preprocesses the image at each generation. Without one, the field only selects the preprocessor for
          <b>Run preprocessor</b>, and the control image is used unchanged.</li>
        <li><b>Run preprocessor</b> runs a small prompt of its own at the front of the queue (your workflow does
          not run). Its images do not appear in the Generated tab.</li>
        <li>Without <b>Pixel Perfect</b> the preprocessor resolution is 512. ComfyUI has no control types, so all
          preprocessors and models are listed.</li>
      </ul>

      <h3 id="manual-comfy-subgraphs">Subgraphs</h3>
      <p>
        A marker on a <b>subgraph node</b> works through the widgets promoted to it: for each marker, Image Bench
        looks for a promoted widget of an accepted inner node (e.g. the <code>text</code> of a CLIPTextEncode) and
        writes to it. Nested subgraphs are followed; markers on nodes <i>inside</i> a subgraph are not searched.
      </p>
      <ul>
        <li>Promote every widget that Image Bench should change. A widget that is not promoted (e.g. <i>control after
          generate</i>) is written on the inner node, which changes the subgraph for all its instances.</li>
        <li>Nodes linked to the marked node (the RandomNoise of a sampler, the loader of a ControlNet) are found
          inside the subgraph, and links from its inputs are followed out to the parent graph.</li>
        <li>On a subgraph node marked both <code>ib:pp</code> and <code>ib:np</code>, the first promoted text
          widget is the positive prompt. On one marked <code>ib:img ib:mask</code>, the image goes to the first
          promoted Load Image and the mask to the next promoted loader.</li>
        <li>Reference slots and ControlNet units inside a subgraph cannot be bypassed.</li>
      </ul>

      <h3 id="manual-comfy-files">Files written</h3>
      <p>
        Images for the marked nodes are saved in the ComfyUI <code>input</code> folder under fixed names, and each
        is overwritten by the next image of the same kind: <code>image_bench_input_*.png</code> (Input and Mask
        panes), <code>image_bench_reference_N.png</code> (references), <code>image_bench_cn_N_*.png</code>
        (ControlNet units) and <code>image_bench_photoshop_*.png</code> (the editor). The trays, presets, model
        hashes and Civitai lookups are kept in <code>store/</code> of the extension folder.
      </p>
    </section>

    <section id="manual-shortcuts">
      <h2>Keyboard and mouse</h2>
      <p>The window has these shortcuts:</p>
      <table>
        <tr><td><span class="kbd">Ctrl</span>+<span class="kbd">↑</span> / <span class="kbd">↓</span></td><td>Raise or lower the attention in a prompt</td></tr>
        <tr><td><span class="kbd">←</span> <span class="kbd">→</span></td><td>Previous or next image in the image view</td></tr>
        <tr><td><span class="kbd">Esc</span></td><td>Close the image view, or the topmost dialog</td></tr>
        <tr><td><span class="kbd">Ctrl</span>+<span class="kbd">U</span></td><td>Unselect all images</td></tr>
        <tr><td><span class="kbd">Ctrl</span>+<span class="kbd">S</span></td><td>Save the workspace into the
          current project</td></tr>
        <tr><td><span class="kbd">Ctrl</span>+click</td><td>Switch between full size and fit to screen in the image view</td></tr>
        <tr><td>Middle click</td><td>On an image, open it in a new tab. On a button, perform its alternative action
          (place as a new layer in the editor). On a marking, remove it</td></tr>
        <tr><td><span class="kbd">Shift</span>+click</td><td>On a button of an image, perform its alternative
          action</td></tr>
        <tr><td>Right click</td><td>Open the menu of an image</td></tr>
        <tr><td>Letter keys</td><td>Actions of the image under the pointer or in the image view (see <a href="#"
          @click.prevent="scrollTo('images')">Working with images</a>)</td></tr>
        <tr><td><span class="kbd">1</span>–<span class="kbd">9</span>, <span class="kbd">0</span></td><td>Set or
          remove the marking in the image view of a tray, or of the Compare image under the pointer</td></tr>
        <tr><td><span class="kbd">R</span>, <span class="kbd">X</span></td><td>Compare tab: select a region, show
          the crops</td></tr>
      </table>
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

h4 {
  margin: 12px 0 6px;
  font-size: 13px;
  font-weight: 600;
}

p, ul, ol, dl, table {
  margin: 0 0 10px;
}

/* The global reset sets font-weight: normal on every element */
b {
  font-weight: 600;
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

pre {
  margin: 6px 0;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--ib-elev);
  font-family: var(--ib-mono);
  font-size: 12px;
  white-space: pre;
  overflow-x: auto;
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

.note.warn {
  border-color: color-mix(in srgb, var(--ib-warn) 40%, transparent);
  background: color-mix(in srgb, var(--ib-warn) 10%, transparent);
}

.note.warn > .app-icon {
  color: var(--ib-warn);
}

.snippet-badge {
  display: inline-block;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
  vertical-align: 1px;
}

.snippet-badge.negative {
  border: 1px solid rgba(255, 122, 125, 0.4);
  color: var(--ib-danger-text);
}

.snippet-badge.wrap {
  border: 1px solid var(--ib-border-2);
  color: var(--ib-muted);
  font-family: var(--ib-mono);
}

.note p:last-child {
  margin-bottom: 0;
}

.note .inline-icon {
  margin-top: 0;
  color: inherit;
}
</style>
