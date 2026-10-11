/**
 * Choices of a dropdown with the current value offered even if the list does not contain it
 * @param {string[]} list
 * @param {string} value
 * @returns {string[]}
 */
export function withCurrent(list, value) {
  return value && !list.includes(value) ? [value, ...list] : list;
}
