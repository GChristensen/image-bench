import {reactive, watch} from "vue";
import {useProjectsStore} from "@/stores/projects.js";

/**
 * The reminder that the workspace is a project (ProjectCube.vue at the Generate button): armed when the work probably
 * starts anew (the extension window opened, the prompts cleared, PNG Info applied), the next generation from the
 * Generate tab asks whether to continue the project first. Kept in memory only
 */
export const reminder = reactive({
  armed: false,
  // "session": the window was opened with the project current; "new": a new start in the window
  reason: null,
  // Path of the project for which the user asked not to be reminded again in this window
  mutedPath: null
});

// Set for the life of the window, so that a reload of it does not count as opening it
const SESSION_KEY = "imageBench_reminderSession";

export function armReminder(reason) {
  const projects = useProjectsStore();

  if (!projects.hasCurrent || projects.current.path === reminder.mutedPath)
    return;

  reminder.armed = true;
  reminder.reason = reason;
}

export function disarmReminder() {
  reminder.armed = false;
  reminder.reason = null;
}

export function muteReminder() {
  reminder.mutedPath = useProjectsStore().current.path;
  disarmReminder();
}

/**
 * Arm the reminder if the window opens with a project current; called once the current project is loaded.
 * Opening, creating or closing a project afterwards is a choice of its own, which disarms it
 */
export function initReminder() {
  const projects = useProjectsStore();
  let opened = false;

  try {
    opened = !sessionStorage.getItem(SESSION_KEY);
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Without the session storage every load is an opening
    opened = true;
  }

  if (opened)
    armReminder("session");

  watch(() => projects.current.path, () => {
    reminder.mutedPath = null;
    disarmReminder();
  });
}
