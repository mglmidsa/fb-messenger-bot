import { configReport, loadConfig } from "@/lib/config";
import { RedisStore } from "@/lib/store";
import { GraphClient, redact } from "@/lib/graph";
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
  // Which Meta app the Page token belongs to. The call carries appsecret_proof made with META_APP_SECRET,
  // so a successful answer also proves the app secret belongs to this same app. (App id/name are not secret.)
  let metaApp: { id?: string; name?: string; appSecretMatches?: boolean; error?: string } | null = null;
  try {
    const cfg = loadConfig();
    activity = await RedisStore.fromConfig(cfg.REDIS_REST_URL, cfg.REDIS_REST_TOKEN).activity();
    try {
      const graph = new GraphClient({ version: cfg.GRAPH_API_VERSION, appSecret: cfg.META_APP_SECRET });
      const app: any = await graph.get("app", cfg.PAGE_ACCESS_TOKEN, { fields: "id,name" });
      metaApp = { id: String(app?.id ?? ""), name: String(app?.name ?? ""), appSecretMatches: true };
    } catch (e) {
      const msg = redact((e as Error).message);
      metaApp = { appSecretMatches: /appsecret_proof/i.test(msg) ? false : undefined, error: msg.slice(0, 200) };
    }
  } catch {
    activity = null;
  }
  return Response.json({
    ...configReport(),
    activity,
    metaApp,
    adminTools: process.env.ADMIN_TOOLS === "true",
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5 (default)",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    environment: process.env.VERCEL_ENV ?? null,
  });
}
