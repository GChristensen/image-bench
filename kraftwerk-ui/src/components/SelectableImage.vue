<script setup>
  const props = defineProps(["imageLink", "parameters", "selected"]);

  function onReuseSeedClick(e) {
    e.preventDefault();
    window.opener.postMessage({type: "SET_IMAGE_PARAMS", parameters: props.parameters});
  }
</script>

<template>
<div class="selectable-image">
  <img class="selectable-image-preview" :src="imageLink"
       @click="$emit('imageClick')">
  <div class="selectable-image-controls">
    <label><input class="selectable-emage-checkbox" type="checkbox"
                  @change="$emit('select', $event.target.checked)"
                  :checked="selected"> Select</label>
    &nbsp;
    <a href="#" class="reuse-seed-link" title="Reuse seed" @click="onReuseSeedClick">♻️</a>
  </div>
</div>
</template>

<style scoped>
.selectable-image {
  max-width: 30vw;
  max-height: 70vh;
  height: max-content;
  margin: 15px;
}

.selectable-image-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: pointer;
}

.selectable-image-controls {
  text-align: center;
}

.reuse-seed-link {
  text-decoration: none;
}
</style>