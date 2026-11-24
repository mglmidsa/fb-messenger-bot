import { createHmac } from "node:crypto";

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = "GraphError";
  }

  /** True when the token itself is no longer usable (expired, revoked, password changed). */
  get isAuthError(): boolean {
    return this.code === 190 || this.code === 102 || this.status === 401;
  }
}

type Params = Record<string, string | number | boolean | undefined>;

export interface GraphClientOptions {
  version: string;
  appSecret?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Minimal Graph API client. Tokens never go into URLs on POST requests. */
export class GraphClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: GraphClientOptions) {
    this.base = `https://graph.facebook.com/${opts.version}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  private proof(token: string): string | undefined {
    if (!this.opts.appSecret) return undefined;
    return createHmac("sha256", this.opts.appSecret).update(token).digest("hex");
  }

  private authParams(token: string): Record<string, string> {
    const p: Record<string, string> = { access_token: token };
    const proof = this.proof(token);
    if (proof) p.appsecret_proof = proof;
    return p;
  }

  async get<T = unknown>(path: string, token: string, params: Params = {}): Promise<T> {
    const url = new URL(`${this.base}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries({ ...params, ...this.authParams(token) })) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return this.send<T>(url, { method: "GET" });
  }

  async post<T = unknown>(path: string, token: string, params: Params = {}): Promise<T> {
    const url = new URL(`${this.base}/${path.replace(/^\//, "")}`);
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...this.authParams(token) })) {
      if (v !== undefined) body.set(k, String(v));
    }
    return this.send<T>(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  async delete<T = unknown>(path: string, token: string): Promise<T> {
    const url = new URL(`${this.base}/${path.replace(/^\//, "")}`);
    const body = new URLSearchParams(this.authParams(token));
    return this.send<T>(url, {
      method: "DELETE",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  private async send<T>(url: URL, init: RequestInit): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      throw new GraphError(`Network error calling Graph API: ${(e as Error).message}`, 0);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new GraphError(`Graph API returned non-JSON (HTTP ${res.status})`, res.status);
    }
    if (!res.ok || json?.error) {
      const e = json?.error ?? {};
      throw new GraphError(
        e.error_user_msg || e.message || `Graph API HTTP ${res.status}`,
        res.status,
        e.code,
        e.error_subcode,
        e.fbtrace_id,
      );
    }
    return json as T;
  }
}

/** Removes any access token that might appear in an error string before it is shown or logged. */
export function redact(s: string): string {
  return s.replace(/EAA[A-Za-z0-9]{10,}/g, "EAA***").replace(/access_token=[^&\s]+/g, "access_token=***");
}
