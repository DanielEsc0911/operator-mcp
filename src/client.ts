import type { Config } from "./config.js";
import { ConfigError, OpenProjectError, ReadOnlyError, describeHttpError } from "./errors.js";
import type { HalResource } from "./hal.js";

export type Filter = Record<string, { operator: string; values: string[] }>;
export type Collection = { total: number; count: number; elements: HalResource[] };
export type Identity = { id: number; name: string; email: string };

const TIMEOUT_MS = 30_000;

export class OpenProjectClient {
  #identity?: Identity;

  constructor(readonly config: Config) {}

  async request(
    method: string,
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<any> {
    if (!this.config.url || !this.config.apiKey) throw new ConfigError();
    if (this.config.readOnly && method !== "GET") throw new ReadOnlyError();

    const url = new URL(`/api/v3${path}`, this.config.url);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`Cannot reach ${this.config.url}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new OpenProjectError(response.status, describeHttpError(response.status, this.config.url, payload));
    return payload;
  }

  async collection(
    path: string,
    params: { filters?: Filter[]; pageSize?: number; offset?: number; sortBy?: [string, string][] } = {},
  ): Promise<Collection> {
    const body = await this.request("GET", path, {
      query: {
        filters: params.filters?.length ? JSON.stringify(params.filters) : undefined,
        sortBy: params.sortBy?.length ? JSON.stringify(params.sortBy) : undefined,
        pageSize: params.pageSize,
        // OpenProject's `offset` is a 1-based page number, not a record offset.
        offset: params.offset,
      },
    });
    return { total: body?.total ?? 0, count: body?.count ?? 0, elements: body?._embedded?.elements ?? [] };
  }

  async me(): Promise<Identity> {
    if (!this.#identity) {
      const user = await this.request("GET", "/users/me");
      this.#identity = { id: user.id, name: user.name, email: user.email };
    }
    return this.#identity;
  }
}
