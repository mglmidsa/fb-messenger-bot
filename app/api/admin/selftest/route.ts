import { loadConfig } from "@/lib/config";
import { requireSecret } from "@/lib/admin";
import { createRuntime } from "@/lib/runtime";
import { makeLead } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Production self-test of the durable store (and optionally Telegram delivery to the staff chat).
 * Exercises the real Redis: message de-duplication, lead idempotency, outbox, lock, delivery cleanup.
 * Requires CRON_SECRET and ADMIN_TOOLS=true. Add ?telegram=1 to also send a test message to staff.
 */
export async function POST(req: Request) {
  const denied = requireSecret(req, { adminTools: true });
  if (denied) return denied;
  const { store, sendLead } = createRuntime(loadConfig());
  const results: Record<string, boolean> = {};
  const tag = `selftest-${Date.now()}`;

  results.ping = await store.ping();
  results.messageFirstSeen = await store.claimMessage(`${tag}-mid`);
  results.messageRetryIgnored = !(await store.claimMessage(`${tag}-mid`));

  const lead = makeLead(tag, "99999999", "[ӨӨРИЙН ШАЛГАЛТ — ажилтан залгах шаардлагагүй]");
  results.leadStored = await store.addLead(lead);
  results.lockAcquired = await store.lock(lead.id, 60); // keeps the outbox flush away from the test lead
  results.leadDuplicateRejected = !(await store.addLead(lead));
  await store.updateLead({ ...lead, interest: "тест" });
  const pending = await store.pendingLeads(200);
  const found = pending.find((l) => l.id === lead.id);
  results.leadInOutbox = Boolean(found);
  results.leadUpdated = found?.interest === "тест";
  await store.markDelivered(lead.id);
  results.leadRemovedAfterDelivery = !(await store.pendingLeads(200)).some((l) => l.id === lead.id);

  if (new URL(req.url).searchParams.get("telegram") === "1") {
    results.telegramDelivered = await sendLead("✅ Тест: Messenger бот энэ Telegram чат руу мэдэгдэл илгээж чадаж байна. (Хариулах шаардлагагүй)");
  }
  return Response.json({ ok: Object.values(results).every(Boolean), results });
}
