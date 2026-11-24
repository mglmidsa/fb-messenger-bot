import { loadConfig, type AppConfig } from "./config";
import { GraphClient } from "./graph";
import { Messenger } from "./messenger";
import { createClaudeClient, decideReply } from "./ai";
import { getKnowledge } from "./knowledge";
import { notifyOwner, sendTelegram } from "./notify";
import { RedisStore } from "./store";
import type { BotDeps } from "./bot";

/** Wires real implementations into the bot. Kept separate so the bot logic stays testable. */
export function createRuntime(cfg: AppConfig = loadConfig()) {
  const graph = new GraphClient({ version: cfg.GRAPH_API_VERSION, appSecret: cfg.META_APP_SECRET });
  const messenger = new Messenger(graph, cfg.PAGE_ID, cfg.PAGE_ACCESS_TOKEN);
  const claude = createClaudeClient(cfg.ANTHROPIC_API_KEY);
  const store = RedisStore.fromConfig(cfg.REDIS_REST_URL, cfg.REDIS_REST_TOKEN);
  const notify = (text: string) => notifyOwner(cfg, text);
  const sendLead = (text: string) => sendTelegram(cfg, text);
  const log = (m: string) => console.log(`[bot] ${m}`);
  const knowledge = getKnowledge(cfg.BUSINESS_KNOWLEDGE);
  const decide: BotDeps["decide"] = (k, history, latest, phone) =>
    decideReply(claude, { model: cfg.CLAUDE_MODEL }, k, history, latest, phone);
  const deps: BotDeps = {
    enabled: cfg.BOT_ENABLED === "true",
    knowledge,
    store,
    sendText: (psid, text) => messenger.sendText(psid, text),
    senderAction: (psid, action) => messenger.senderAction(psid, action),
    history: (psid) => messenger.history(psid),
    decide,
    notify,
    sendLead,
    log,
  };
  return { cfg, graph, messenger, store, deps, notify, sendLead, log, knowledge, decide };
}
