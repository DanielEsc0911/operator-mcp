import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Config = {
  profile: string;
  url: string;
  apiKey: string;
  defaultProject?: string;
  conventionsPath: string;
  readOnly: boolean;
  allowDelete: boolean;
};

type StoredConfig = {
  url?: string;
  apiKey?: string;
  defaultProject?: string;
};

const PROFILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

function withoutSecrets(raw: string): string {
  if (!URL.canParse(raw)) return raw;
  const url = new URL(raw);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function normalizeUrl(raw: string): string {
  return withoutSecrets(raw.trim()).replace(/\/+$/, "").replace(/\/api\/v3$/, "");
}

export function assertSecureUrl(url: string, env: NodeJS.ProcessEnv): void {
  if (!url.startsWith("http://") || env.OPENPROJECT_ALLOW_INSECURE_HTTP === "1") return;
  if (LOOPBACK.includes(new URL(url).hostname)) return;
  throw new Error(
    `Refusing ${url}: the API key would travel unencrypted. Use the https:// address, or set OPENPROJECT_ALLOW_INSECURE_HTTP=1 if this network is trusted.`,
  );
}

export function configHome(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (platform === "win32" && env.APPDATA) return join(env.APPDATA, "operator-mcp");
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "operator-mcp");
}

export function profileDir(profile: string): string {
  return join(configHome(), profile);
}

export function resolveProfile(argv: string[], env: NodeJS.ProcessEnv): string {
  const flag = argv.indexOf("--profile");
  const profile = flag !== -1 && argv[flag + 1] ? argv[flag + 1] : env.OPENPROJECT_PROFILE || "default";
  if (!PROFILE_NAME.test(profile)) {
    throw new Error(
      `Invalid profile name "${profile}". Use letters, digits, ".", "_" or "-", starting with a letter or digit, at most 64 characters.`,
    );
  }
  return profile;
}

function warnIfShared(path: string): void {
  if (process.platform === "win32" || (statSync(path).mode & 0o077) === 0) return;
  process.stderr.write(`operator-mcp: ${path} is readable by other users. Run: chmod 600 ${path}\n`);
}

function readStored(profile: string): StoredConfig {
  const path = join(profileDir(profile), "config.json");
  if (!existsSync(path)) return {};
  warnIfShared(path);
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
  const url = normalizeUrl(env.OPENPROJECT_URL ?? stored.url ?? "");
  assertSecureUrl(url, env);
  return {
    profile,
    url,
    apiKey: env.OPENPROJECT_API_KEY ?? stored.apiKey ?? "",
    defaultProject: env.OPENPROJECT_DEFAULT_PROJECT ?? stored.defaultProject,
    conventionsPath: env.OPENPROJECT_CONVENTIONS_PATH ?? join(profileDir(profile), "conventions.md"),
    readOnly: readOnly === "1" || readOnly === "true",
    allowDelete: env.OPENPROJECT_ALLOW_DELETE === "1",
  };
}

export function saveConfig(profile: string, data: StoredConfig): string {
  const dir = profileDir(profile);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "config.json");
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  return path;
}
