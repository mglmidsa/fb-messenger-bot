import { z } from "zod";
import { loadConfig } from "@/lib/config";
import { requireSecret } from "@/lib/admin";
import { createRuntime } from "@/lib/runtime";
import { extractPhone } from "@/lib/phone";
import { findViolation } from "@/lib/safety";
import { safeReply } from "@/lib/bot";
import type { ChatTurn } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  conversations: z
    .array(z.object({ name: z.string().max(80), turns: z.array(z.string().min(1).max(500)).min(1).max(6) }))
    .min(1)
    .max(30),
});

/**
 * Runs conversations through the REAL production prompt and Claude model, without sending anything
 * to Messenger or Telegram and without storing leads. Used to test Mongolian understanding.
 * Requires CRON_SECRET and ADMIN_TOOLS=true.
 */
export async function POST(req: Request) {
  const denied = requireSecret(req, { adminTools: true });
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { knowledge, decide, cfg } = createRuntime(loadConfig());

  const runOne = async (conv: { name: string; turns: string[] }) => {
    const history: ChatTurn[] = [];
    const turns = [];
    for (const text of conv.turns) {
      const phone = extractPhone(text);
      try {
        const d = await decide(knowledge, history, text, phone);
        const finalReply = safeReply(d.reply, phone);
        turns.push({
          customer: text,
          phone,
          reply: finalReply,
          blocked: finalReply !== d.reply ? findViolation(d.reply, phone) : null,
          rawReply: finalReply !== d.reply ? d.reply : undefined,
          needsHuman: d.needsHuman,
          reason: d.reason,
          licenseInterest: d.licenseInterest,
        });
        history.push({ role: "customer", text }, { role: "page", text: finalReply });
      } catch (e) {
        turns.push({ customer: text, phone, error: (e as Error).message });
        history.push({ role: "customer", text });
      }
    }
    return { name: conv.name, turns };
  };

  const queue = [...parsed.data.conversations];
  const results: Awaited<ReturnType<typeof runOne>>[] = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) results.push(await runOne(c));
    }),
  );
  return Response.json({ model: cfg.CLAUDE_MODEL, results });
}
