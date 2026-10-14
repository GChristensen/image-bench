/**
 * Copy text to the clipboard. navigator.clipboard needs a secure context (https or localhost), which a host opened by
 * its network address over http is not; there the text is copied from a hidden textarea, which works on a click.
 * @param {string} text
 * @returns {Promise<boolean>} Whether the text was copied
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused: try the textarea
  }

  const focused = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0;";
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;

  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  textarea.remove();
  focused?.focus?.({preventScroll: true});
  return copied;
}
