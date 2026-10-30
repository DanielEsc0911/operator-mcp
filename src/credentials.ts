import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { OpenProjectClient, type Filter, type Identity } from "./client.js";
import { normalizeUrl, profileDir } from "./config.js";
import { STARTER_MANUAL } from "./conventions.js";
import { t } from "./i18n/index.js";

export type Credentials = { url: string; apiKey: string };
export type Project = { name: string; identifier: string };
export type Verified = { identity: Identity; projectCount: number };
export type ProjectPage = { total: number; projects: Project[] };

const PICKER_SIZE = 7;

const setupClient = ({ url, apiKey }: Credentials) =>
  new OpenProjectClient({ profile: "setup", url, apiKey, conventionsPath: "", readOnly: false, allowDelete: false });

export async function verifyCredentials(url: string, apiKey: string): Promise<Verified> {
  const client = setupClient({ url, apiKey });
  const identity = await client.me();
  const { total } = await client.collection("/projects", { pageSize: 1 });
  return { identity, projectCount: total };
}

export function writableProjects(credentials: Credentials): (query: string) => Promise<ProjectPage> {
  const client = setupClient(credentials);
  return async (query) => {
    const filters: Filter[] = [{ user_action: { operator: "=", values: ["work_packages/create"] } }];
    if (query.trim()) filters.push({ name_and_identifier: { operator: "~", values: [query.trim()] } });
    const { total, elements } = await client.collection("/projects", { filters, pageSize: PICKER_SIZE });
    return { total, projects: elements.map((project) => ({ name: String(project.name), identifier: String(project.identifier) })) };
  };
}

export function scaffoldConventions(path: string): string | null {
  if (existsSync(path)) return null;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, STARTER_MANUAL, { mode: 0o600 });
  return path;
}

export function maskKey(apiKey: string): string {
  return apiKey.length > 8 ? `…${apiKey.slice(-4)}` : "…";
}

export function keyHint(url: string): string {
  return t().keyHint(url);
}

export function storedCredentials(profile: string): Partial<Credentials> | null {
  const path = join(profileDir(profile), "config.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<Credentials>;
  } catch {
    return {};
  }
}

export function describeExisting(profile: string): string | null {
  const stored = storedCredentials(profile);
  if (!stored) return null;
  return `${stored.url ?? "—"} · ${stored.apiKey ? maskKey(stored.apiKey) : "—"}`;
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function nonInteractiveInput(argv: string[], env: NodeJS.ProcessEnv): Credentials {
  const url = flagValue(argv, "--url") ?? env.OPENPROJECT_URL;
  if (!url) throw new Error(t().needUrl);
  const apiKey = env.OPENPROJECT_API_KEY?.trim();
  if (!apiKey) throw new Error(t().needKey);
  return { url: normalizeUrl(url), apiKey };
}
