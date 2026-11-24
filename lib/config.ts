import { z } from "zod";

const EnvSchema = z.object({
  PAGE_ID: z.string().regex(/^\d+$/, "PAGE_ID must be the numeric Page ID"),
  PAGE_ACCESS_TOKEN: z.string().min(20, "PAGE_ACCESS_TOKEN looks too short"),
  META_APP_SECRET: z.string().min(16, "META_APP_SECRET is required to verify webhook signatures"),
  WEBHOOK_VERIFY_TOKEN: z.string().min(16, "WEBHOOK_VERIFY_TOKEN: use a random string of 16+ chars"),
  ANTHROPIC_API_KEY: z.string().min(20),
  CLAUDE_MODEL: z.string().default("claude-haiku-5-5"),
  GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  BOT_ENABLED: z.enum(["true", "false"]).default("true"),
  BUSINESS_KNOWLEDGE: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | undefined;

/** Validates all environment variables once; throws a readable error listing every problem. */
export function loadConfig(env: Record<string, string | undefined> = process.env, useCache = true): AppConfig {
  if (useCache && cached) return cached;
  const res = EnvSchema.safeParse(env);
  if (!res.success) {
    const msg = res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration — ${msg}`);
  }
  if (useCache) cached = res.data;
  return res.data;
}
