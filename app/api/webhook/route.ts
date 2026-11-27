import { after } from "next/server";
import { loadConfig, loadVerifyToken } from "@/lib/config";
import { safeEqual, verifySignature } from "@/lib/signature";
import { entryKinds, parseMessages } from "@/lib/webhook";
import { handleMessage } from "@/lib/bot";
import { createRuntime } from "@/lib/runtime";
import { flushOutbox } from "@/lib/leads";
import { deploymentHeaders } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Meta calls this once when you register the webhook URL:
 *   GET ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<number>
 * Answers with the challenge as plain text (HTTP 200) when the token matches.
 * Depends ONLY on WEBHOOK_VERIFY_TOKEN — not on the Page token, app secret or anything else.
 */
export async function GET(req: Request) {
  const headers = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...deploymentHeaders() };
  let verifyToken: string;
  try {
    verifyToken = loadVerifyToken();
  } catch {
    console.error("[webhook] verification failed: WEBHOOK_VERIFY_TOKEN is not set for this deployment");
    return new Response(
      "WEBHOOK_VERIFY_TOKEN is not set for this deployment (or is shorter than 16 characters). " +
        "Add it in Vercel (Production environment) and redeploy.",
      { status: 503, headers },
    );
  }
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = (url.searchParams.get("hub.verify_token") ?? "").trim();
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && safeEqual(token, verifyToken) && /^[\w-]{1,128}$/.test(challenge)) {
    return new Response(challenge, { status: 200, headers });
  }
  console.warn(`[webhook] verification rejected (mode=${mode ?? "-"}, token ${token ? "mismatch" : "missing"})`);
  return new Response("Forbidden", { status: 403, headers });
}

/** Every incoming Messenger event. Answer 200 fast; do the AI work after the response. */
export async function POST(req: Request) {
  const cfg = loadConfig();
  const rt = createRuntime(cfg);
  const now = () => new Date().toISOString();
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), cfg.META_APP_SECRET)) {
    // A wrong META_APP_SECRET shows up here as a growing count in /api/setup/status.
    await rt.store.track({ webhook_bad_signature: 1 }, { webhook_bad_signature_last_at: now() }).catch(() => {});
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const messages = parseMessages(body, cfg.PAGE_ID);
  const kinds = entryKinds(body);
  after(async () => {
    await rt.store
      .track(
        { webhook_posts: 1, entries_messaging: kinds.messaging, entries_standby: kinds.standby, entries_other: kinds.other, messages_parsed: messages.length },
        { webhook_last_at: now(), ...(kinds.standby ? { standby_last_at: now() } : {}) },
      )
      .catch(() => {});
    for (const m of messages) {
      try {
        const outcome = await handleMessage(m, rt.deps);
        rt.log(`${m.mid.slice(-8)} → ${outcome}`);
        await rt.store.track({ [`outcome_${outcome}`]: 1 }, { last_message_at: now() }).catch(() => {});
      } catch (e) {
        console.error(`[bot] unexpected error`, (e as Error).message);
        await rt.store.track({ error_unexpected: 1 }, { last_error: `unexpected: ${(e as Error).message}`.slice(0, 240), last_error_at: now() }).catch(() => {});
      }
    }
    // Any lead that Telegram refused earlier gets another chance on every webhook call.
    try {
      const r = await flushOutbox({ store: rt.store, send: rt.sendLead, log: rt.log }, 10);
      if (r.delivered || r.pending) rt.log(`outbox: ${r.delivered} delivered, ${r.pending} still pending`);
    } catch (e) {
      console.error(`[bot] outbox flush failed`, (e as Error).message);
    }
  });
  return new Response("EVENT_RECEIVED", { status: 200 });
}
