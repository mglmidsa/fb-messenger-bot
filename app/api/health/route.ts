import { loadConfig } from "@/lib/config";
import { createRuntime } from "@/lib/runtime";
import { redact } from "@/lib/graph";
import { getKnowledge, knowledgeIsPlaceholder } from "@/lib/knowledge";
import { safeEqual } from "@/lib/signature";
import { telegramReachable } from "@/lib/notify";
import { flushOutbox } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily check (Vercel Cron) and manual status check: Page token, webhook subscription, Telegram,
 * Redis, and the lead outbox (retries anything still pending). Alerts staff on Telegram if something is wrong.
 */
export async function GET(req: Request) {
  const cfg = loadConfig();
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cfg.CRON_SECRET}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { graph, notify, store, sendLead, log } = createRuntime(cfg);
  const problems: string[] = [];
  const checks: Record<string, boolean> = {};

  try {
    const me: any = await graph.get("me", cfg.PAGE_ACCESS_TOKEN, { fields: "id,name" });
    checks.pageToken = String(me?.id) === cfg.PAGE_ID;
    if (!checks.pageToken) problems.push(`Token нь өөр пэйжийнх байна (${me?.id})`);
  } catch (e) {
    checks.pageToken = false;
    problems.push(`Page token ажиллахгүй байна: ${redact((e as Error).message)}`);
  }

  try {
    const subs: any = await graph.get(`${cfg.PAGE_ID}/subscribed_apps`, cfg.PAGE_ACCESS_TOKEN);
    const fields: string[] = (subs?.data ?? []).flatMap((a: any) => a?.subscribed_fields ?? []);
    checks.webhookSubscribed = fields.includes("messages");
    if (!checks.webhookSubscribed) problems.push("Пэйж 'messages' webhook-д бүртгэлгүй байна");
  } catch (e) {
    checks.webhookSubscribed = false;
    problems.push(`Webhook бүртгэлийг шалгаж чадсангүй: ${redact((e as Error).message)}`);
  }

  checks.botEnabled = cfg.BOT_ENABLED === "true";
  if (!checks.botEnabled) problems.push("BOT_ENABLED=false — бот унтраастай байна");
  checks.knowledge = !knowledgeIsPlaceholder(getKnowledge(cfg.BUSINESS_KNOWLEDGE));
  if (!checks.knowledge) problems.push("Мэдлэгийн сан бөглөгдөөгүй байна");

  checks.telegram = await telegramReachable(cfg.TELEGRAM_BOT_TOKEN);
  if (!checks.telegram) {
    problems.push("Telegram бот ажиллахгүй байна — утасны дугаарууд танд хүрэхгүй");
    console.error("[health] Telegram getMe failed: check TELEGRAM_BOT_TOKEN");
  }

  let outbox = { pending: -1, oldestMinutes: null as number | null, delivered: 0 };
  try {
    checks.redis = await store.ping();
    const flushed = checks.telegram ? await flushOutbox({ store, send: sendLead, log }, 50) : { delivered: 0, pending: 0 };
    const s = await store.stats();
    outbox = {
      pending: s.pending,
      oldestMinutes: s.oldestCreatedAt ? Math.round((Date.now() - s.oldestCreatedAt) / 60000) : null,
      delivered: flushed.delivered,
    };
    if (s.pending > 0) problems.push(`${s.pending} хүсэлт Telegram-д хүрээгүй хүлээгдэж байна`);
  } catch (e) {
    checks.redis = false;
    problems.push(`Redis (хадгалах сан) ажиллахгүй байна: ${(e as Error).message}`);
  }

  if (problems.length && checks.telegram) {
    await notify(`🚨 Messenger ботын шалгалт:\n- ${problems.join("\n- ")}`);
  }
  return Response.json({ ok: problems.length === 0, checks, outbox, problems });
}
