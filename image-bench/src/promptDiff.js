/**
 * Difference of a prompt from another one, for the prompt history of the Generate tab.
 * Prompts are compared by pieces between commas and line breaks: tags, clauses or whole paragraphs, so that tags
 * and prose (as in Anima prompts) both work. Pieces are matched by their text without the attention weight, so that
 * "(smile:1.1)" → "(smile:1.3)" or a changed LoRA weight is one changed piece. A replaced piece that shares enough
 * words with the piece it replaces is compared by words, so that a changed word of a paragraph is that word only.
 */

// A diff of more tokens than this is shown as a plain replacement
const MAX_CELLS = 250_000;
// Share of the words of the longer piece that a replaced pair must have in common to be compared by words
const REFINE_SIMILARITY = 0.5;

const PIECE_SEPARATOR = /(\s*,\s*|\s*\n\s*)/;
const WORD_SEPARATOR = /(\s+)/;

/**
 * Split a text into tokens, each with the separator after it
 * @param {string} text
 * @param {RegExp} separator - With a capturing group
 * @returns {{text: string, sep: string}[]} The first token may be empty, holding the leading separator
 */
function tokenize(text, separator) {
  const parts = text.split(separator);
  const tokens = [];

  for (let i = 0; i < parts.length; i += 2)
    if (parts[i] || parts[i + 1] || !tokens.length)
      tokens.push({text: parts[i], sep: parts[i + 1] ?? ""});

  return tokens;
}

/**
 * The text a piece is matched by: without enclosing brackets, the attention weight and the LoRA weight
 * @param {string} piece
 */
function pieceKey(piece) {
  const lora = /^<(\w+):([^:>]+)(?::[^>]*)?>$/.exec(piece);

  if (lora)
    return `<${lora[1]}:${lora[2]}>`.toLowerCase();

  return piece.replace(/^[([{]+|[)\]}]+$/g, "").replace(/:\s*-?[\d.]+$/, "").trim().toLowerCase();
}

/**
 * Longest common subsequence table, filled from the end
 * @returns {Uint16Array[]|null} null if the texts are too long
 */
function commonLengths(keysA, keysB) {
  const n = keysA.length;
  const m = keysB.length;

  if (n * m > MAX_CELLS)
    return null;

  const lengths = Array.from({length: n + 1}, () => new Uint16Array(m + 1));

  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lengths[i][j] = keysA[i] === keysB[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);

  return lengths;
}

/**
 * @param {{text: string, sep: string}[]} a - Tokens of the text shown
 * @param {{text: string, sep: string}[]} b - Tokens of the text it is compared with
 * @param {function(string): string} keyOf
 * @param {string} defaultSep - Put after a last token followed by a token of the other text
 */
function diffTokens(a, b, keyOf, defaultSep) {
  const keysA = a.map(token => keyOf(token.text));
  const keysB = b.map(token => keyOf(token.text));
  const lengths = commonLengths(keysA, keysB);
  const segments = [];

  if (!lengths)
    segments.push(...b.map(token => ({type: "removed", ...token})), ...a.map(token => ({type: "added", ...token})));
  else {
    const n = a.length;
    const m = b.length;
    let i = 0;
    let j = 0;

    while (i < n || j < m) {
      if (i < n && j < m && keysA[i] === keysB[j]) {
        segments.push(a[i].text === b[j].text
          ? {type: "same", ...a[i]}
          : {type: "changed", ...a[i], base: b[j].text});
        i++;
        j++;
      }
      else if (j < m && (i === n || lengths[i][j + 1] >= lengths[i + 1][j]))
        segments.push({type: "removed", ...b[j++]});
      else
        segments.push({type: "added", ...a[i++]});
    }
  }

  const shown = segments.filter(segment => segment.text || segment.sep);

  for (let k = 0; k < shown.length - 1; k++)
    if (shown[k].text && !shown[k].sep && shown[k + 1].text)
      shown[k] = {...shown[k], sep: defaultSep};

  return shown;
}

const wordKey = word => word.toLowerCase();

/**
 * Word segments of a replaced piece, or null if it has too few words in common with the piece it replaces
 * @param {{text: string, sep: string}} added
 * @param {{text: string, sep: string}} removed
 */
function refinePair(added, removed) {
  const a = tokenize(added.text, WORD_SEPARATOR);
  const b = tokenize(removed.text, WORD_SEPARATOR);
  const lengths = commonLengths(a.map(token => wordKey(token.text)), b.map(token => wordKey(token.text)));
  const words = Math.max(a.filter(token => token.text).length, b.filter(token => token.text).length);

  if (!lengths || !words || lengths[0][0] / words < REFINE_SIMILARITY)
    return null;

  // The separator after the piece is that of the shown text
  return [...diffTokens(a, b, wordKey, " "), {type: "same", text: "", sep: added.sep}];
}

/**
 * Pair the removed and added pieces of a run of replaced pieces in order; similar pairs are compared by words
 */
function refineRun(run) {
  const removed = run.filter(segment => segment.type === "removed");
  const added = run.filter(segment => segment.type === "added");
  const segments = [];

  for (let k = 0; k < Math.max(removed.length, added.length); k++) {
    const refined = removed[k] && added[k] && refinePair(added[k], removed[k]);

    if (refined)
      segments.push(...refined);
    else
      segments.push(...[removed[k], added[k]].filter(Boolean));
  }

  return segments;
}

/**
 * @param {string} text - The prompt shown
 * @param {string} base - The prompt it is compared with
 * @returns {{type: 'same'|'added'|'removed'|'changed', text: string, sep: string, base?: string}[]}
 *   Segments in the order of the shown prompt: added and changed ones are its own text, removed ones that of the base
 */
export function diffPrompts(text, base) {
  const pieces = diffTokens(tokenize(text ?? "", PIECE_SEPARATOR), tokenize(base ?? "", PIECE_SEPARATOR), pieceKey, ", ");
  const segments = [];
  let run = [];

  for (const segment of pieces) {
    if (segment.type === "added" || segment.type === "removed")
      run.push(segment);
    else {
      segments.push(...refineRun(run), segment);
      run = [];
    }
  }

  segments.push(...refineRun(run));
  return segments;
}
