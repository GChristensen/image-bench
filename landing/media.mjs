// Makes the web versions of the screenshots, images and the demo video in img/ from the sources in images/ and
// video/ (needs ffmpeg with libwebp on the PATH). Run it after adding or retaking a source; img/ is what the page
// and the build use.
//
//   node media.mjs            converts the sources whose output is missing or older
//   node media.mjs --force    converts all of them
//
// img/still-life.jpg (the compare and editor illustrations) is a crop of an earlier screenshot and has no source here.

import { readdir, stat, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const force = process.argv.includes("--force");
const at = (...p) => path.join(here, ...p);

const mtime = (f) => stat(f).then((s) => s.mtimeMs, () => 0);
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

async function convert(src, dst, args) {
  if (!force && await mtime(dst) >= await mtime(src)) return;
  await mkdir(path.dirname(dst), { recursive: true });
  ffmpeg("-i", src, ...args, dst);
  console.log(`  ${path.relative(here, src)} -> ${path.relative(here, dst)}  ${(await stat(dst)).size} bytes`);
}

// screenshots: full size, lossy WebP (the UI text stays sharp at q 85)
for (const f of await readdir(at("images", "screenshots"))) {
  if (!f.endsWith(".png")) continue;
  await convert(at("images", "screenshots", f), at("img", "screenshots", f.replace(/\.png$/, ".webp")),
    ["-c:v", "libwebp", "-quality", "85"]);
}

// generated images: shown at most ~520 px wide
for (const f of await readdir(at("images", "generations"))) {
  if (!f.endsWith(".png")) continue;
  await convert(at("images", "generations", f), at("img", "generations", f.replace(/\.png$/, ".jpg")),
    ["-vf", "scale=640:-2", "-q:v", "3"]);
}

// demo video: its audio track is silent, so it goes; faststart lets it play before it is loaded
const demo = at("video", "demo.mp4");
await convert(demo, at("img", "demo.mp4"),
  ["-an", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]);
await convert(demo, at("img", "demo-poster.jpg"), ["-ss", "46", "-frames:v", "1", "-q:v", "3"]);
