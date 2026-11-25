import { z } from "zod";

type Env = Record<string, string | undefined>;

function parse<T extends z.ZodType>(schema: T, env: Env): z.infer<T> {
  const res = schema.safeParse(env);
  if (!res.success) {
    const msg = res.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration — ${msg}`);
  }
  return res.data;
}

const secret16 = (name: string) => z.string().min(16, `${name}: use a random string of 16+ chars`);

const EnvSchema = z
  .object({
    PAGE_ID: z.string().regex(/^\d+$/, "PAGE_ID must be the numeric Page ID"),
    PAGE_ACCESS_TOKEN: z.string().min(20, "PAGE_ACCESS_TOKEN looks too short"),
    META_APP_SECRET: z.string().min(16, "META_APP_SECRET is required to verify webhook signatures"),
    WEBHOOK_VERIFY_TOKEN: secret16("WEBHOOK_VERIFY_TOKEN"),
    ANTHROPIC_API_KEY: z.string().min(20),
    CLAUDE_MODEL: z.string().default("claude-haiku-5-5"),
    GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
    BOT_ENABLED: z.enum(["true", "false"]).default("true"),
    BUSINESS_KNOWLEDGE: z.string().optional(),
    // Required: leads and handoffs are delivered ONLY through Telegram.
    TELEGRAM_BOT_TOKEN: z
      .string()
      .regex(/^\d+:[A-Za-z0-9_-]{20,}$/, "TELEGRAM_BOT_TOKEN is required (from @BotFather) — leads are sent there"),
    TELEGRAM_CHAT_ID: z
      .string()
      .regex(/^(-?\d+|@\w{5,})$/, "TELEGRAM_CHAT_ID is required (numeric chat ID, or @channel)"),
    CRON_SECRET: secret16("CRON_SECRET"),
    // Required: durable lead outbox + de-duplication. Vercel's Upstash integration sets KV_REST_API_*.
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),
    KV_REST_API_URL: z.string().url().optional(),
    KV_REST_API_TOKEN: z.string().min(10).optional(),
  })
  .transform((e, ctx) => {
    const REDIS_REST_URL = e.UPSTASH_REDIS_REST_URL ?? e.KV_REST_API_URL;
    const REDIS_REST_TOKEN = e.UPSTASH_REDIS_REST_TOKEN ?? e.KV_REST_API_TOKEN;
    if (!REDIS_REST_URL || !REDIS_REST_TOKEN) {
      ctx.addIssue({
        code: "custom",
        message: "Redis is required: connect Upstash Redis to the project (sets KV_REST_API_URL / KV_REST_API_TOKEN)",
      });
      return z.NEVER;
    }
    return { ...e, REDIS_REST_URL, REDIS_REST_TOKEN };
  });

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | undefined;

/** Full configuration for handling messages. Validates once; throws a readable error listing every problem. */
export function loadConfig(env: Env = process.env, useCache = true): AppConfig {
  if (useCache && cached) return cached;
  const cfg = parse(EnvSchema, env);
  if (useCache) cached = cfg;
  return cfg;
}

/** Only what Meta's one-time webhook verification needs, so it works before the other secrets are set. */
export function loadVerifyToken(env: Env = process.env): string {
  return parse(z.object({ WEBHOOK_VERIFY_TOKEN: secret16("WEBHOOK_VERIFY_TOKEN") }), env).WEBHOOK_VERIFY_TOKEN;
}

/** Setup/admin endpoints: protected by CRON_SECRET; admin tools additionally need ADMIN_TOOLS=true. */
export function loadAdminConfig(env: Env = process.env) {
  return parse(
    z.object({
      CRON_SECRET: secret16("CRON_SECRET"),
      ADMIN_TOOLS: z.enum(["true", "false"]).default("false"),
      TELEGRAM_BOT_TOKEN: z.string().optional(),
    }),
    env,
  );
}

const REQUIRED_KEYS = [
  "PAGE_ID",
  "PAGE_ACCESS_TOKEN",
  "META_APP_SECRET",
  "WEBHOOK_VERIFY_TOKEN",
  "ANTHROPIC_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "CRON_SECRET",
] as const;

export interface ConfigReport {
  /** Required variables that are not set at all. */
  missing: string[];
  redisConnected: boolean;
  /** True when the full configuration validates (the bot can handle messages). */
  valid: boolean;
  /** Validation messages; they name variables but never contain their values. */
  problems: string[];
}

/** Which configuration is present, without revealing any value. Used by /api/setup/status. */
export function configReport(env: Env = process.env): ConfigReport {
  const missing = REQUIRED_KEYS.filter((k) => !env[k]?.trim());
  const redisConnected = Boolean(
    (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) && (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN),
  );
  try {
    loadConfig(env, false);
    return { missing, redisConnected, valid: true, problems: [] };
  } catch (e) {
    const problems = (e as Error).message.replace(/^Invalid configuration — /, "").split("; ");
    return { missing, redisConnected, valid: false, problems };
  }
}
