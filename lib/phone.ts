/**
 * Finds a Mongolian phone number in free text, deterministically (no AI).
 *
 * Accepts 8 digits starting with 5–9, optionally prefixed by +976 / 976, written whole or in
 * groups of 2 or 4 digits separated by a space, dot or dash:
 *   "99112233", "9911 2233", "9911-22-33", "99 11 22 33", "+976 99112233".
 *
 * Rejects things that only look like a phone number:
 *   - longer digit runs ("9911223344"),
 *   - money written in groups of three ("50 000 000") or followed by a currency word ("50000000₮"),
 *   - a national register number glued to letters ("УБ90010112").
 *
 * Returns the first number found as 8 plain digits, or null.
 */
const CANDIDATE = /(?<![\p{L}\d])(?:\+?976[\s.-]?)?([5-9](?:[\s.-]?\d){7})(?!\d)/gu;
const MONEY_AFTER = /^\s?(₮|төг|сая|мян|доллар|\$|%|usd|mnt)/iu;
const PHONE_GROUP_LENGTHS = new Set([2, 4, 8]);

export function extractPhone(text: string | undefined): string | null {
  if (!text) return null;
  for (const match of text.matchAll(CANDIDATE)) {
    const groups = match[1].split(/[\s.-]/);
    if (!groups.every((g) => PHONE_GROUP_LENGTHS.has(g.length))) continue;
    const after = text.slice((match.index ?? 0) + match[0].length);
    if (MONEY_AFTER.test(after)) continue;
    return groups.join("");
  }
  return null;
}
