<script setup>
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {openImageMenu} from "@/contextMenu.js";
import {setHoveredImageTarget, clearHoveredImageTarget} from "@/composables/useImageActionKeys.js";
import {cropAspect, packGrid} from "@/components/compare/compareGeometry.js";
import CompareChrome from "@/components/compare/CompareChrome.vue";

/**
 * The region of each image of the Compare tab, packed into the grid with the largest cells that fit
 */
const props = defineProps({
  images: {
    type: Array,
    required: true
  },
  // Natural sizes {w, h} by image URL
  sizes: {
    type: Object,
    required: true
  },
  region: {
    type: Object,
    required: true
  },
  separatorColor: {
    type: String,
    required: true
  },
  separatorWidth: {
    type: Number,
    default: 2
  },
  ctx: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(["remove", "setMarking", "open"]);

const rootElement = ref(null);
const area = ref({width: 0, height: 0});
const hoveredIndex = ref(-1);

const aspect = computed(() => cropAspect(props.region, props.images.map(image => props.sizes[image.imageUrl])));
const grid = computed(() => packGrid(props.images.length, aspect.value, area.value.width, area.value.height,
  props.separatorWidth));
const fillers = computed(() => grid.value.cols * grid.value.rows - props.images.length);

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${grid.value.cols}, ${grid.value.cellWidth}px)`,
  gridAutoRows: `${grid.value.cellHeight}px`,
  gap: `${props.separatorWidth}px`,
  background: props.separatorColor
}));

// The crop fills the cell: the image is scaled up by the inverse of the region and shifted to it
const imageStyle = computed(() => {
  const {x, y, w, h} = props.region;
  return {width: `${100 / w}%`, height: `${100 / h}%`, left: `${-x / w * 100}%`, top: `${-y / h * 100}%`};
});

let observer = null;

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    area.value = {width: entry.contentRect.width, height: entry.contentRect.height};
  });
  observer.observe(rootElement.value);
});

onBeforeUnmount(() => observer?.disconnect());

function onCellEnter(e, image, index) {
  hoveredIndex.value = index;
  setHoveredImageTarget({
    getImage: () => image,
    ctx: props.ctx,
    element: e.currentTarget,
    setMarking: marking => emit("setMarking", image, marking)
  });
}

function onCellLeave(e) {
  hoveredIndex.value = -1;
  clearHoveredImageTarget(e.currentTarget);
}

// Middle click or Shift+click opens the image in the overlay
function onCellClick(e, index) {
  if (e.shiftKey && !e.target.closest(".compare-chrome"))
    emit("open", index);
}

function onCellAuxClick(e, index) {
  if (e.button === 1 && !e.target.closest(".compare-chrome"))
    emit("open", index);
}

defineExpose({grid});
</script>

<template>
  <div ref="rootElement" class="crop-area">
    <div class="crop-grid" :style="gridStyle">
      <div v-for="(image, index) in images" :key="image.imageUrl" class="crop-cell"
           @mouseenter="onCellEnter($event, image, index)" @mouseleave="onCellLeave"
           @click="onCellClick($event, index)" @mousedown.middle.prevent @auxclick="onCellAuxClick($event, index)"
           @contextmenu="openImageMenu($event, image, ctx)">
        <img :src="image.imageUrl" :style="imageStyle" draggable="false" alt="">
        <CompareChrome :image="image" :index="index" :ctx="ctx" :hovered="hoveredIndex === index"
                       @remove="emit('remove', image)" @set-marking="marking => emit('setMarking', image, marking)"
                       @open="emit('open', index)"/>
      </div>
      <div v-for="filler in fillers" :key="'filler' + filler" class="crop-filler"></div>
    </div>
  </div>
</template>

<style scoped>
.crop-area {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.crop-grid {
  display: grid;
}

.crop-cell {
  position: relative;
  overflow: hidden;
}

.crop-cell img {
  position: absolute;
  max-width: none;
  user-select: none;
}

.crop-filler {
  background: var(--ib-bg);
}
</style>
