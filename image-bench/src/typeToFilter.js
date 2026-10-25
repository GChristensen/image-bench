/**
 * Typing in an open filterable dropdown narrows it down wherever the focus is in it: a printable key pressed
 * outside the filter input moves the focus there, and the browser then types the character into it.
 * @param {KeyboardEvent} e keydown inside the dropdown
 * @param {HTMLInputElement|null} input the filter input
 */
export function typeIntoFilter(e, input) {
  if (!input || e.target === input || e.ctrlKey || e.altKey || e.metaKey || e.isComposing)
    return;

  if (e.key.length === 1 && !(e.key === " " && e.target.closest?.("button, label, input")))
    input.focus();
  else if (e.key === "Backspace")
    input.focus();
}
