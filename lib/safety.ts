/**
 * Deterministic last check on every AI reply before it reaches the customer.
 * The bot must never state prices, contact details, links, legal references or deadlines:
 * those are for the staff member who calls back. Anything that looks like one is blocked.
 */
export type Violation = "price" | "phone" | "link" | "legal" | "timeline";

const PRICE = [
  /\d[\d\s.,]*\s?(₮|төг|сая|мянга|мянган|доллар|\$|usd|mnt)/iu,
  /(₮|\$)\s?\d/u,
  /үнэгүй|төлбөргүй/iu,
];
const LINK = [/https?:\/\//i, /\bwww\./i, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, /\b[\w-]+\.(mn|com|org|net|gov)\b/i];
const LEGAL = [/[АA]\s?\/\s?\d{2,}/u, /\d+(\.\d+)*\s*(-?р|дугаар|дүгээр)?\s*зүйл/iu];
const TIMELINE = /\d+\s*(-?\s*\d+\s*)?(минут|цаг|хоног|өдөр|ажлын өдөр|долоо хоног|сар|жил)/iu;
const DIGIT_RUN = /\d(?:[\s.-]?\d){5,}/gu;

export function findViolation(reply: string, customerPhone: string | null): Violation | null {
  if (PRICE.some((r) => r.test(reply))) return "price";
  if (LINK.some((r) => r.test(reply))) return "link";
  if (LEGAL.some((r) => r.test(reply))) return "legal";
  if (TIMELINE.test(reply)) return "timeline";
  for (const m of reply.matchAll(DIGIT_RUN)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits !== customerPhone) return "phone";
  }
  return null;
}
