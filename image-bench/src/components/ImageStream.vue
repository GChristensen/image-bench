<script setup>
  import GeneratedImage from "@/components/GeneratedImage.vue";
  import {computed, nextTick, ref, shallowRef, toRaw, watch} from "vue";
  import AppIcon from "@/components/AppIcon.vue";
  import {KIND_GENERATED, KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_UPSCALED} from "@/consts.js";
  import {reorderImages} from "@/imageDrag.js";
  import {useImageSelection} from "@/composables/useImageSelection.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {dialog} from "@/dialogs/useDialog.js";

  const props = defineProps({
    kind: {
      type: String,
      required: true,
      validator: (value) => ['generated', 'image-tray', 'concept-tray', 'upscaled', 'explore'].includes(value)
    },
    imageStore: {
      type: Object,
      required: true
    },
    showMarked: {
      type: Boolean,
      default: false
    },
    // Marking the images are filtered by, if any (with showMarked)
    markingFilter: {
      type: String,
      default: null
    }
  });

  const emit = defineEmits(['imageClick', 'imageOpen', 'showParams', 'upscaleImage', 'markingFilter']);

  const isTray = props.kind === KIND_IMAGE_TRAY || props.kind === KIND_CONCEPT_TRAY;
  // The saved views are ordered by dragging their cards
  const reorderable = isTray || props.kind === KIND_UPSCALED;
  const images = computed(() => props.imageStore.images);

  const imageStreamElement = ref();

  // Filter function for determining which images to show
  function shouldShowImage(image) {
    let result = true;

    if (props.showMarked && !image.marking || props.markingFilter
          && props.markingFilter !== image.marking)
      result = false;

    return result;
  }

  // Filtered images based on current filter state
  const filteredImages = computed(() => {
    return images.value.filter(image => shouldShowImage(image));
  });

  // Composables
  const imageOps = useImageOperations();
  const {
    isAllSelected,
    isSomeSelected,
    selectImage,
    selectAll,
    getSelectedImages
  } = useImageSelection(filteredImages);

  function unselectAll() {
    for (const image of images.value)
      image.selected = false;
  }

  let scrolledToBottom = true;

  function beforeAddImage() {
    const is = imageStreamElement.value;
    scrolledToBottom = (is.clientHeight === is.scrollHeight) || (is.scrollHeight - is.scrollTop === is.clientHeight);
  }

  function afterAddImage() {
    if (scrolledToBottom) {
      const is = imageStreamElement.value;
      setTimeout(() => is.scrollTop = is.scrollHeight, 333);
    }
  }

  // Generated: a button below the toolbar scrolls back to the top while the stream is scrolled to the bottom
  const BOTTOM_SLACK = 4;
  const atBottom = ref(false);

  function updateAtBottom() {
    const is = imageStreamElement.value;

    atBottom.value = !!is && is.scrollHeight > is.clientHeight
      && is.scrollTop + is.clientHeight >= is.scrollHeight - BOTTOM_SLACK;
  }

  function scrollToTop() {
    imageStreamElement.value.scrollTo({top: 0, behavior: "smooth"});
  }

  // Added, removed and filtered images change the height without a scroll event
  watch(() => filteredImages.value.length, () => nextTick(updateAtBottom));

  function getImageLink(index) {
    return imageOps.getImageLink(images.value[index]);
  }

  // The checked images of the whole view, including those hidden by the marking filter
  const selectedCount = computed(() => images.value.filter(i => i.selected).length);

  async function clear() {
    const count = images.value.filter(i => !i.separator).length;

    if (!images.value.length || !await dialog.confirm(`Remove all ${count} images from this view? The files stay on disk.`,
        {title: "Clear", okText: "Remove", danger: true}))
      return;

    props.imageStore.images.length = 0;

    // Trays and the upscaled images are saved on the server
    props.imageStore.persist?.();
  }

  async function removeSelected() {
    const count = selectedCount.value;

    if (!count || !await dialog.confirm(`Remove ${count} selected image${count === 1 ? "" : "s"} from this view? `
        + "The files stay on disk.", {title: "Remove selected", okText: "Remove", danger: true}))
      return;

    props.imageStore.images = props.imageStore.images.filter(i => !i.selected);
    props.imageStore.persist?.();
  }

  // Resolves to true if the image was deleted
  async function onDeleteImage(image) {
    const from = isTray ? "the tray" : "the list";

    if (!await dialog.confirm(`Remove this image from ${from}?`, {okText: "Remove", danger: true}))
      return false;

    const removedImage = images.value.find(i => i.imagePath === image.imagePath);

    if (removedImage) {
      const removedImageIndex = images.value.indexOf(removedImage);
      images.value.splice(removedImageIndex, 1);

      props.imageStore.persist?.();
    }

    return !!removedImage;
  }


  // Images held elsewhere (e.g. by the overlay) may be copies, so they are located by path, not by identity
  function isSameImage(a, b) {
    return a === b || !!a && !!b && !a.separator && a.imagePath === b.imagePath;
  }

  function findImageIndex(imageView, image) {
    return imageView.findIndex(i => isSameImage(i, image));
  }

  // The overlay navigates through the shown images only
  function getNextImage(image) {
    const imageView = filteredImages.value;

    let index = findImageIndex(imageView, image);

    if (index < 0)
      return;

    while (index < imageView.length - 1) {
      const result = imageView[++index];

      if (!result.separator)
        return result;
    }
  }

  function getPrevImage(image) {
    const imageView = filteredImages.value;

    let index = findImageIndex(imageView, image);

    while (index > 0) {
      const result = imageView[--index];

      if (!result.separator)
        return result;
    }
  }

  async function onAddComment(image) {
    let comment = await dialog.prompt("Comment:",
      {defaultValue: image.comment || "", storageKey: "imageComment"});

    if (comment) {
      image.comment = comment;

      props.imageStore.persist?.();
    }
  }

  function onSetMarking(image) {
    props.imageStore.persist?.();
  }

  // Highlights the image thumbnail and scrolls it into view
  const highlightedImage = shallowRef(null);

  async function revealImage(image) {
    // Reset first so that revealing the same image again re-triggers scrolling
    highlightedImage.value = null;
    await nextTick();
    highlightedImage.value = toRaw(image);
  }

  function isHighlighted(image) {
    return isSameImage(toRaw(image), highlightedImage.value);
  }

  // The view toggles the filter: the active marking clears it
  function onFilterMarking(marking) {
    emit("markingFilter", marking);
  }

  // onBeforeMount(() => {
  // })

  defineExpose({beforeAddImage, afterAddImage, getImageLink, selectImage, selectAll, unselectAll, clear, removeSelected,
    isAllSelected, isSomeSelected, selectedCount, getSelectedImages, getNextImage, getPrevImage, revealImage, deleteImage: onDeleteImage, addComment: onAddComment});
</script>

<template>
  <div class="image-stream-container">
    <button v-if="kind === KIND_GENERATED && atBottom" class="ib scroll-top" title="Scroll to the top"
            aria-label="Scroll to the top" @click="scrollToTop"><AppIcon name="toTop"/></button>
    <div class="image-stream scrollable" ref="imageStreamElement"
         @scroll.passive="updateAtBottom" @load.capture="updateAtBottom">
      <GeneratedImage v-for="(image, index) in images"
                       :key="image.imagePath || index"
                       :kind="kind"
                       :displayed="shouldShowImage(image)"
                       :image="image"
                       selectable
                       :upscalable="isTray || kind === KIND_GENERATED"
                       :selected="image.selected"
                       :highlighted="isHighlighted(image)"
                       :is-tray="isTray"
                       :marking-filter="markingFilter"
                       deletable
                       :reorderable="reorderable"
                       @reorder="after => reorderImages(kind, image, after)"
                       @image-click="$emit('imageClick', image)"
                       @image-open="$emit('imageOpen', image)"
                       @show-params="$emit('showParams', image)"
                       @select="s => image.selected = s"
                       @upscale-image="(i, p) => $emit('upscaleImage', i, p)"
                       @add-comment="onAddComment(image)"
                       @delete-image="onDeleteImage(image)"
                       @set-marking="onSetMarking(image)"
                       @filter-marking="onFilterMarking"
      ></GeneratedImage>
    </div>
  </div>
</template>

<style scoped>
  .image-stream-container {
    position: relative;
    flex-grow: 1;
  }

  .image-stream {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    overflow-x: auto;
    flex-wrap: wrap;
    display: flex;
    justify-content: center;
    align-content: flex-start;
    align-items: center;
    gap: 14px;
    padding: 16px 22px;
  }

  /* Floats below the toolbar, clear of the scrollbar */
  .scroll-top {
    position: absolute;
    top: 8px;
    right: 22px;
    z-index: 5;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: rgba(17, 19, 23, 0.85);
    border-color: rgba(255, 255, 255, 0.12);
    color: var(--ib-text);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }
</style>
