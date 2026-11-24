/** Sends an alert to the owner's Telegram. Silently does nothing if Telegram is not configured. */
export async function notifyOwner(
  cfg: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string },
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!cfg.TELEGRAM_BOT_TOKEN || !cfg.TELEGRAM_CHAT_ID) return false;
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${cfg.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.TELEGRAM_CHAT_ID, text: text.slice(0, 3900), disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
