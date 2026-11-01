import type { Config } from "./config.js";
import { ConfigError, OpenProjectError, ReadOnlyError, UnexpectedResponseError, describeHttpError, networkReason } from "./errors.js";
import type { HalResource } from "./hal.js";

export type Filter = Record<string, { operator: string; values: string[] }>;
export type Collection = {
  total: number;
  count: number;
  elements: HalResource[];
  groups?: { value: string; count: number }[];
};
export type Identity = { id: number; name: string; email: string };

const TIMEOUT_MS = 30_000;
const PAGE_SIZE = 100;
const MAX_COLLECTED = 2_000;

export function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export class OpenProjectClient {
  #identity?: Identity;

  constructor(readonly config: Config) {}

  async request(
    method: string,
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<any> {
    if (!this.config.url || !this.config.apiKey) throw new ConfigError();
    const root = `${this.config.url}/api/v3`;
    const url = new URL(`${root}${path}`);
    if (!url.href.startsWith(`${root}/`)) {
      throw new Error(`Refusing a request outside ${root}. Pass a path relative to /api/v3, like /work_packages/12.`);
    }
    // OpenProject validates through POST .../form and writes nothing, so read-only mode lets it pass.
    if (this.config.readOnly && method !== "GET" && !(method === "POST" && url.pathname.endsWith("/form"))) throw new ReadOnlyError();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    // An OpenProject personal API key authenticates over HTTP Basic with the
    // literal username "apikey". Bearer is OAuth2 access tokens only, and a
    // personal key sent that way is rejected as unauthenticated.
    const credentials = Buffer.from(`apikey:${this.config.apiKey}`).toString("base64");

    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method,
        headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      text = await response.text();
    } catch (error) {
      const reason = networkReason(error);
      if (method === "GET") throw new Error(`Cannot reach ${this.config.url}: ${reason}`);
      throw new UnexpectedResponseError(method, `The request to ${this.config.url} failed before a full answer arrived (${reason}).`);
    }

    if (!response.ok) {
      throw new OpenProjectError(response.status, describeHttpError(response.status, this.config.url, parseJson(text)));
    }
    if (!text.trim()) return null;
    const payload = parseJson(text);
    if (payload === undefined) {
      const type = response.headers.get("content-type") ?? "";
      const detail = /html|^$/i.test(type)
        ? "The server answered with a non-JSON page (proxy or login page?)."
        : `${path} is not a JSON resource (content-type ${type}); api_request only handles JSON.`;
      throw new UnexpectedResponseError(method, detail);
    }
    return payload;
  }

  async collection(
    path: string,
    params: { filters?: Filter[]; pageSize?: number; offset?: number; sortBy?: [string, string][]; groupBy?: string } = {},
  ): Promise<Collection> {
    const body = await this.request("GET", path, {
      query: {
        filters: params.filters?.length ? JSON.stringify(params.filters) : undefined,
        sortBy: params.sortBy?.length ? JSON.stringify(params.sortBy) : undefined,
        groupBy: params.groupBy,
        pageSize: params.pageSize,
        // OpenProject's `offset` is a 1-based page number, not a record offset.
        offset: params.offset,
      },
    });
    return { total: body?.total ?? 0, count: body?.count ?? 0, elements: body?._embedded?.elements ?? [], groups: body?.groups };
  }

  async collectAll(
    path: string,
    params: { filters?: Filter[] } = {},
  ): Promise<Collection & { truncated: boolean }> {
    const elements: HalResource[] = [];
    let total = 0;
    for (let page = 1; elements.length < MAX_COLLECTED; page++) {
      const batch = await this.collection(path, { ...params, pageSize: PAGE_SIZE, offset: page });
      total = batch.total;
      elements.push(...batch.elements);
      if (!batch.elements.length || elements.length >= total) break;
    }
    return { total, count: elements.length, elements, truncated: elements.length < total };
  }

  async me(): Promise<Identity> {
    if (!this.#identity) {
      const user = await this.request("GET", "/users/me");
      this.#identity = { id: user.id, name: user.name, email: user.email };
    }
    return this.#identity;
  }
}
