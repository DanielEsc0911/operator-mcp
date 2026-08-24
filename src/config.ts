import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Config = {
  profile: string;
  url: string;
  apiKey: string;
  defaultProject?: string;
  conventionsPath: string;
  readOnly: boolean;
};

type StoredConfig = {
  url?: string;
  apiKey?: string;
  defaultProject?: string;
};

export function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/api\/v3$/, "");
}

export function profileDir(profile: string): string {
  return join(homedir(), ".config", "operator-mcp", profile);
}

export function resolveProfile(argv: string[], env: NodeJS.ProcessEnv): string {
  const flag = argv.indexOf("--profile");
  if (flag !== -1 && argv[flag + 1]) return argv[flag + 1];
  return env.OPENPROJECT_PROFILE || "default";
}

function readStored(profile: string): StoredConfig {
  const path = join(profileDir(profile), "config.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

export function loadConfig(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): Config {
  const profile = resolveProfile(argv, env);
  const stored = readStored(profile);
  const readOnly = env.OPENPROJECT_READ_ONLY;
  return {
    profile,
    url: normalizeUrl(env.OPENPROJECT_URL ?? stored.url ?? ""),
    apiKey: env.OPENPROJECT_API_KEY ?? stored.apiKey ?? "",
    defaultProject: env.OPENPROJECT_DEFAULT_PROJECT ?? stored.defaultProject,
    conventionsPath: env.OPENPROJECT_CONVENTIONS_PATH ?? join(profileDir(profile), "conventions.md"),
    readOnly: readOnly === "1" || readOnly === "true",
  };
}

export function saveConfig(profile: string, data: StoredConfig): string {
  const dir = profileDir(profile);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "config.json");
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  return path;
}
