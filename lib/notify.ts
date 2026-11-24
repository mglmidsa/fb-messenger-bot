export interface TelegramConfig {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

export interface NotifyOptions {
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
  log?: (msg: string) => void;
}

async function sendOnce(cfg: TelegramConfig, text: string, f: typeof fetch): Promise<boolean> {
  try {
    const res = await f(`https://api.telegram.org/bot${cfg.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.TELEGRAM_CHAT_ID, text: text.slice(0, 3900), disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sends an alert or lead to the owner's Telegram. Tries twice. If both attempts fail, the full
 * message is written to the server log (Vercel → Logs) so a phone-number lead is not silently lost.
 */
export async function notifyOwner(cfg: TelegramConfig, text: string, opts: NotifyOptions = {}): Promise<boolean> {
  const f = opts.fetchImpl ?? fetch;
  if (await sendOnce(cfg, text, f)) return true;
  await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 1000));
  if (await sendOnce(cfg, text, f)) return true;
  (opts.log ?? console.error)(`[notify] Telegram delivery failed. Undelivered message:\n${text}`);
  return false;
}

/** True when the Telegram bot token is valid (used by the daily health check). */
export async function telegramReachable(cfg: TelegramConfig, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${cfg.TELEGRAM_BOT_TOKEN}/getMe`);
    return res.ok;
  } catch {
    return false;
  }
}
