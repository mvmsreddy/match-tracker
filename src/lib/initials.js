/**
 * Compute display initials from a name, sanitizing punctuation.
 *
 * "Madhu (Parent)"  -> "MP"
 * "coach@x"         -> "CX"  (kept as-is, @ stripped)
 * "Alice"           -> "AL"  (first 2 letters)
 * ""/null           -> "?"
 *
 * Unicode-safe: strips anything that isn't a letter or number (letters
 * from any script are kept, so e.g. "山田 太郎" -> "山太").
 */
export function getInitials(name, { maxLen = 2 } = {}) {
  if (!name || typeof name !== 'string') return '?';
  const cleaned = name
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (cleaned.length === 0) return '?';
  if (cleaned.length === 1) {
    return cleaned[0].slice(0, maxLen).toUpperCase();
  }
  return (cleaned[0][0] + cleaned[cleaned.length - 1][0]).toUpperCase();
}
