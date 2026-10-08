<script setup>
  import GeneratedImage from "@/components/GeneratedImage.vue";
  import {computed, nextTick, ref, shallowRef, toRaw, watch} from "vue";
  import {KIND_GENERATED, KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY} from "@/consts.js";
  import {useImageSelection} from "@/composables/useImageSelection.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {usePromptModal} from "@/composables/usePromptModal.js";
  import PromptModal from "@/components/PromptModal.vue";

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
    }
  });

  const emit = defineEmits(['imageClick', 'imageOpen', 'showParams', 'upscaleImage', 'markingFilter']);

  const isTray = ref(props.kind === KIND_IMAGE_TRAY || props.kind === KIND_CONCEPT_TRAY);
  const images = computed(() => props.imageStore.images);
  const markingFilter = ref();

  const imageStreamElement = ref();

  // Filter function for determining which images to show
  function shouldShowImage(image) {
    let result = true;

    if (props.showMarked && !image.marking || markingFilter.value
          && markingFilter.value !== image.marking)
      result = false;

    return result;
  }

  // Filtered images based on current filter state
  const filteredImages = computed(() => {
    return images.value.filter(image => shouldShowImage(image));
  });

  // Composables
  const imageOps = useImageOperations();
  const promptModal = usePromptModal();
  const {
    isAllSelected,
    isSomeSelected,
    isNoneSelected,
    selectImage,
    selectAll,
    getSelectedImages
  } = useImageSelection(filteredImages);

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

  function clear(e) {
    if (!confirm("Do you really want to continue?"))
      return;

    if (isNoneSelected.value) {
      props.imageStore.images.length = 0;
    }
    else {
      props.imageStore.images = props.imageStore.images.filter(i => !i.selected);
    }

    if (isTray.value) {
      props.imageStore.persist();
    }
  }

  // Returns true if the image was deleted
  function onDeleteImage(image) {
    if (!confirm("Do you really want to continue?"))
      return false;

    const removedImage = images.value.find(i => i.imagePath === image.imagePath);

    if (removedImage) {
      const removedImageIndex = images.value.indexOf(removedImage);
      images.value.splice(removedImageIndex, 1);

      if (isTray.value) {
        props.imageStore.persist();
      }
    }

    return !!removedImage;
  }


  // Tray persist replaces all image objects with the ones returned by the server,
  // so images held elsewhere (e.g. by the overlay) are located by path, not by identity
  function isSameImage(a, b) {
    return a === b || !!a && !!b && !a.separator && a.imagePath === b.imagePath;
  }

  function findImageIndex(imageView, image) {
    return imageView.findIndex(i => isSameImage(i, image));
  }

  function getNextImage(image) {
    const imageView = props.showMarked? images.value.filter(i => i.marking): images.value;

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
    const imageView = props.showMarked? images.value.filter(i => i.marking): images.value;

    let index = findImageIndex(imageView, image);

    while (index > 0) {
      const result = imageView[--index];

      if (!result.separator)
        return result;
    }
  }

  async function onAddComment(image) {
    let comment = await promptModal.showPrompt(
      "Comment:",
      image.comment || "",
      "imageComment"
    );

    if (comment) {
      image.comment = comment;

      if (isTray)
        props.imageStore.persist();
    }
  }

  function onSetMarking(image) {
    if (isTray)
      props.imageStore.persist();
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

  function onFilterMarking(marking) {
    props.showMarked = true;
    markingFilter.value = marking;
    emit("markingFilter");
  }

  watch(() => props.showMarked, async (newVal, oldVal) => {
    if (!newVal)
      markingFilter.value = null;
  })

  // onBeforeMount(() => {
  // })

  defineExpose({beforeAddImage, afterAddImage, getImageLink, selectImage, selectAll, clear, isAllSelected,
    isSomeSelected, getSelectedImages, getNextImage, getPrevImage, revealImage, deleteImage: onDeleteImage});
</script>

<template>
  <PromptModal
    :show="promptModal.showModal.value"
    :message="promptModal.modalMessage.value"
    :default-value="promptModal.modalDefaultValue.value"
    :storage-key="promptModal.modalStorageKey.value"
    @confirm="promptModal.onConfirm"
    @cancel="promptModal.onCancel"
  />
  <div class="image-stream-container">
    <div class="image-stream scrollable" ref="imageStreamElement">
      <GeneratedImage v-for="(image, index) in images"
                       :key="image.imagePath || index"
                       :kind="kind"
                       :displayed="shouldShowImage(image)"
                       :image="image"
                       :selectable="isTray"
                       :upscalable="isTray || kind === KIND_GENERATED"
                       :selected="image.selected"
                       :highlighted="isHighlighted(image)"
                       :is-tray="isTray"
                       @image-click="$emit('imageClick', image)"
                       @image-open="$emit('imageOpen', image)"
                       @show-params="$emit('showParams', image)"
                       @select="s => image.selected = s"
                       @upscale-image="(i, p) => $emit('upscaleImage', i, p)"
                       @add-comment="onAddComment(image)"
                       @set-marking="onSetMarking(image)"
                       @filter-marking="onFilterMarking"
                       @delete-image="onDeleteImage"
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
