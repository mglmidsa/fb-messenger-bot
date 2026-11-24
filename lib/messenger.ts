import type { GraphClient } from "./graph";
import type { ChatTurn } from "./ai";

const MAX_LEN = 1900; // Messenger text limit is 2000 characters

/** Splits long text at sentence/line boundaries so each part fits Messenger's limit. */
export function splitMessage(text: string, max = MAX_LEN): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = Math.max(rest.lastIndexOf("\n", max), rest.lastIndexOf(". ", max) + 1);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export class Messenger {
  constructor(
    private readonly graph: GraphClient,
    private readonly pageId: string,
    private readonly token: string,
  ) {}

  async senderAction(psid: string, action: "typing_on" | "typing_off" | "mark_seen"): Promise<void> {
    await this.graph.post(`${this.pageId}/messages`, this.token, {
      recipient: JSON.stringify({ id: psid }),
      sender_action: action,
    });
  }

  /** Sends a reply within the 24-hour standard messaging window (messaging_type=RESPONSE). */
  async sendText(psid: string, text: string): Promise<void> {
    for (const part of splitMessage(text)) {
      await this.graph.post(`${this.pageId}/messages`, this.token, {
        recipient: JSON.stringify({ id: psid }),
        messaging_type: "RESPONSE",
        message: JSON.stringify({ text: part }),
      });
    }
  }

  /** Last messages of the conversation with this person, oldest first. Returns [] if unavailable. */
  async history(psid: string, limit = 10): Promise<ChatTurn[]> {
    const res: any = await this.graph.get(`${this.pageId}/conversations`, this.token, {
      platform: "messenger",
      user_id: psid,
      fields: `messages.limit(${limit}){message,from,created_time}`,
    });
    const msgs: any[] = res?.data?.[0]?.messages?.data ?? [];
    return msgs
      .filter((m) => typeof m?.message === "string" && m.message.trim())
      .map((m) => ({
        role: String(m?.from?.id) === this.pageId ? ("page" as const) : ("customer" as const),
        text: m.message.trim(),
      }))
      .reverse();
  }
}
