import { createHash } from "node:crypto";
import type { Lead, LeadStore } from "./store";

/** Same customer + same number → same id, so the lead is only ever announced once. */
export function leadId(psid: string, phone: string): string {
  return createHash("sha256").update(`${psid}:${phone}`).digest("hex").slice(0, 16);
}

export function makeLead(psid: string, phone: string, preview: string, now = Date.now()): Lead {
  return { id: leadId(psid, phone), psid, phone, interest: "", preview, createdAt: now };
}

function ulaanbaatarTime(ms: number): string {
  return new Date(ms).toLocaleString("sv-SE", { timeZone: "Asia/Ulaanbaatar" }).slice(0, 16);
}

/** The Telegram message staff receive for a lead. */
export function leadMessage(lead: Lead): string {
  return [
    "📞 Шинэ хүсэлт — тусгай зөвшөөрөл",
    `Чиглэл: ${lead.interest || "тодорхойгүй (утсаар тодруулна уу)"}`,
    `Утас: ${lead.phone}`,
    `Хэрэглэгчийн мессеж: ${lead.preview}`,
    ...(lead.note ? [`Тэмдэглэл: ${lead.note}`] : []),
    `Ирсэн цаг: ${ulaanbaatarTime(lead.createdAt)} (УБ)`,
    `Хүсэлт №: ${lead.id.slice(0, 6)}`,
  ].join("\n");
}

export type DeliveryResult = "delivered" | "pending" | "locked";

export interface DeliveryDeps {
  store: LeadStore;
  /** One Telegram attempt; true when Telegram accepted the message. */
  send: (text: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Tries to deliver one lead. Holds a lock so a parallel webhook or cron run cannot send it twice.
 * On success the lead (and its phone number) is removed from storage; otherwise it stays in the
 * outbox and is retried by the next webhook call and by the daily cron.
 */
export async function deliverLead(lead: Lead, deps: DeliveryDeps, delaysMs: number[] = [0]): Promise<DeliveryResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const log = deps.log ?? (() => {});
  if (!(await deps.store.lock(lead.id, 120))) return "locked";
  try {
    for (const delay of delaysMs) {
      if (delay > 0) await sleep(delay);
      if (await deps.send(leadMessage(lead))) {
        await deps.store.markDelivered(lead.id);
        log(`lead ${lead.id.slice(0, 6)} delivered`);
        return "delivered";
      }
    }
    log(`lead ${lead.id.slice(0, 6)} pending (Telegram did not accept it)`);
    return "pending";
  } finally {
    await deps.store.unlock(lead.id).catch(() => {});
  }
}

/** Re-sends every lead still waiting in the outbox (oldest first). */
export async function flushOutbox(deps: DeliveryDeps, limit = 20): Promise<{ delivered: number; pending: number }> {
  let delivered = 0;
  let pending = 0;
  for (const lead of await deps.store.pendingLeads(limit)) {
    const r = await deliverLead(lead, deps);
    if (r === "delivered") delivered++;
    else if (r === "pending") pending++;
  }
  return { delivered, pending };
}
