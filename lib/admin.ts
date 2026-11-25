import { loadAdminConfig } from "./config";
import { safeEqual } from "./signature";

/** Commit/environment of the running deployment (not secret) — shows whether a redeploy picked up changes. */
export function deploymentHeaders(): Record<string, string> {
  return {
    "x-bot-commit": process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    "x-bot-env": process.env.VERCEL_ENV ?? "local",
  };
}

/** Returns an error Response unless the request carries `Authorization: Bearer <CRON_SECRET>`. */
export function requireSecret(req: Request, opts: { adminTools?: boolean } = {}): Response | null {
  let cfg: ReturnType<typeof loadAdminConfig>;
  try {
    cfg = loadAdminConfig();
  } catch (e) {
    // Names the variable and the rule only — never a value.
    return new Response(
      `Not configured for this deployment: ${(e as Error).message.replace(/^Invalid configuration — /, "")}. ` +
        "Add it in Vercel (Production environment) and redeploy.",
      { status: 503, headers: deploymentHeaders() },
    );
  }
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cfg.CRON_SECRET}`)) {
    return new Response("Unauthorized", { status: 401, headers: deploymentHeaders() });
  }
  if (opts.adminTools && cfg.ADMIN_TOOLS !== "true") {
    return new Response("Admin tools are off (set ADMIN_TOOLS=true temporarily)", { status: 403, headers: deploymentHeaders() });
  }
  return null;
}
