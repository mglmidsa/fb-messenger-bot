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
 * A tap on a button ("Get Started" etc.) arrives as a postback and is treated as that button's text.
 * Ignores echoes (messages the Page itself sent), reads/deliveries, reactions and other pages' events.
 */
export function parseMessages(body: unknown, pageId: string): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const b = body as any;
  if (!b || b.object !== "page" || !Array.isArray(b.entry)) return out;
  for (const entry of b.entry) {
    if (String(entry?.id) !== pageId || !Array.isArray(entry.messaging)) continue;
    for (const ev of entry.messaging) {
      const psid = ev?.sender?.id;
      if (!psid || String(psid) === pageId) continue;
      const timestamp = Number(ev.timestamp) || Date.now();

      if (ev?.postback) {
        const title = typeof ev.postback.title === "string" && ev.postback.title.trim() ? ev.postback.title.trim() : "Сайн байна уу";
        const mid = String(ev.postback.mid ?? `pb_${psid}_${timestamp}`);
        out.push({ psid: String(psid), mid, text: title, hasAttachment: false, timestamp });
        continue;
      }

      const msg = ev?.message;
      if (!msg || msg.is_echo || !msg.mid) continue;
      const text = typeof msg.text === "string" && msg.text.trim() ? msg.text.trim() : undefined;
      const hasAttachment = Array.isArray(msg.attachments) && msg.attachments.length > 0;
      if (!text && !hasAttachment) continue;
      out.push({ psid: String(psid), mid: String(msg.mid), text, hasAttachment, timestamp });
    }
  }
  return out;
}

/**
 * What kind of events a webhook delivery carried, for diagnosis. "standby" means another app
 * currently owns the conversation (Page conversation routing), so the bot is not expected to answer.
 */
export function entryKinds(body: unknown): { messaging: number; standby: number; other: number } {
  const out = { messaging: 0, standby: 0, other: 0 };
  const b = body as any;
  if (!b || !Array.isArray(b.entry)) return out;
  for (const e of b.entry) {
    if (Array.isArray(e?.messaging)) out.messaging += e.messaging.length;
    else if (Array.isArray(e?.standby)) out.standby += e.standby.length;
    else out.other += 1;
  }
  return out;
}
