import {ref} from "vue";

const POLL_INTERVAL = 500;

/**
 * Progress of a WebUI batch, polled from the server (/image-bench/generation_status): a batch is one WebUI job of all
 * its images (batch count), and the page shows only the progress of the whole job, in whole percents, which is too
 * coarse to tell the progress of an image. {image, overall} (0-100), null while unknown
 */
export const jobProgress = ref(null);

let timer = null;

async function check() {
  try {
    const response = await fetch("/image-bench/generation_status", {cache: "no-store"});
    const {step, steps, job, jobs} = response.ok ? await response.json() : {};

    // Stopped meanwhile
    if (!timer)
      return;

    if (!(steps > 0 && jobs > 0)) {
      jobProgress.value = null;
      return;
    }

    // As WebUI's own progress (modules/progress.py)
    const image = Math.min(1, step / steps);
    jobProgress.value = {image: image * 100, overall: Math.min(1, (job + image) / jobs) * 100};
  } catch {
    // The backend is lost: backendStatus.js deals with that
    jobProgress.value = null;
  }
}

/**
 * Start or stop polling; repeated calls with the same value do nothing
 * @param {boolean} on
 */
export function pollJobProgress(on) {
  if (on && !timer) {
    timer = setInterval(check, POLL_INTERVAL);
    check();
  }
  else if (!on && timer) {
    clearInterval(timer);
    timer = null;
    jobProgress.value = null;
  }
}
