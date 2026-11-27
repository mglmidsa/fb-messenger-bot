import { configReport, loadConfig } from "@/lib/config";
import { RedisStore } from "@/lib/store";
import { requireSecret } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Setup helper: which environment variables are still missing (names only, never values),
 * whether Redis is connected, and which Git commit is running. Protected by CRON_SECRET.
 */
export async function GET(req: Request) {
  const denied = requireSecret(req);
  if (denied) return denied;
  let activity: Record<string, string> | null = null;
  try {
    const cfg = loadConfig();
    activity = await RedisStore.fromConfig(cfg.REDIS_REST_URL, cfg.REDIS_REST_TOKEN).activity();
  } catch {
    activity = null;
  }
  return Response.json({
    ...configReport(),
    activity,
    adminTools: process.env.ADMIN_TOOLS === "true",
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5 (default)",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    environment: process.env.VERCEL_ENV ?? null,
  });
}
