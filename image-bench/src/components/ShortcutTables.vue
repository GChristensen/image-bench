<script setup>
/**
 * The mouse grammar and the keys, rendered from their registries (gestures.js, shortcuts.js, the image actions of
 * imageActions.js), so they cannot part from the code. Shown by the cheat sheet (dialog.shortcuts(), the ? key) and
 * by the manual. Holding Shift highlights the alternatives of the image actions.
 */
import {computed, onMounted, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {CLAUSES, EXCEPTIONS, GESTURES} from "@/gestures.js";
import {KEY_SCOPES, KEYS} from "@/shortcuts.js";
import {ACTION_GROUP_COLORS, IMAGE_ACTIONS} from "@/imageActions.js";
import {useShiftKey} from "@/composables/useShiftKey.js";

const props = defineProps({
  // Section scrolled into view when shown: "mouse", "image" or a key scope
  section: {
    type: String,
    default: null
  }
});

const rootElement = ref(null);
const shiftDown = useShiftKey();

const clauses = CLAUSES.map(clause => ({...clause, rows: GESTURES.filter(row => row.clause === clause.id)}));
const actions = computed(() => IMAGE_ACTIONS.filter(action => action.available !== false));
const keyScopes = KEY_SCOPES.map(scope => ({...scope, keys: KEYS.filter(entry => entry.scope === scope.id)}));

onMounted(() => {
  if (props.section)
    rootElement.value?.querySelector(`[data-section="${props.section}"]`)?.scrollIntoView({block: "start"});
});
</script>

<template>
  <div ref="rootElement" class="shortcut-tables">
    <section data-section="mouse">
      <h4>Mouse</h4>
      <div class="clauses">
        <div v-for="clause in clauses" :key="clause.id" class="clause">
          <div class="clause-title">{{ clause.title }}</div>
          <div class="clause-rule">{{ clause.rule }}</div>
          <dl>
            <template v-for="row in clause.rows" :key="row.target">
              <dt>{{ row.target }}</dt>
              <dd>{{ row.does }}</dd>
            </template>
          </dl>
        </div>
      </div>
      <p class="exceptions">
        <template v-for="(row, index) in EXCEPTIONS" :key="row.target">
          <template v-if="index"> · </template><b>{{ row.target }}</b>: {{ row.does }}
        </template>
      </p>
    </section>

    <section data-section="image">
      <h4>Image actions <span class="muted">· over a card or in the image view; hold Shift for the alternatives</span></h4>
      <table class="actions" :class="{alt: shiftDown}">
        <tbody>
          <tr v-for="action in actions" :key="action.id">
            <td class="icon" :style="{color: ACTION_GROUP_COLORS[action.group]}"><AppIcon :name="action.icon" :size="14"/></td>
            <td class="key"><span class="kbd">{{ action.key }}</span></td>
            <td class="label">{{ action.label }}</td>
            <td class="alt-label">
              <template v-if="action.alt"><span class="kbd">Shift+{{ action.key }}</span> {{ action.alt.label }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-for="scope in keyScopes" :key="scope.id" :data-section="scope.id">
      <h4>{{ scope.title }}</h4>
      <table class="keys">
        <tbody>
          <tr v-for="entry in scope.keys" :key="entry.id">
            <td class="key"><span class="kbd">{{ entry.keys }}</span></td>
            <td>{{ entry.label }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.shortcut-tables {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 12.5px;
}

h4 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.muted {
  color: var(--ib-text-2);
  font-weight: 400;
}

.clauses {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.clause {
  padding: 8px 10px;
  border: 1px solid var(--ib-border-2);
  border-radius: 6px;
}

.clause-title {
  font-weight: 600;
}

.clause-rule {
  margin: 2px 0 6px;
  color: var(--ib-accent, var(--ib-text));
}

dl {
  margin: 0;
}

dt {
  margin-top: 4px;
  color: var(--ib-text-2);
}

dd {
  margin: 0;
}

.exceptions {
  margin: 8px 0 0;
  color: var(--ib-text-2);
}

table {
  border-collapse: collapse;
  width: 100%;
}

td {
  padding: 2px 6px 2px 0;
  vertical-align: middle;
}

td.icon {
  width: 18px;
}

td.key {
  width: 1%;
  white-space: nowrap;
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

.actions .alt-label {
  color: var(--ib-text-2);
}

.actions.alt .label {
  opacity: 0.45;
}

.actions.alt .alt-label {
  color: var(--ib-text);
}
</style>
