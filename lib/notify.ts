export interface TelegramConfig {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

/** One attempt to post into the staff Telegram chat. Never throws. */
export async function sendTelegram(cfg: TelegramConfig, text: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${cfg.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.TELEGRAM_CHAT_ID, text: text.slice(0, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface NotifyOptions {
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
  log?: (msg: string) => void;
}

/**
 * Best-effort alert to staff (handoffs, errors, health). Tries twice. Leads do NOT use this:
 * they go through the durable outbox (lib/leads.ts) so they are never lost.
 * The message text is not logged, because it can contain customer messages.
 */
export async function notifyOwner(cfg: TelegramConfig, text: string, opts: NotifyOptions = {}): Promise<boolean> {
  const f = opts.fetchImpl ?? fetch;
  if (await sendTelegram(cfg, text, f)) return true;
  await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 1000));
  if (await sendTelegram(cfg, text, f)) return true;
  (opts.log ?? console.error)("[notify] Telegram alert was not delivered (content not logged)");
  return false;
}

/** True when the Telegram bot token is valid (used by the daily health check). */
export async function telegramReachable(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface TelegramChat {
  id: number;
  type: string;
  title: string;
}

/**
 * Chats the bot has recently seen (it was added to a group, or someone wrote to it).
 * Used once during setup to find TELEGRAM_CHAT_ID without technical tools.
 */
export async function telegramChats(token: string, fetchImpl: typeof fetch = fetch): Promise<{ bot: string; chats: TelegramChat[] }> {
  const me: any = await (await fetchImpl(`https://api.telegram.org/bot${token}/getMe`)).json();
  const upd: any = await (await fetchImpl(`https://api.telegram.org/bot${token}/getUpdates?limit=100`)).json();
  const chats = new Map<number, TelegramChat>();
  for (const u of upd?.result ?? []) {
    const c = u?.message?.chat ?? u?.my_chat_member?.chat ?? u?.channel_post?.chat ?? u?.edited_message?.chat;
    if (c?.id !== undefined) {
      chats.set(c.id, { id: c.id, type: String(c.type), title: String(c.title ?? c.username ?? c.first_name ?? "") });
    }
  }
  return { bot: String(me?.result?.username ?? ""), chats: [...chats.values()] };
}
