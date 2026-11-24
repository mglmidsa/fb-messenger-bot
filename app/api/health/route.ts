import { loadConfig } from "@/lib/config";
import { createRuntime } from "@/lib/runtime";
import { redact } from "@/lib/graph";
import { getKnowledge, knowledgeIsPlaceholder } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily check (Vercel Cron): is the Page token still valid and is the Page still subscribed
 * to message webhooks? Alerts the owner on Telegram if anything is wrong.
 */
export async function GET(req: Request) {
  const cfg = loadConfig();
  if (!cfg.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${cfg.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { graph, notify } = createRuntime(cfg);
  const problems: string[] = [];

  try {
    const me: any = await graph.get("me", cfg.PAGE_ACCESS_TOKEN, { fields: "id,name" });
    if (String(me?.id) !== cfg.PAGE_ID) problems.push(`Token нь өөр пэйжийнх байна (${me?.id})`);
  } catch (e) {
    problems.push(`Page token ажиллахгүй байна: ${redact((e as Error).message)}`);
  }

  try {
    const subs: any = await graph.get(`${cfg.PAGE_ID}/subscribed_apps`, cfg.PAGE_ACCESS_TOKEN);
    const fields: string[] = (subs?.data ?? []).flatMap((a: any) => a?.subscribed_fields ?? []);
    if (!fields.includes("messages")) problems.push("Пэйж 'messages' webhook-д бүртгэлгүй байна");
  } catch (e) {
    problems.push(`Webhook бүртгэлийг шалгаж чадсангүй: ${redact((e as Error).message)}`);
  }

  if (cfg.BOT_ENABLED !== "true") problems.push("BOT_ENABLED=false — бот унтраастай байна");
  if (knowledgeIsPlaceholder(getKnowledge(cfg.BUSINESS_KNOWLEDGE))) problems.push("Мэдлэгийн сан бөглөгдөөгүй байна");

  if (problems.length) {
    await notify(`🚨 Messenger ботын өдрийн шалгалт:\n- ${problems.join("\n- ")}`);
    return Response.json({ ok: false, problems }, { status: 200 });
  }
  return Response.json({ ok: true });
}
