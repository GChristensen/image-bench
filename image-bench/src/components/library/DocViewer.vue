<script setup>
/**
 * Right pane of the Library docs: the selected Markdown document, rendered with marked and sanitized with DOMPurify.
 * Relative images are served from the docs root, relative links to other docs open them here, links to headings
 * scroll the pane, and other links open in a new window.
 */
import {computed, nextTick, ref, watch} from "vue";
import {marked} from "marked";
import DOMPurify from "dompurify";
import AppIcon from "@/components/AppIcon.vue";
import TagSearch from "@/components/library/TagSearch.vue";
import {docAssetUrl, useDocsStore} from "@/stores/docs.js";

const store = useDocsStore();
const body = ref(null);
// Heading to scroll to once the requested doc is shown
let pendingAnchor = null;

const isExternal = href => /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//");

/**
 * Path relative to the docs root of a link relative to a doc; null if it leaves the root
 * @param {string} docPath
 * @param {string} href
 * @returns {string|null}
 */
function resolvePath(docPath, href) {
  const parts = href.startsWith("/") ? [] : docPath.split("/").slice(0, -1);

  for (const part of decodeURIComponent(href).split("/")) {
    if (part === "..") {
      if (!parts.length)
        return null;

      parts.pop();
    } else if (part && part !== ".")
      parts.push(part);
  }

  return parts.join("/");
}

function slugify(text, used) {
  const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-") || "section";
  let slug = base;

  for (let i = 1; used.has(slug); i++)
    slug = `${base}-${i}`;

  used.add(slug);
  return slug;
}

const html = computed(() => {
  const doc = store.doc;

  if (doc?.kind !== "markdown")
    return "";

  const template = document.createElement("template");
  template.innerHTML = DOMPurify.sanitize(marked.parse(doc.text, {gfm: true}));
  const content = template.content;
  const used = new Set();

  content.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(heading =>
    heading.id = slugify(heading.textContent, used));

  content.querySelectorAll("img[src]").forEach(img => {
    const src = img.getAttribute("src");

    if (!isExternal(src)) {
      const path = resolvePath(doc.path, src.split(/[?#]/)[0]);

      if (path === null)
        img.removeAttribute("src");
      else
        img.setAttribute("src", docAssetUrl(path));
    }

    img.setAttribute("loading", "lazy");
  });

  content.querySelectorAll("a[href]").forEach(link => {
    const href = link.getAttribute("href");

    if (href.startsWith("#"))
      return;

    if (isExternal(href)) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      return;
    }

    const [file, anchor] = href.split("#");
    const path = /\.(md|markdown)$/i.test(file) ? resolvePath(doc.path, file) : null;

    if (path !== null) {
      link.dataset.doc = path;

      if (anchor)
        link.dataset.anchor = anchor;
    } else {
      // A relative link to another file: served if it is an image
      link.setAttribute("href", docAssetUrl(resolvePath(doc.path, file) ?? ""));
      link.setAttribute("target", "_blank");
    }
  });

  return template.innerHTML;
});

function scrollTo(anchor) {
  const target = anchor && body.value?.querySelector(`#${CSS.escape(decodeURIComponent(anchor).toLowerCase())}`);

  if (target)
    target.scrollIntoView({block: "start"});
}

function onClick(e) {
  const link = e.target.closest("a[href]");

  if (!link || e.button !== 0)
    return;

  const href = link.getAttribute("href");

  if (link.dataset.doc !== undefined) {
    e.preventDefault();

    if (link.dataset.doc === store.doc?.path)
      scrollTo(link.dataset.anchor);
    else {
      pendingAnchor = link.dataset.anchor ?? null;
      store.open(link.dataset.doc);
    }
  } else if (href.startsWith("#")) {
    e.preventDefault();
    scrollTo(href.slice(1));
  }
}

// A new doc starts at its top, or at the heading of the link it was opened by
watch(html, async () => {
  await nextTick();
  const scroller = body.value?.closest(".content");

  if (scroller)
    scroller.scrollTop = 0;

  scrollTo(pendingAnchor);
  pendingAnchor = null;
});
</script>

<template>
  <div class="doc-viewer" :class="{tags: store.doc?.kind === 'tags'}">
    <div v-if="store.selectedPath" class="header">
      <AppIcon :name="/\.csv$/i.test(store.selectedPath) ? 'tag' : 'book'" :size="15" class="header-icon"/>
      <span class="path" :title="store.selectedPath">{{ store.selectedPath }}</span>
      <button class="ib flat sm" title="Read the document again" aria-label="Reload" @click="store.open()"
        ><AppIcon name="refresh" :size="14"/></button>
    </div>
    <div v-if="store.docError" class="empty">{{ store.docError }}</div>
    <div v-else-if="!store.selectedPath" class="empty">Select a document in the tree.</div>
    <div v-else-if="store.loading && store.doc?.path !== store.selectedPath" class="empty">Loading…</div>
    <TagSearch v-else-if="store.doc?.kind === 'tags'" :list="store.doc"/>
    <article v-else ref="body" class="markdown" @click="onClick" v-html="html"></article>
  </div>
</template>

<style scoped>
.doc-viewer {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* The tag list scrolls below its search field */
.doc-viewer.tags {
  height: 100%;
}

.header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--ib-border);
  background: var(--ib-bg);
}

.header-icon {
  color: var(--ib-muted);
}

.path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ib-muted);
  font-family: var(--ib-mono);
  font-size: 12px;
}

.empty {
  padding: 40px 20px;
  color: var(--ib-muted);
  text-align: center;
}

.markdown {
  max-width: 900px;
  padding: 16px 28px 40px;
  color: var(--ib-text);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: break-word;
}

.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3),
.markdown :deep(h4),
.markdown :deep(h5),
.markdown :deep(h6) {
  margin: 1.4em 0 0.6em;
  line-height: 1.25;
  scroll-margin-top: 48px;
}

.markdown :deep(:is(h1, h2, h3, h4, h5, h6):first-child) {
  margin-top: 0;
}

.markdown :deep(h1) {
  font-size: 1.8em;
}

.markdown :deep(h1),
.markdown :deep(h2) {
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--ib-border);
}

.markdown :deep(h2) {
  font-size: 1.4em;
}

.markdown :deep(h3) {
  font-size: 1.15em;
}

.markdown :deep(p),
.markdown :deep(ul),
.markdown :deep(ol),
.markdown :deep(blockquote),
.markdown :deep(pre),
.markdown :deep(table) {
  margin: 0 0 1em;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  padding-left: 1.8em;
}

.markdown :deep(li + li) {
  margin-top: 0.25em;
}

.markdown :deep(a) {
  color: var(--ib-accent);
}

.markdown :deep(code) {
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background: var(--ib-surface);
  font-family: var(--ib-mono);
  font-size: 0.88em;
}

.markdown :deep(pre) {
  padding: 12px 14px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
  overflow-x: auto;
}

.markdown :deep(pre code) {
  padding: 0;
  background: none;
}

.markdown :deep(blockquote) {
  padding: 0 1em;
  border-left: 3px solid var(--ib-border-2);
  color: var(--ib-muted);
}

.markdown :deep(table) {
  border-collapse: collapse;
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

.markdown :deep(th),
.markdown :deep(td) {
  padding: 5px 10px;
  border: 1px solid var(--ib-border);
}

.markdown :deep(th) {
  background: var(--ib-surface);
}

.markdown :deep(img) {
  max-width: 100%;
}

.markdown :deep(hr) {
  height: 1px;
  margin: 1.5em 0;
  border: 0;
  background: var(--ib-border);
}

.markdown :deep(input[type="checkbox"]) {
  margin-right: 0.4em;
  vertical-align: middle;
}
</style>
