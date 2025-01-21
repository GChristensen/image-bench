<script setup>
  import GeneratedImage from "@/components/GeneratedImage.vue";
  import {computed, getCurrentInstance, ref, watch} from "vue";
  import {createImageGenerationParams, createImageLink} from "@/sdwebui.js";
  import {KIND_GENERATED, KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY} from "@/consts.js";

  const props = defineProps(["kind", "imageStore", "showMarked"]);
  const emit = defineEmits(["imageClick", "imageOpen", "showParams", "upscaleImage", "markingFilter"]);

  const isTray = ref(props.kind === KIND_IMAGE_TRAY || props.kind === KIND_CONCEPT_TRAY);
  const images = computed(() => props.imageStore.images);
  const markingFilter = ref();

  const imageStreamElement = ref();

  const isAllSelected = computed(
      () => images.value.length && (images.value.every(i => i.selected)));

  const isSomeSelected = computed(
      () => images.value.length && (images.value.some(i => i.selected)));

  const isNoneSelected = computed(
      () => images.value.length && (!images.value.some(i => i.selected)));

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
    return createImageLink(images.value[index]);
  }

  function selectImage(image) {
    const index = images.value.indexOf(image);
    images.value[index].selected = true;
  }

  function selectAll(selectAll=true) {
    if (isAllSelected.value || !selectAll) {
      for (const image of images.value)
        image.selected = false;
    }
    else {
      for (const image of images.value)
        image.selected = true;
    }
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

  function onDeleteImage(image) {
    if (!confirm("Do you really want to continue?"))
      return;

    const removedImage = images.value.find(i => i.imagePath === image.imagePath);

    if (removedImage) {
      const removedImageIndex = images.value.indexOf(removedImage);
      images.value.splice(removedImageIndex, 1);

      if (isTray.value) {
        props.imageStore.persist();
      }
    }
  }

  function getSelectedImages() {
    const selectedItems = [];

    for (let i = 0; i < images.value.length; ++i) {
      if (images.value[i].selected) {
        const proxyItem = images.value[i];
        const image = JSON.parse(JSON.stringify(proxyItem));
        selectedItems.push(image);
      }
    }

    return selectedItems;
  }

  function getNextImage(image) {
    const imageView = props.showMarked? images.value.filter(i => i.marking): images.value;

    let index = imageView.indexOf(image);

    while (index < imageView.length) {
      const result = imageView[++index];

      if (!result.separator)
        return result;
    }
  }

  function getPrevImage(image) {
    const imageView = props.showMarked? images.value.filter(i => i.marking): images.value;

    let index = imageView.indexOf(image);

    while (index > 0) {
      const result = imageView[--index];

      if (!result.separator)
        return result;
    }
  }

  function onAddComment(image) {
    let comment = prompt("Comment:");

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

  function shouldShowImage(image) {
    let result = true;

    if (props.showMarked && !image.marking || markingFilter.value && markingFilter.value !== image.marking)
      result = false;

    return result;
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
    isSomeSelected, getSelectedImages, getNextImage, getPrevImage});
</script>

<template>
  <div class="image-stream-container">
    <div class="image-stream scrollable" ref="imageStreamElement">
      <GeneratedImage v-for="(image, index) in images"
                       :kind="kind"
                       :displayed="shouldShowImage(image)"
                       :image="image"
                       :selectable="isTray"
                       :upscalable="isTray || kind === KIND_GENERATED"
                       :selected="image.selected"
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
    align-items: center;
    gap: 0.5%
  }
</style>