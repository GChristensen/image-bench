<script setup>
  import GeneratedImage from "@/components/GeneratedImage.vue";
  import {computed, nextTick, ref, shallowRef, toRaw} from "vue";
  import ScrollTopButton from "@/components/ScrollTopButton.vue";
  import EmptyState from "@/components/EmptyState.vue";
  import {KIND_GENERATED, KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_UPSCALED} from "@/consts.js";
  import {reorderImages} from "@/imageDrag.js";
  import {useImageSelection} from "@/composables/useImageSelection.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {dialog} from "@/dialogs/useDialog.js";
  import {findImageAction} from "@/imageActions.js";
  import {imageCount, removeWithUndo} from "@/undo.js";
  import {HOST_NAME} from "@/host.js";

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

  // Batch separators are entries of the Generated store too
  const isEmpty = computed(() => !images.value.some(image => !image.separator));

  const keyOf = id => findImageAction(id)?.key;

  // How images get into an empty view
  const EMPTY_STATES = {
    [KIND_GENERATED]: {icon: "images", title: "No generated images yet", chapter: "generated", ways: [
      {text: "Generate in the Generate tab", key: "Ctrl+Enter"},
      {text: `Images ${HOST_NAME} generates while Image Bench is open arrive here too`}
    ]},
    [KIND_IMAGE_TRAY]: {icon: "palette", title: "The image tray is empty", chapter: "trays", ways: [
      {text: "Drag image cards onto the Image tray tab"},
      {text: "Hover a card and press", key: keyOf("imageTray")},
      {text: "Use the tray sector of a card's action rim"},
      {text: "Import images or a tray archive (.png, .zip) with the upload button"}
    ]},
    [KIND_CONCEPT_TRAY]: {icon: "concept", title: "The concept tray is empty", chapter: "trays", ways: [
      {text: "Drag image cards onto the Concept tray tab"},
      {text: "Hover a card and press", key: keyOf("conceptTray")},
      {text: "Use the tray sector of a card's action rim"},
      {text: "Import images or a tray archive (.png, .zip) with the upload button"}
    ]},
    [KIND_UPSCALED]: {icon: "upscale", title: "No upscaled images yet", chapter: "upscaled", ways: [
      {text: "Hover a Generated or tray card and press", key: keyOf("upscale")},
      {text: "Check images in the Generated tab or a tray and press Upscale"}
    ]}
  };

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

  function getImageLink(index) {
    return imageOps.getImageLink(images.value[index]);
  }

  // The checked images of the whole view, including those hidden by the marking filter
  const selectedCount = computed(() => images.value.filter(i => i.selected).length);

  // Removals are undone from their notice; trays and the upscaled images are saved on the server
  const removedText = count => `Removed ${imageCount(count)}. The files stay on disk.`;

  function clear() {
    removeWithUndo(props.imageStore, () => true, removedText);
  }

  function removeSelected() {
    removeWithUndo(props.imageStore, image => image.selected, removedText);
  }

  function removeWhere(predicate) {
    removeWithUndo(props.imageStore, predicate, removedText);
  }

  // Returns whether the image was removed
  function onDeleteImage(image) {
    return removeWithUndo(props.imageStore, i => !i.separator && i.imagePath === image.imagePath, removedText) > 0;
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

  function getFirstImage() {
    return filteredImages.value.find(i => !i.separator);
  }

  function getLastImage() {
    return filteredImages.value.findLast(i => !i.separator);
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

  defineExpose({beforeAddImage, afterAddImage, getImageLink, selectImage, selectAll, unselectAll, clear, removeSelected, removeWhere,
    isAllSelected, isSomeSelected, selectedCount, getSelectedImages, getNextImage, getPrevImage, getFirstImage, getLastImage, revealImage, deleteImage: onDeleteImage, addComment: onAddComment});
</script>

<template>
  <div class="image-stream-container">
    <ScrollTopButton v-if="kind === KIND_GENERATED" :target="imageStreamElement"
                     :content="filteredImages.length"/>
    <div class="image-stream scrollable" ref="imageStreamElement">
      <EmptyState v-if="isEmpty && EMPTY_STATES[kind]" v-bind="EMPTY_STATES[kind]"/>
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
</style>
