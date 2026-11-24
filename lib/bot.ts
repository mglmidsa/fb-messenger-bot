import type { BotDecision, ChatTurn } from "./ai";
import type { IncomingMessage } from "./webhook";
import { knowledgeIsPlaceholder } from "./knowledge";
import { extractPhone } from "./phone";
import { redact } from "./graph";

export const FALLBACK_REPLY =
  "Сайн байна уу! Таны мессежийг хүлээн авлаа. Манай ажилтан тантай холбогдох тул утасны дугаараа үлдээнэ үү. 🙏";
export const FALLBACK_WITH_PHONE_REPLY =
  "Баярлалаа! Таны утасны дугаарыг хүлээн авлаа. Манай ажилтан удахгүй залгана. 🙏";
export const ATTACHMENT_REPLY =
  "Таны илгээсэн зураг/файлыг хүлээн авлаа. Ажилтан үзээд удахгүй хариулна. 🙏";

export interface BotDeps {
  enabled: boolean;
  knowledge: string;
  sendText: (psid: string, text: string) => Promise<void>;
  senderAction: (psid: string, action: "typing_on" | "mark_seen") => Promise<void>;
  history: (psid: string) => Promise<ChatTurn[]>;
  decide: (knowledge: string, history: ChatTurn[], latest: string, phone: string | null) => Promise<BotDecision>;
  notify: (text: string) => Promise<unknown>;
  log?: (msg: string) => void;
}

export type Outcome =
  | "duplicate"
  | "disabled"
  | "ai_reply"
  | "lead"
  | "handoff"
  | "attachment"
  | "fallback"
  | "send_failed";

/** Best-effort de-duplication of Meta webhook retries within one warm instance. */
const seen = new Map<string, number>();
const SEEN_TTL_MS = 10 * 60_000;
export function isDuplicate(mid: string, now = Date.now()): boolean {
  for (const [k, t] of seen) if (now - t > SEEN_TTL_MS) seen.delete(k);
  if (seen.has(mid)) return true;
  seen.set(mid, now);
  return false;
}
export function _resetSeen() {
  seen.clear();
}

/** The Telegram message staff receive when a customer leaves a phone number. */
export function leadMessage(phone: string, interest: string, preview: string, note?: string): string {
  return [
    "📞 Шинэ хүсэлт — тусгай зөвшөөрөл",
    `Чиглэл: ${interest || "тодорхойгүй (утсаар тодруулна уу)"}`,
    `Утас: ${phone}`,
    `Хэрэглэгчийн мессеж: ${preview}`,
    ...(note ? [`Тэмдэглэл: ${note}`] : []),
  ].join("\n");
}

export async function handleMessage(m: IncomingMessage, deps: BotDeps): Promise<Outcome> {
  const log = deps.log ?? (() => {});
  if (isDuplicate(m.mid)) return "duplicate";
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

  if (knowledgeIsPlaceholder(deps.knowledge)) {
    const sent = await send(phone ? FALLBACK_WITH_PHONE_REPLY : FALLBACK_REPLY);
    if (phone) {
      await deps.notify(leadMessage(phone, "", preview, "Мэдлэгийн сан хоосон тул бот хариулаагүй"));
    } else {
      await deps.notify(`📨 Шинэ мессеж (мэдлэгийн сан хоосон тул бот хариулаагүй):\n${preview}`);
    }
    return sent ? (phone ? "lead" : "fallback") : "send_failed";
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
    if (phone) {
      // The lead must reach staff even when the AI is down.
      await deps.notify(leadMessage(phone, "", preview, `AI алдаа гарсан (${err})`));
    } else {
      await deps.notify(`⚠️ AI хариулт гаргаж чадсангүй, ажилтан хариулна уу.\nМессеж: ${preview}\nАлдаа: ${err}`);
    }
    return sent ? "fallback" : "send_failed";
  }

  const sent = await send(decision.reply);

  // Notify staff even if the Messenger reply failed: the lead is the important part.
  if (phone) {
    await deps.notify(
      leadMessage(phone, decision.licenseInterest, preview, decision.needsHuman ? decision.reason || "ажилтны анхаарал хэрэгтэй" : undefined),
    );
    return sent ? "lead" : "send_failed";
  }
  if (decision.needsHuman) {
    await deps.notify(
      `🙋 Ажилтан хариулах шаардлагатай.\nМессеж: ${preview}\nШалтгаан: ${decision.reason || "-"}\nЧиглэл: ${decision.licenseInterest || "-"}\nБотын хариулт: ${decision.reply.slice(0, 300)}`,
    );
    return sent ? "handoff" : "send_failed";
  }
  return sent ? "ai_reply" : "send_failed";
}
