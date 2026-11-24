import { loadAdminConfig } from "@/lib/config";
import { requireSecret } from "@/lib/admin";
import { telegramChats } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Setup helper: lists the Telegram chats the bot has seen (e.g. the staff group it was added to),
 * so TELEGRAM_CHAT_ID can be filled in without technical tools. Protected by CRON_SECRET.
 */
export async function GET(req: Request) {
  const denied = requireSecret(req);
  if (denied) return denied;
  const { TELEGRAM_BOT_TOKEN } = loadAdminConfig();
  if (!TELEGRAM_BOT_TOKEN) return Response.json({ error: "TELEGRAM_BOT_TOKEN is not set" }, { status: 400 });
  try {
    return Response.json(await telegramChats(TELEGRAM_BOT_TOKEN));
  } catch (e) {
    return Response.json({ error: `Telegram request failed: ${(e as Error).message}` }, { status: 502 });
  }
}
