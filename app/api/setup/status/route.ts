import { configReport } from "@/lib/config";
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
  return Response.json({
    ...configReport(),
    adminTools: process.env.ADMIN_TOOLS === "true",
    model: process.env.CLAUDE_MODEL || "claude-haiku-5-5 (default)",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    environment: process.env.VERCEL_ENV ?? null,
  });
}
