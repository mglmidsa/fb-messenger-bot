import { loadConfig, type AppConfig } from "./config";
import { GraphClient } from "./graph";
import { Messenger } from "./messenger";
import { decideReply } from "./ai";
import { getKnowledge } from "./knowledge";
import { notifyOwner } from "./notify";
import type { BotDeps } from "./bot";

/** Wires real implementations into the bot. Kept separate so the bot logic stays testable. */
export function createRuntime(cfg: AppConfig = loadConfig()) {
  const graph = new GraphClient({ version: cfg.GRAPH_API_VERSION, appSecret: cfg.META_APP_SECRET });
  const messenger = new Messenger(graph, cfg.PAGE_ID, cfg.PAGE_ACCESS_TOKEN);
  const notify = (text: string) => notifyOwner(cfg, text);
  const deps: BotDeps = {
    enabled: cfg.BOT_ENABLED === "true",
    knowledge: getKnowledge(cfg.BUSINESS_KNOWLEDGE),
    sendText: (psid, text) => messenger.sendText(psid, text),
    senderAction: (psid, action) => messenger.senderAction(psid, action),
    history: (psid) => messenger.history(psid),
    decide: (knowledge, history, latest) =>
      decideReply({ apiKey: cfg.ANTHROPIC_API_KEY, model: cfg.CLAUDE_MODEL }, knowledge, history, latest),
    notify,
    log: (m) => console.log(`[bot] ${m}`),
  };
  return { cfg, graph, messenger, deps, notify };
}
