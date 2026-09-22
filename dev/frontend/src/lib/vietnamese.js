/**
 * Normalizes a Vietnamese string for accent-insensitive search and comparison:
 * - Decomposes unicode combining marks (NFD)
 * - Strips combining diacritics
 * - Converts 'đ' / 'Đ' to 'd'
 * - Trims and converts to lowercase
 *
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function normalizeVietnamese(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase();
}
