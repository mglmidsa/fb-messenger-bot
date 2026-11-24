/** A message a person sent to the Page, extracted from a Messenger webhook payload. */
export interface IncomingMessage {
  psid: string; // page-scoped ID of the sender
  mid: string; // message ID, used for de-duplication
  text?: string;
  hasAttachment: boolean;
  timestamp: number;
}

/**
 * Pulls the person-to-Page text/attachment messages out of a webhook body.
 * Ignores echoes (messages the Page itself sent), reads/deliveries, reactions and other pages' events.
 */
export function parseMessages(body: unknown, pageId: string): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const b = body as any;
  if (!b || b.object !== "page" || !Array.isArray(b.entry)) return out;
  for (const entry of b.entry) {
    if (String(entry?.id) !== pageId || !Array.isArray(entry.messaging)) continue;
    for (const ev of entry.messaging) {
      const msg = ev?.message;
      if (!msg || msg.is_echo) continue;
      const psid = ev?.sender?.id;
      if (!psid || String(psid) === pageId || !msg.mid) continue;
      const text = typeof msg.text === "string" && msg.text.trim() ? msg.text.trim() : undefined;
      const hasAttachment = Array.isArray(msg.attachments) && msg.attachments.length > 0;
      if (!text && !hasAttachment) continue;
      out.push({ psid: String(psid), mid: String(msg.mid), text, hasAttachment, timestamp: Number(ev.timestamp) || Date.now() });
    }
  }
  return out;
}
