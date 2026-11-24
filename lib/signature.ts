import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 * Rejects anything that is missing, malformed or does not match (constant-time compare).
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(received.toLowerCase(), "hex"), Buffer.from(expected, "hex"));
}
