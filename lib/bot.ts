import type { BotDecision, ChatTurn } from "./ai";
import type { IncomingMessage } from "./webhook";
import { knowledgeIsPlaceholder } from "./knowledge";
import { extractPhone } from "./phone";
import { redact } from "./graph";
import { deliverLead, makeLead } from "./leads";
import { findViolation } from "./safety";
import { MemoryStore, type Lead, type LeadStore } from "./store";

export const PHONE_PURPOSE = "Таны дугаарыг зөвхөн тантай холбогдоход ашиглана.";
export const FALLBACK_REPLY = `Сайн байна уу! Таны мессежийг хүлээн авлаа. Манай ажилтан тантай холбогдох тул утасны дугаараа үлдээнэ үү. ${PHONE_PURPOSE} 🙏`;
export const FALLBACK_WITH_PHONE_REPLY = "Баярлалаа! Таны утасны дугаарыг хүлээн авлаа. Манай ажилтан удахгүй залгана. 🙏";
export const SAFE_REDIRECT_REPLY = `Энэ талаар манай мэргэжилтэн утсаар дэлгэрэнгүй тайлбарлана. Утасны дугаараа үлдээвэл манай ажилтан тантай холбогдоно. ${PHONE_PURPOSE}`;
export const ATTACHMENT_REPLY = "Таны илгээсэн зураг/файлыг хүлээн авлаа. Ажилтан үзээд удахгүй хариулна. 🙏";

/** Inline Telegram attempts for a fresh lead (then the outbox takes over). Keeps the webhook under its time limit. */
export const LEAD_RETRY_DELAYS_MS = [0, 3000, 10000];

export interface BotDeps {
  enabled: boolean;
  knowledge: string;
  store: LeadStore;
  sendText: (psid: string, text: string) => Promise<void>;
  senderAction: (psid: string, action: "typing_on" | "mark_seen") => Promise<void>;
  history: (psid: string) => Promise<ChatTurn[]>;
  decide: (knowledge: string, history: ChatTurn[], latest: string, phone: string | null) => Promise<BotDecision>;
  /** Best-effort staff alert (not for leads). */
  notify: (text: string) => Promise<unknown>;
  /** One Telegram attempt for a lead; true when accepted. */
  sendLead: (text: string) => Promise<boolean>;
  leadRetryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export type Outcome =
  | "duplicate"
  | "disabled"
  | "ai_reply"
  | "lead"
  | "lead_repeat"
  | "handoff"
  | "attachment"
  | "fallback"
  | "send_failed";

// Used only if Redis is unreachable, so the bot keeps working (with weaker de-duplication).
const emergencyStore = new MemoryStore();
export function _resetEmergencyStore() {
  Object.assign(emergencyStore, new MemoryStore());
}

/** The AI reply, unless it contains something the bot must never say (then a safe fixed reply). */
export function safeReply(reply: string, phone: string | null, log: (m: string) => void = () => {}): string {
  const violation = findViolation(reply, phone);
  if (!violation) return reply;
  log(`reply blocked (${violation})`);
  return phone ? FALLBACK_WITH_PHONE_REPLY : SAFE_REDIRECT_REPLY;
}

export async function handleMessage(m: IncomingMessage, deps: BotDeps): Promise<Outcome> {
  const log = deps.log ?? (() => {});

  let firstTime: boolean;
  try {
    firstTime = await deps.store.claimMessage(m.mid);
  } catch (e) {
    log(`store unavailable for de-duplication: ${(e as Error).message}`);
    firstTime = await emergencyStore.claimMessage(m.mid);
  }
  if (!firstTime) return "duplicate";
  if (!deps.enabled) return "disabled";

  const preview = (m.text ?? "[хавсралт]").slice(0, 300);
  await deps.senderAction(m.psid, "mark_seen").catch(() => {});

  const send = async (text: string): Promise<boolean> => {
    try {
      await deps.sendText(m.psid, text);
      return true;
    } catch (e) {
      log(`send failed: ${redact((e as Error).message)}`);
      await deps.notify(`⚠️ Messenger бот хариулт илгээж чадсангүй.\nХэрэглэгч: ${m.psid}\nМессеж: ${preview}\nАлдаа: ${redact((e as Error).message)}`);
      return false;
    }
  };

  if (!m.text) {
    if (!(await send(ATTACHMENT_REPLY))) return "send_failed";
    await deps.notify(`📎 Хэрэглэгч зураг/файл илгээлээ (${m.psid}). Messenger-ээс шалгана уу.`);
    return "attachment";
  }

  // Deterministic: a phone number is recognised by code, never by the AI.
  const phone = extractPhone(m.text);

  // Persist the lead BEFORE calling the AI, so it survives a timeout or crash and the outbox retries it.
  let lead: Lead | null = null;
  let leadStore: LeadStore = deps.store;
  let repeatNumber = false;
  if (phone) {
    const candidate = makeLead(m.psid, phone, preview);
    try {
      if (await deps.store.addLead(candidate)) lead = candidate;
      else repeatNumber = true;
    } catch (e) {
      log(`store unavailable for lead: ${(e as Error).message}`);
      leadStore = emergencyStore;
      if (await emergencyStore.addLead(candidate)) lead = candidate;
      else repeatNumber = true;
    }
  }

  const announce = async (interest: string, note?: string) => {
    if (!lead) return;
    lead = { ...lead, interest, ...(note ? { note } : {}) };
    await leadStore.updateLead(lead).catch(() => {});
    await deliverLead(lead, { store: leadStore, send: deps.sendLead, sleep: deps.sleep, log }, deps.leadRetryDelaysMs ?? LEAD_RETRY_DELAYS_MS);
  };

  if (knowledgeIsPlaceholder(deps.knowledge)) {
    const sent = await send(phone ? FALLBACK_WITH_PHONE_REPLY : FALLBACK_REPLY);
    if (lead) await announce("", "Мэдлэгийн сан хоосон тул бот хариулаагүй");
    else if (!phone) await deps.notify(`📨 Шинэ мессеж (мэдлэгийн сан хоосон тул бот хариулаагүй):\n${preview}`);
    return !sent ? "send_failed" : lead ? "lead" : repeatNumber ? "lead_repeat" : "fallback";
  }

  await deps.senderAction(m.psid, "typing_on").catch(() => {});

  let history: ChatTurn[] = [];
  try {
    history = await deps.history(m.psid);
    const last = history[history.length - 1];
    if (last?.role === "customer" && last.text === m.text) history = history.slice(0, -1);
  } catch (e) {
    log(`history unavailable: ${redact((e as Error).message)}`);
  }

  let decision: BotDecision;
  try {
    decision = await deps.decide(deps.knowledge, history, m.text, phone);
  } catch (e) {
    const err = redact((e as Error).message).slice(0, 300);
    log(`AI failed: ${err}`);
    const sent = await send(phone ? FALLBACK_WITH_PHONE_REPLY : FALLBACK_REPLY);
    if (lead) await announce("", `AI алдаа гарсан (${err})`);
    else if (!phone) await deps.notify(`⚠️ AI хариулт гаргаж чадсангүй, ажилтан хариулна уу.\nМессеж: ${preview}\nАлдаа: ${err}`);
    return sent ? "fallback" : "send_failed";
  }

  const sent = await send(safeReply(decision.reply, phone, log));

  // The lead goes to staff even if the Messenger reply failed: the phone number is the important part.
  if (lead) {
    await announce(decision.licenseInterest, decision.needsHuman ? decision.reason || "ажилтны анхаарал хэрэгтэй" : undefined);
    return sent ? "lead" : "send_failed";
  }
  if (decision.needsHuman) {
    await deps.notify(
      `🙋 Ажилтан хариулах шаардлагатай.\nМессеж: ${preview}\nШалтгаан: ${decision.reason || "-"}\nЧиглэл: ${decision.licenseInterest || "-"}\nБотын хариулт: ${decision.reply.slice(0, 300)}`,
    );
    return sent ? "handoff" : "send_failed";
  }
  if (repeatNumber) return sent ? "lead_repeat" : "send_failed";
  return sent ? "ai_reply" : "send_failed";
}
