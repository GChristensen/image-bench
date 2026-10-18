// Builds the landing page into the GitHub Pages entry point (the repo-root index.html).
//
//   node build.mjs          minified build: one index.html with the CSS, the JS and the small SVGs inlined.
//                           Images and the video stay files in landing/img/, only their paths are re-based.
//   node build.mjs --plain  no build to speak of, no npm packages needed: a readable index.html whose
//                           assets are still the files in landing/, only the paths are re-based.
//   --out <dir>             write into <dir> instead of the repo root (to preview without touching the site);
//                           landing/img (and, for --plain, the CSS and JS) is copied along
//
// Run `npm install` here once for the minified build (html-minifier-terser + svgo), and `node media.mjs` after
// changing a source image or the video.

import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const plain = args.includes("--plain");
const outIdx = args.indexOf("--out");
if (outIdx >= 0 && !args[outIdx + 1]) throw new Error("--out needs a directory");
const outDir = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.resolve(here, "..");

const INLINE_LIMIT = 4096;            // inline svgs up to this many bytes (after minification) as data: URIs

// relative paths only: absolute URLs, root-absolute paths and #anchors are left alone
const isLocal = (url) => !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);
const bytes = (s) => Buffer.byteLength(s, "utf8");
const read = (rel) => readFile(path.join(here, rel), "utf8");

// Rewrites every local src/href/poster attribute. fn(url, attr) returns the new value.
const mapUrls = (html, fn) =>
  html.replace(/(\s(src|href|poster)=")([^"]+)(")/g,
    (m, pre, attr, url, post) => isLocal(url) ? pre + fn(url, attr) + post : m);

let html = await read("index.html");
let before = bytes(html);
let after;
const log = [];

// a custom --out has no landing/ next to it: bring the assets along
async function copyAssets(files) {
  if (path.resolve(outDir, "landing") === here) return;
  for (const f of files)
    await cp(path.join(here, f), path.join(outDir, "landing", f), { recursive: true });
  log.push(`  + landing/{${files.join(",")}} copied to ${path.join(outDir, "landing")}`);
}

if (plain) {
  // ---------------------------------------------------------------- plain
  html = mapUrls(html, (url) => "landing/" + url);
  after = bytes(html);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), html, "utf8");
  await copyAssets(["styles.css", "main.js", "img"]);
} else {
  // ---------------------------------------------------------------- minified
  const { minify } = await import("html-minifier-terser");
  const { optimize } = await import("svgo");

  // 1. inline local stylesheets
  const linkRe = /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g;
  const styles = new Map();
  for (const [, url] of html.matchAll(linkRe)) {
    if (!isLocal(url) || styles.has(url)) continue;
    const css = await read(url);
    if (/url\(\s*['"]?(?![a-z]+:|#)/i.test(css))
      throw new Error(`${url}: relative url() references are not supported by the inliner`);
    styles.set(url, css);
    before += bytes(css);
    log.push(`  + ${url}`);
  }
  html = html.replace(linkRe, (tag, url) => styles.has(url) ? `<style>${styles.get(url)}</style>` : tag);

  // 2. inline local scripts; a deferred script keeps its meaning by moving to the end of <body>
  const scriptRe = /<script\b([^>]*?)\ssrc="([^"]+)"([^>]*)><\/script>\s*/g;
  const deferred = [];
  const scripts = new Map();
  for (const [, , url] of html.matchAll(scriptRe)) {
    if (!isLocal(url) || scripts.has(url)) continue;
    const js = await read(url);
    scripts.set(url, js);
    before += bytes(js);
    log.push(`  + ${url}`);
  }
  html = html.replace(scriptRe, (tag, pre, url, post) => {
    if (!scripts.has(url)) return tag;
    const tagOut = `<script>${scripts.get(url).replace(/<\/script/gi, "<\\/script")}</script>`;
    if (/\bdefer\b/.test(pre + post)) { deferred.push(tagOut); return ""; }
    return tagOut;
  });
  if (deferred.length) html = html.replace("</body>", deferred.join("") + "</body>");

  // 3. small svgs (the favicon) become data: URIs; everything else is re-based to landing/
  html = await replaceAsync(html, /(\s(?:src|href|poster)=")([^"]+)(")/g, async (m, pre, url, post) => {
    if (!isLocal(url)) return m;
    if (/\.svg$/i.test(url)) {
      const src = await read(url);
      const svg = optimize(src, { path: url, multipass: true,
        plugins: [{ name: "preset-default", params: { overrides: { removeViewBox: false } } }] }).data;
      if (bytes(svg) <= INLINE_LIMIT) {
        log.push(`  + ${url} inlined, ${bytes(src)} -> ${bytes(svg)} bytes`);
        return pre + "data:image/svg+xml," + encodeURIComponent(svg).replace(/%20/g, " ").replace(/%3A/g, ":")
          .replace(/%2F/g, "/").replace(/%3D/g, "=").replace(/%2C/g, ",").replace(/%3B/g, ";") + post;
      }
    }
    return pre + "landing/" + url + post;
  });

  // 4. minify everything else
  html = await minify(html, {
    collapseWhitespace: true,
    conservativeCollapse: false,
    collapseBooleanAttributes: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    removeEmptyAttributes: true,
    removeAttributeQuotes: true,
    sortAttributes: true,
    sortClassName: true,
    useShortDoctype: true,
    minifyCSS: { level: 2 },
    minifyJS: { compress: { passes: 2 }, mangle: { toplevel: true } },
  });
  after = bytes(html);

  // 5. write
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), html, "utf8");
  await copyAssets(["img"]);
}

async function replaceAsync(text, re, fn) {
  const parts = await Promise.all([...text.matchAll(re)].map((m) => fn(...m)));
  let i = 0;
  return text.replace(re, () => parts[i++]);
}

console.log(`landing (${plain ? "plain" : "minified"}): ${path.join(here, "index.html")}`);
for (const l of log) console.log(l);
console.log(`  -> ${path.join(outDir, "index.html")}`);
console.log(`  ${before} bytes -> ${after} bytes (${(100 * after / before).toFixed(1)}%)`);
