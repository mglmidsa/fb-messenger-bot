import { after } from "next/server";
import { loadConfig } from "@/lib/config";
import { safeEqual, verifySignature } from "@/lib/signature";
import { parseMessages } from "@/lib/webhook";
import { handleMessage } from "@/lib/bot";
import { createRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Meta calls this once when you register the webhook URL. */
export async function GET(req: Request) {
  const cfg = loadConfig();
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && safeEqual(token, cfg.WEBHOOK_VERIFY_TOKEN) && /^[\w-]{1,128}$/.test(challenge)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Every incoming Messenger event. Answer 200 fast; do the AI work after the response. */
export async function POST(req: Request) {
  const cfg = loadConfig();
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), cfg.META_APP_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const messages = parseMessages(body, cfg.PAGE_ID);
  if (messages.length) {
    const { deps } = createRuntime(cfg);
    after(async () => {
      for (const m of messages) {
        try {
          const outcome = await handleMessage(m, deps);
          console.log(`[bot] ${m.mid.slice(-8)} → ${outcome}`);
        } catch (e) {
          console.error(`[bot] unexpected error`, (e as Error).message);
        }
      }
    });
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}
