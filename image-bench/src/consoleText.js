/**
 * The text of the console drawer: the terminal output of the host as lines of styled segments.
 * Only what a log needs is followed: line feeds, carriage returns (a progress bar redraws its line: the next text
 * replaces it) and the SGR color and weight codes. Other control sequences (cursor moves, erasing) are dropped.
 */

const TOKEN = /\x1b\[([0-9;?]*)([@-~])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][\x20-\x7e]|\x1b[\x20-\x7e]|\n|\r|[^\x1b\n\r]+/g;

// An escape sequence cut off by the end of a chunk, completed by the next one
const INCOMPLETE = /\x1b(?:\[[0-9;?]*|\][^\x07\x1b]*|[()])?$/;

const DEFAULT_STYLE = Object.freeze({fg: null, bg: null, bold: false, dim: false, italic: false, underline: false});

/**
 * A color of the 256-color palette: the 16 named ones, the 6×6×6 cube and the gray ramp
 * @param {number} index
 * @returns {number|string} the index of a named color, or a CSS color
 */
function paletteColor(index) {
  if (index < 16)
    return index;

  if (index < 232) {
    const value = index - 16;
    const level = n => n ? 55 + n * 40 : 0;
    return `rgb(${level(Math.floor(value / 36))}, ${level(Math.floor(value / 6) % 6)}, ${level(value % 6)})`;
  }

  const gray = 8 + (index - 232) * 10;
  return `rgb(${gray}, ${gray}, ${gray})`;
}

/**
 * Apply the parameters of an SGR sequence (ESC [ ... m) to a style
 * @param {Object} style
 * @param {string} params
 * @returns {Object} the new style
 */
function applySgr(style, params) {
  const codes = params ? params.split(";").map(code => parseInt(code) || 0) : [0];
  const next = {...style};

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];

    if (code === 0)
      Object.assign(next, DEFAULT_STYLE);
    else if (code === 1)
      next.bold = true;
    else if (code === 2)
      next.dim = true;
    else if (code === 22)
      next.bold = next.dim = false;
    else if (code === 3)
      next.italic = true;
    else if (code === 23)
      next.italic = false;
    else if (code === 4)
      next.underline = true;
    else if (code === 24)
      next.underline = false;
    else if (code >= 30 && code <= 37)
      next.fg = code - 30;
    else if (code >= 90 && code <= 97)
      next.fg = code - 90 + 8;
    else if (code === 39)
      next.fg = null;
    else if (code >= 40 && code <= 47)
      next.bg = code - 40;
    else if (code >= 100 && code <= 107)
      next.bg = code - 100 + 8;
    else if (code === 49)
      next.bg = null;
    else if (code === 38 || code === 48) {
      // 38;5;n or 38;2;r;g;b
      let color = null;

      if (codes[i + 1] === 5) {
        color = paletteColor(codes[i + 2] ?? 0);
        i += 2;
      }
      else if (codes[i + 1] === 2) {
        color = `rgb(${codes[i + 2] ?? 0}, ${codes[i + 3] ?? 0}, ${codes[i + 4] ?? 0})`;
        i += 4;
      }

      next[code === 38 ? "fg" : "bg"] = color;
    }
  }

  return next;
}

/**
 * The class and inline style of a segment: the 16 named colors are classes of the drawer's palette
 * @param {Object} style
 * @returns {{cls: string, css: string}}
 */
function renderStyle(style) {
  const classes = [];
  const css = [];

  if (typeof style.fg === "number")
    classes.push(`fg${style.fg}`);
  else if (style.fg)
    css.push(`color: ${style.fg}`);

  if (typeof style.bg === "number")
    classes.push(`bg${style.bg}`);
  else if (style.bg)
    css.push(`background: ${style.bg}`);

  if (style.bold)
    classes.push("bold");
  if (style.dim)
    classes.push("dim");
  if (style.italic)
    classes.push("italic");
  if (style.underline)
    classes.push("underline");

  return {cls: classes.join(" "), css: css.join("; ")};
}

/**
 * Create the text of a console
 * @param {Object} [options]
 * @param {number} [options.maxLines] lines kept; the oldest ones are dropped
 * @returns {{lines: Array<{id: number, version: number, segments: Array<{text: string, cls: string, css: string}>}>,
 *            write: function(string), reset: function(), plainText: function(): string}}
 */
export function createConsoleText({maxLines = 5000} = {}) {
  const lines = [];
  let style = DEFAULT_STYLE;
  let rendered = renderStyle(style);
  let carry = "";
  // A carriage return was written: the next text replaces the line
  let returned = false;
  let nextId = 0;

  const newLine = () => {
    lines.push({id: nextId++, version: 0, segments: []});

    if (lines.length > maxLines)
      lines.splice(0, lines.length - maxLines);
  };

  const current = () => lines[lines.length - 1];

  function clearLine() {
    const line = current();
    line.segments = [];
    line.version++;
  }

  function append(text) {
    if (returned) {
      clearLine();
      returned = false;
    }

    const line = current();
    const last = line.segments[line.segments.length - 1];

    if (last && last.cls === rendered.cls && last.css === rendered.css)
      last.text += text;
    else
      line.segments.push({text, cls: rendered.cls, css: rendered.css});

    line.version++;
  }

  function write(chunk) {
    let text = carry + chunk;
    carry = "";

    const incomplete = text.match(INCOMPLETE);

    if (incomplete) {
      carry = incomplete[0];
      text = text.slice(0, incomplete.index);
    }

    for (const match of text.matchAll(TOKEN)) {
      const token = match[0];

      if (token === "\n") {
        returned = false;
        newLine();
      }
      else if (token === "\r")
        returned = true;
      else if (token[0] !== "\x1b")
        append(token);
      else if (match[2] === "m") {
        style = applySgr(style, match[1]);
        rendered = renderStyle(style);
      }
      // Erase the whole line
      else if (match[2] === "K" && match[1] === "2")
        clearLine();
    }
  }

  function reset() {
    lines.length = 0;
    style = DEFAULT_STYLE;
    rendered = renderStyle(style);
    carry = "";
    returned = false;
    newLine();
  }

  const plainText = () => lines.map(line => line.segments.map(segment => segment.text).join("")).join("\n");

  reset();
  return {lines, write, reset, plainText};
}
