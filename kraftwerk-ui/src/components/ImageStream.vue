<script setup>
  import SelectableImage from "@/components/SelectableImage.vue";
  import {computed, ref} from "vue";
  import {createImageData} from "@/utils.js";

  const emit = defineEmits(["imageClick"]);

  const images = ref([]);
  const selected = ref(new Set());

  const imageStream = ref();

  const isAllSelected = computed(
      () => images.value.length && (images.value.length === selected.value.size));

  function addImage(eventData) {
    const is = imageStream.value;
    const scrolledToBottom = (is.clientHeight === is.scrollHeight) || (is.scrollHeight - is.scrollTop === is.clientHeight);
    const imageData = createImageData(eventData);

    images.value.push(imageData);

    if (scrolledToBottom)
      setTimeout(() => is.scrollTop = is.scrollHeight, 500);
  }

  function getImageLink(index) {
    return images.value[index].imageLink;
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

  function onImageClick(index) {
    emit("imageClick", index);
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

    images.value = remainingItems;
    selected.value = new Set(selectedItems);
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

  defineExpose({addImage, getImageLink, selectImage, selectAll, clearUnselected, isAllSelected,
               getSelectedImages});
</script>

<template>
  <div class="image-stream-container">
    <div class="image-stream" ref="imageStream">
      <SelectableImage v-for="(item, index) in images"
                       :image-link="item.imageLink"
                       :parameters="item.parameters"
                       :selectable="true"
                       :selected="selected.has(index)"
                       @image-click="() => onImageClick(index)"
                       @select="isSelected => onItemSelected(isSelected, index)"
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
    gap: 0.5%
  }
</style>