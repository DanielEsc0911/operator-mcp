import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { OpenProjectClient, type Identity } from "./client.js";
import { normalizeUrl, profileDir } from "./config.js";
import { STARTER_MANUAL } from "./conventions.js";

export type Credentials = { url: string; apiKey: string };
export type Project = { name: string; identifier: string };
export type Verified = { identity: Identity; projectCount: number; projects: Project[] };

const PICKER_SIZE = 9;

export async function verifyCredentials(url: string, apiKey: string): Promise<Verified> {
  const client = new OpenProjectClient({
    profile: "setup", url, apiKey, conventionsPath: "", readOnly: false, allowDelete: false,
  });
  const identity = await client.me();
  const { total, elements } = await client.collection("/projects", { pageSize: PICKER_SIZE });
  const projects = elements.map((project) => ({ name: String(project.name), identifier: String(project.identifier) }));
  return { identity, projectCount: total, projects };
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
  return `Make one at ${url}/my/access_tokens\n  (older instances: My account → Access token). It stays on this machine.`;
}

export function describeExisting(profile: string): string | null {
  const path = join(profileDir(profile), "config.json");
  if (!existsSync(path)) return null;
  const stored = JSON.parse(readFileSync(path, "utf8")) as Partial<Credentials>;
  return `${stored.url ?? "(no url)"}, key ${stored.apiKey ? maskKey(stored.apiKey) : "(none)"}`;
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function nonInteractiveInput(argv: string[], env: NodeJS.ProcessEnv): Credentials {
  const url = flagValue(argv, "--url") ?? env.OPENPROJECT_URL;
  if (!url) throw new Error("Non-interactive setup needs --url or OPENPROJECT_URL.");
  const apiKey = env.OPENPROJECT_API_KEY?.trim();
  if (!apiKey) throw new Error("Non-interactive setup reads the key from OPENPROJECT_API_KEY; set it and retry.");
  return { url: normalizeUrl(url), apiKey };
}
