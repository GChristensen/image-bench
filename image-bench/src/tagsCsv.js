/**
 * Tag lists of the Library docs: CSV files of tag autocompletion (Danbooru / Anima), one tag per line:
 *   tag,category,post count,"alias,alias,..."
 */

// Danbooru categories
export const TAG_CATEGORIES = {
  0: {label: "General", color: "#4da3ff"},
  1: {label: "Artist", color: "#ff8a8a"},
  3: {label: "Copyright", color: "#c797ff"},
  4: {label: "Character", color: "#5fd38d"},
  5: {label: "Meta", color: "#ffb347"}
};

/**
 * Fields of a CSV line; quoted fields may hold commas, "" is a quote
 * @param {string} line
 * @returns {string[]}
 */
function splitCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"')
        quoted = false;
      else
        field += char;
    } else if (char === '"')
      quoted = true;
    else if (char === ",") {
      fields.push(field);
      field = "";
    } else
      field += char;
  }

  fields.push(field);
  return fields;
}

// Searched form of a tag: lower case, with spaces for underscores and hyphens (same length, for highlighting)
export const normalizeTag = text => text.toLowerCase().replace(/[_-]/g, " ");
const normalize = text => normalizeTag(text).trim();

/**
 * Tags of a CSV file, by post count
 * @param {string} text - Content of a tag CSV file
 * @returns {{name: string, category: number, count: number, aliases: string[], key: string, aliasKeys: string[]}[]}
 */
export function parseTagsCsv(text) {
  const tags = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim())
      continue;

    const [name, category, count, aliases] = splitCsvLine(line);

    if (!name)
      continue;

    const aliasList = aliases ? aliases.split(",").map(alias => alias.trim()).filter(Boolean) : [];
    tags.push({
      name,
      category: parseInt(category) || 0,
      count: parseInt(count) || 0,
      aliases: aliasList,
      key: normalize(name),
      aliasKeys: aliasList.map(normalize)
    });
  }

  return tags.sort((a, b) => b.count - a.count);
}

/**
 * Tags matching a query by name or alias: exact names first, then name prefixes, exact aliases, alias prefixes,
 * other matches of the query and names or aliases holding all its words in any order, each by post count
 * @param {Object[]} tags - From parseTagsCsv(), by post count
 * @param {string} query
 * @param {number} limit
 * @returns {{results: {tag: Object, alias: string|null}[], total: number}} With the matching alias if the name
 *   does not match; total: the number of matches before the limit
 */
export function searchTags(tags, query, limit = 200) {
  const text = normalize(query);

  if (!text)
    return {
      results: tags.slice(0, limit).map(tag => ({tag, alias: null})),
      total: tags.length
    };

  const words = text.split(/\s+/);
  const hasWords = key => words.every(word => key.includes(word));
  const matches = [];

  for (const tag of tags) {
    let rank = -1;
    let alias = null;

    if (tag.key === text)
      rank = 0;
    else if (tag.key.startsWith(text))
      rank = 1;
    else {
      for (let i = 0; i < tag.aliasKeys.length; i++) {
        const key = tag.aliasKeys[i];
        const aliasRank = key === text ? 2 : key.startsWith(text) ? 3 : key.includes(text) ? 5 : -1;

        if (aliasRank >= 0 && (rank < 0 || aliasRank < rank)) {
          rank = aliasRank;
          alias = tag.aliases[i];
        }
      }

      if (tag.key.includes(text) && (rank < 0 || rank > 4)) {
        rank = 4;
        alias = null;
      }

      if (rank < 0 && words.length > 1) {
        if (hasWords(tag.key))
          rank = 6;
        else {
          const index = tag.aliasKeys.findIndex(hasWords);

          if (index >= 0) {
            rank = 7;
            alias = tag.aliases[index];
          }
        }
      }
    }

    if (rank >= 0)
      matches.push({tag, alias, rank});
  }

  // Stable: by post count within a rank
  matches.sort((a, b) => a.rank - b.rank);
  return {results: matches.slice(0, limit).map(({tag, alias}) => ({tag, alias})), total: matches.length};
}

/**
 * Number of posts in short form: 950, 4.1k, 12k, 1.2M
 * @param {number} count
 * @returns {string}
 */
export function formatCount(count) {
  if (count < 1000)
    return String(count);

  if (count < 1e6)
    return `${+(count / 1000).toFixed(count < 1e4 ? 1 : 0)}k`;

  return `${+(count / 1e6).toFixed(1)}M`;
}
