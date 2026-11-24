import { Redis } from "@upstash/redis";

/** A phone-number lead waiting to be (or being) delivered to staff on Telegram. */
export interface Lead {
  /** Stable id: same customer + same phone number → same id (used for de-duplication). */
  id: string;
  psid: string;
  phone: string;
  interest: string;
  preview: string;
  note?: string;
  createdAt: number;
}

export interface OutboxStats {
  pending: number;
  oldestCreatedAt: number | null;
}

/**
 * Durable state for the bot. Everything here must survive restarts and run across instances:
 * webhook de-duplication, the lead outbox (retry until Telegram accepts) and delivery locks.
 */
export interface LeadStore {
  /** True the first time a Messenger message id is seen; false for Meta's retries of the same message. */
  claimMessage(mid: string): Promise<boolean>;
  /** Persists a new lead into the outbox. False if this customer already left this number (no second alert). */
  addLead(lead: Lead): Promise<boolean>;
  /** Overwrites a pending lead (e.g. to add the licence interest). No-op once delivered. */
  updateLead(lead: Lead): Promise<void>;
  pendingLeads(limit: number): Promise<Lead[]>;
  /** Short exclusive lock so two instances never send the same lead at the same time. */
  lock(id: string, ttlSeconds: number): Promise<boolean>;
  unlock(id: string): Promise<void>;
  /** Removes the lead (and its phone number) from storage; only the de-duplication marker remains. */
  markDelivered(id: string): Promise<void>;
  stats(): Promise<OutboxStats>;
  ping(): Promise<boolean>;
}

/** Keep phone numbers no longer than needed; also the de-duplication window for the same customer + number. */
export const LEAD_TTL_SECONDS = 30 * 24 * 3600;
const MESSAGE_TTL_SECONDS = 2 * 24 * 3600;
const OUTBOX = "outbox";

// Atomic: mark this customer+number as seen AND enqueue the lead, or do nothing if already seen.
const ADD_LEAD_SCRIPT = `
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[3]) then
  redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[3])
  redis.call('ZADD', KEYS[3], ARGV[2], ARGV[4])
  return 1
end
return 0`;

export class RedisStore implements LeadStore {
  constructor(private readonly redis: Redis) {}

  static fromConfig(url: string, token: string): RedisStore {
    return new RedisStore(new Redis({ url, token }));
  }

  async claimMessage(mid: string): Promise<boolean> {
    return (await this.redis.set(`msg:${mid}`, 1, { nx: true, ex: MESSAGE_TTL_SECONDS })) === "OK";
  }

  async addLead(lead: Lead): Promise<boolean> {
    const res = await this.redis.eval(
      ADD_LEAD_SCRIPT,
      [`leadseen:${lead.id}`, `lead:${lead.id}`, OUTBOX],
      [JSON.stringify(lead), String(lead.createdAt), String(LEAD_TTL_SECONDS), lead.id],
    );
    return Number(res) === 1;
  }

  async updateLead(lead: Lead): Promise<void> {
    await this.redis.set(`lead:${lead.id}`, JSON.stringify(lead), { xx: true, keepTtl: true });
  }

  async pendingLeads(limit: number): Promise<Lead[]> {
    const ids = await this.redis.zrange<string[]>(OUTBOX, 0, limit - 1);
    if (!ids.length) return [];
    const rows = await this.redis.mget<(Lead | string | null)[]>(...ids.map((id) => `lead:${id}`));
    const leads: Lead[] = [];
    const expired: string[] = [];
    rows.forEach((row, i) => {
      const lead = typeof row === "string" ? (JSON.parse(row) as Lead) : row;
      if (lead && lead.id) leads.push(lead);
      else expired.push(ids[i]);
    });
    if (expired.length) await this.redis.zrem(OUTBOX, ...expired);
    return leads;
  }

  async lock(id: string, ttlSeconds: number): Promise<boolean> {
    return (await this.redis.set(`lock:${id}`, 1, { nx: true, ex: ttlSeconds })) === "OK";
  }

  async unlock(id: string): Promise<void> {
    await this.redis.del(`lock:${id}`);
  }

  async markDelivered(id: string): Promise<void> {
    const p = this.redis.pipeline();
    p.zrem(OUTBOX, id);
    p.del(`lead:${id}`);
    p.del(`lock:${id}`);
    await p.exec();
  }

  async stats(): Promise<OutboxStats> {
    const [pending, oldest] = await Promise.all([
      this.redis.zcard(OUTBOX),
      this.redis.zrange<(string | number)[]>(OUTBOX, 0, 0, { withScores: true }),
    ]);
    return { pending, oldestCreatedAt: oldest.length >= 2 ? Number(oldest[1]) : null };
  }

  async ping(): Promise<boolean> {
    return (await this.redis.ping()) === "PONG";
  }
}

/** In-process store: used by tests and as the emergency fallback if Redis is unreachable. */
export class MemoryStore implements LeadStore {
  private messages = new Map<string, number>();
  private seen = new Set<string>();
  private leads = new Map<string, Lead>();
  private locks = new Set<string>();

  async claimMessage(mid: string): Promise<boolean> {
    const now = Date.now();
    for (const [k, t] of this.messages) if (now - t > MESSAGE_TTL_SECONDS * 1000) this.messages.delete(k);
    if (this.messages.has(mid)) return false;
    this.messages.set(mid, now);
    return true;
  }
  async addLead(lead: Lead): Promise<boolean> {
    if (this.seen.has(lead.id)) return false;
    this.seen.add(lead.id);
    this.leads.set(lead.id, { ...lead });
    return true;
  }
  async updateLead(lead: Lead): Promise<void> {
    if (this.leads.has(lead.id)) this.leads.set(lead.id, { ...lead });
  }
  async pendingLeads(limit: number): Promise<Lead[]> {
    return [...this.leads.values()].sort((a, b) => a.createdAt - b.createdAt).slice(0, limit);
  }
  async lock(id: string): Promise<boolean> {
    if (this.locks.has(id)) return false;
    this.locks.add(id);
    return true;
  }
  async unlock(id: string): Promise<void> {
    this.locks.delete(id);
  }
  async markDelivered(id: string): Promise<void> {
    this.leads.delete(id);
    this.locks.delete(id);
  }
  async stats(): Promise<OutboxStats> {
    const all = [...this.leads.values()];
    return { pending: all.length, oldestCreatedAt: all.length ? Math.min(...all.map((l) => l.createdAt)) : null };
  }
  async ping(): Promise<boolean> {
    return true;
  }
}
