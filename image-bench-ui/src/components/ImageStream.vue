<script setup>
  import SelectableImage from "@/components/SelectableImage.vue";
  import {computed, onBeforeMount, ref} from "vue";
  import {createImageData, createImageGenerationParams, createImageLink} from "@/sdwebui.js";
  import {KIND_GENERATED, KIND_TRAY} from "@/consts.js";

  const props = defineProps(["kind", "imageStore", "showMarked"]);
  const emit = defineEmits(["imageClick", "imageOpen", "showParams", "upscaleImage"]);

  const isTray = ref(props.kind === KIND_TRAY);
  const images = computed(() => props.imageStore.images);
  const selected = ref(new Set());

  const imageStreamElement = ref();

  const isAllSelected = computed(
      () => images.value.length && (images.value.length === selected.value.size));

  let scrolledToBottom = true;

  function beforeAddImage() {
    const is = imageStreamElement.value;
    scrolledToBottom = (is.clientHeight === is.scrollHeight) || (is.scrollHeight - is.scrollTop === is.clientHeight);
  }

  function afterAddImage() {
    if (scrolledToBottom) {
      const is = imageStreamElement.value;
      setTimeout(() => is.scrollTop = is.scrollHeight, 500);
    }
  }

  function getImageLink(index) {
    return createImageLink(images.value[index].imagePath);
  }

  function getImageGenerationParams(index) {
    const image = images.value[index];
    return createImageGenerationParams(image);
  }

  function selectImage(index) {
    selected.value.add(index);
  }

  function onItemSelected(isSelected, index) {
    if (isSelected)
      selected.value.add(index)
    else {
      selected.value.delete(index);
    }
  }

  function selectAll() {
    if (isAllSelected.value) {
      selected.value.clear();
    }
    else {
      for (let i = 0; i < images.value.length; ++i)
        selected.value.add(i);
    }
  }

  function clearUnselected(e) {
    if (!confirm("Do you really want to continue?"))
      return;

    const remainingItems = [];
    const selectedItems = [];
    let selectedCtr = 0;

    for (let i = 0; i < images.value.length; ++i) {
      if (selected.value.has(i)) {
        remainingItems.push(images.value[i]);
        selectedItems.push(selectedCtr++);
      }
    }

    props.imageStore.images = remainingItems;

    if (isTray.value) {
      props.imageStore.persist();
    }

    selected.value = new Set(selectedItems);
  }

  function clear(e) {
    if (!confirm("Do you really want to continue?"))
      return;

    props.imageStore.images = [];
    selected.value = new Set();

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

      let selectedItems = Array.from(selected.value);
      selectedItems = selectedItems.filter(i => i !== removedImageIndex);

      for (let i = 0; i < selectedItems.length; ++i) {
        if (selectedItems[i] > removedImageIndex)
          selectedItems[i] -= 1;
      }

      selected.value = new Set(selectedItems);

      if (isTray.value) {
        props.imageStore.persist();
      }
    }
  }

  function getSelectedImages() {
    const selectedItems = [];

    for (let i = 0; i < images.value.length; ++i) {
      if (selected.value.has(i)) {
        const proxyItem = images.value[i];
        const image = JSON.parse(JSON.stringify(proxyItem));
        selectedItems.push(image);
      }
    }

    return selectedItems;
  }

  function getNextImage(index) {
    if (index < images.value.length)
      return images.value[index + 1];
  }

  function getPrevImage(index) {
    if (images.value.length > 0)
      return images.value[index - 1];
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

    if (props.showMarked && !image.marking)
      result = false;

    return result;
  }

  // onBeforeMount(() => {
  // })

  defineExpose({beforeAddImage, afterAddImage, getImageLink, selectImage, selectAll, clearUnselected, clear, isAllSelected,
               getSelectedImages, getImageGenerationParams, getNextImage, getPrevImage});
</script>

<template>
  <div class="image-stream-container">
    <div class="image-stream" ref="imageStreamElement">
      <SelectableImage v-for="(image, index) in images"
                       :displayed="shouldShowImage(image)"
                       :image="image"
                       :selectable="isTray"
                       :upscalable="isTray || kind === KIND_GENERATED"
                       :selected="selected.has(index)"
                       :is-tray="isTray"
                       @image-click="$emit('imageClick', index)"
                       @image-open="$emit('imageOpen', index)"
                       @show-params="$emit('showParams', index)"
                       @select="isSelected => onItemSelected(isSelected, index)"
                       @upscale-image="(i, p) => $emit('upscaleImage', i, p)"
                       @add-comment="onAddComment(image)"
                       @set-marking="onSetMarking(image)"
                       @delete-image="onDeleteImage"
      ></SelectableImage>
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