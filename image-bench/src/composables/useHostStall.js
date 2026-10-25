import {onScopeDispose, ref, watch} from "vue";

// The page may be busy for a moment while the server is not, e.g. between the images of "Generate forever"
const STALL_TIME = 10000;
const POLL_INTERVAL = 2000;

/**
 * Whether the WebUI page shows a generation that has ended on the server. Forge sometimes loses the result
 * of a job interrupted just as it ends, and its page then stays at Interrupt / "Interrupting..." for good,
 * which also keeps the strategies from starting. Only a reload of the page ends it (hostResync.js:reloadStalledHost).
 * The server is polled (/image-bench/generation_status) while the page is busy; stalled once it has been idle
 * for STALL_TIME
 * @param {() => boolean} busy - Whether the page shows a generation
 * @returns {import('vue').Ref<boolean>}
 */
export function useHostStall(busy) {
  const stalled = ref(false);
  let timer = null;
  let idleSince = null;

  async function check() {
    try {
      const response = await fetch("/image-bench/generation_status", {cache: "no-store"});
      const serverBusy = response.ok ? (await response.json()).busy : true;

      // The page became idle meanwhile
      if (!timer)
        return;

      if (serverBusy)
        idleSince = null;
      else {
        idleSince ??= Date.now();
        stalled.value = Date.now() - idleSince >= STALL_TIME;
      }
    } catch {
      // The backend is lost: backendStatus.js deals with that
      idleSince = null;
    }
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    idleSince = null;
    stalled.value = false;
  }

  watch(busy, isBusy => {
    if (!isBusy)
      stop();
    else if (!timer)
      timer = setInterval(check, POLL_INTERVAL);
  }, {immediate: true});

  onScopeDispose(stop);

  return stalled;
}
