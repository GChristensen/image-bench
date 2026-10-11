/**
 * Ctrl+Up/Down attention editing of prompts, ported from WebUI's javascript/edit-attention.js:
 * without a selection the enclosing (...), [...] or <...> block or the word at the cursor is selected,
 * then its weight is raised or lowered: (word:1.1), <lora:name:0.85>
 * The precision and delimiters are the WebUI settings when the WebUI window is reachable
 */

const DEFAULT_OPTIONS = {
  keyedit_precision_attention: 0.1,
  keyedit_precision_extra: 0.05,
  keyedit_delimiters: ".,\\/!?%^*;:{}=`~() ",
  keyedit_delimiters_whitespace: ["Tab", "Carriage Return", "Line Feed"]
};

const WHITESPACE_DELIMITERS = {"Tab": "\t", "Carriage Return": "\r", "Line Feed": "\n"};

function getOptions() {
  let opts = null;

  try {
    opts = window.opener?.opts;
  } catch {
    // The opener is gone or from another origin
  }

  return {...DEFAULT_OPTIONS, ...Object.fromEntries(Object.keys(DEFAULT_OPTIONS)
    .filter(key => opts?.[key] !== undefined).map(key => [key, opts[key]]))};
}

/**
 * Whether a keydown event edits the attention
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
export function isEditAttentionKey(event) {
  return (event.ctrlKey || event.metaKey) && (event.key === "ArrowUp" || event.key === "ArrowDown");
}

/**
 * Raise or lower the attention of the selection, or of the block or word at the cursor
 * @param {string} text - Prompt
 * @param {number} selectionStart
 * @param {number} selectionEnd
 * @param {boolean} isPlus - Raise (Ctrl+Up) or lower (Ctrl+Down)
 * @returns {{text: string, selectionStart: number, selectionEnd: number}}
 *   The edited text and the selection to set; the text is unchanged if there is nothing to edit
 */
export function editAttention(text, selectionStart, selectionEnd, isPlus) {
  const opts = getOptions();

  function selectCurrentParenthesisBlock(OPEN, CLOSE) {
    if (selectionStart !== selectionEnd) return false;

    // Find opening parenthesis around current cursor
    const before = text.substring(0, selectionStart);
    const beforeParen = before.lastIndexOf(OPEN);
    if (beforeParen === -1) return false;

    const beforeClosingParen = before.lastIndexOf(CLOSE);
    if (beforeClosingParen !== -1 && beforeClosingParen > beforeParen) return false;

    // Find closing parenthesis around current cursor
    const after = text.substring(selectionStart);
    const afterParen = after.indexOf(CLOSE);
    if (afterParen === -1) return false;

    const afterOpeningParen = after.indexOf(OPEN);
    if (afterOpeningParen !== -1 && afterOpeningParen < afterParen) return false;

    // Set the selection to the text between the parenthesis
    const parenContent = text.substring(beforeParen + 1, selectionStart + afterParen);
    if (/.*:-?[\d.]+/s.test(parenContent)) {
      const lastColon = parenContent.lastIndexOf(":");
      selectionStart = beforeParen + 1;
      selectionEnd = selectionStart + lastColon;
    } else {
      selectionStart = beforeParen + 1;
      selectionEnd = selectionStart + parenContent.length;
    }

    return true;
  }

  function selectCurrentWord() {
    if (selectionStart !== selectionEnd) return false;

    let delimiters = opts.keyedit_delimiters;
    for (const name of opts.keyedit_delimiters_whitespace)
      delimiters += WHITESPACE_DELIMITERS[name] ?? "";

    // seek backward to find beginning
    while (!delimiters.includes(text[selectionStart - 1]) && selectionStart > 0)
      selectionStart--;

    // seek forward to find end
    while (!delimiters.includes(text[selectionEnd]) && selectionEnd < text.length)
      selectionEnd++;

    // deselect surrounding whitespace
    while (text[selectionStart] === " " && selectionStart < selectionEnd)
      selectionStart++;
    while (text[selectionEnd - 1] === " " && selectionEnd > selectionStart)
      selectionEnd--;

    return true;
  }

  const result = () => ({text, selectionStart, selectionEnd});

  // If nothing is selected, select the current parenthesis block or word
  if (!selectCurrentParenthesisBlock("<", ">")
      && !selectCurrentParenthesisBlock("(", ")")
      && !selectCurrentParenthesisBlock("[", "]"))
    selectCurrentWord();

  let closeCharacter = ")";
  let delta = opts.keyedit_precision_attention;
  const start = selectionStart > 0 ? text[selectionStart - 1] : "";
  const end = text[selectionEnd];

  if (start === "<") {
    closeCharacter = ">";
    delta = opts.keyedit_precision_extra;
  } else if ((start === "(" && end === ")") || (start === "[" && end === "]")) {
    // convert old-style (((emphasis)))
    let numParen = 0;

    while (text[selectionStart - numParen - 1] === start && text[selectionEnd + numParen] === end)
      numParen++;

    let weight = start === "[" ? (1 / 1.1) ** numParen : 1.1 ** numParen;
    weight = Math.round(weight / opts.keyedit_precision_attention) * opts.keyedit_precision_attention;

    text = text.slice(0, selectionStart - numParen) + "(" + text.slice(selectionStart, selectionEnd) + ":" + weight
      + ")" + text.slice(selectionEnd + numParen);
    selectionStart -= numParen - 1;
    selectionEnd -= numParen - 1;
  } else if (start !== "(") {
    // do not include spaces at the end
    while (selectionEnd > selectionStart && text[selectionEnd - 1] === " ")
      selectionEnd--;

    if (selectionStart === selectionEnd)
      return result();

    text = text.slice(0, selectionStart) + "(" + text.slice(selectionStart, selectionEnd) + ":1.0)"
      + text.slice(selectionEnd);
    selectionStart++;
    selectionEnd++;
  }

  if (text[selectionEnd] !== ":")
    return result();

  const weightLength = text.slice(selectionEnd + 1).indexOf(closeCharacter) + 1;
  let weight = parseFloat(text.slice(selectionEnd + 1, selectionEnd + weightLength));

  if (isNaN(weight))
    return result();

  weight += isPlus ? delta : -delta;
  weight = parseFloat(weight.toPrecision(12));
  if (Number.isInteger(weight)) weight += ".0";

  if (closeCharacter === ")" && weight == 1) {
    // (word:1.0) is the word itself
    const endParenPos = text.substring(selectionEnd).indexOf(")");
    text = text.slice(0, selectionStart - 1) + text.slice(selectionStart, selectionEnd)
      + text.slice(selectionEnd + endParenPos + 1);
    selectionStart--;
    selectionEnd--;
  } else {
    text = text.slice(0, selectionEnd + 1) + weight + text.slice(selectionEnd + weightLength);
  }

  return result();
}
