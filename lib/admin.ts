import { loadAdminConfig } from "./config";
import { safeEqual } from "./signature";

/** Returns an error Response unless the request carries `Authorization: Bearer <CRON_SECRET>`. */
export function requireSecret(req: Request, opts: { adminTools?: boolean } = {}): Response | null {
  let cfg: ReturnType<typeof loadAdminConfig>;
  try {
    cfg = loadAdminConfig();
  } catch {
    return new Response("Not configured", { status: 503 });
  }
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cfg.CRON_SECRET}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (opts.adminTools && cfg.ADMIN_TOOLS !== "true") {
    return new Response("Admin tools are off (set ADMIN_TOOLS=true temporarily)", { status: 403 });
  }
  return null;
}
