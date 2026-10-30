import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Streams } from "./cli.js";
import { OpenProjectClient } from "./client.js";
import { detectClients, serverName } from "./clients.js";
import { type Config, loadConfig, profileDir } from "./config.js";
import { humanMessage } from "./errors.js";

type Check = { ok: boolean; line: string };

const pass = (line: string): Check => ({ ok: true, line });
const fail = (line: string, next: string): Check => ({ ok: false, line: `${line}\n      → ${next}` });

function configFileCheck(config: Config, env: NodeJS.ProcessEnv, flag: string): Check {
  const path = join(profileDir(config.profile), "config.json");
  if (!existsSync(path)) {
    if (env.OPENPROJECT_URL && env.OPENPROJECT_API_KEY) return pass("URL and key from the environment");
    return fail(`No config file at ${path}`, `Run: npx operator-mcp setup${flag}`);
  }
  if (process.platform !== "win32" && statSync(path).mode & 0o077) {
    return fail(`Config file ${path} is readable by other users`, `Run: chmod 600 ${path}`);
  }
  if (!config.url || !config.apiKey) return fail(`${path} has no URL or API key`, `Run: npx operator-mcp setup${flag}`);
  return pass(`Config file ${path}`);
}

async function reachableCheck(url: string): Promise<Check> {
  try {
    await fetch(new URL(`${url}/api/v3`), { signal: AbortSignal.timeout(10_000) });
    return pass(`${url} is reachable`);
  } catch {
    return fail(`Cannot reach ${url}`, "Check the URL and your network, then run doctor again");
  }
}

async function keyCheck(config: Config, flag: string): Promise<Check> {
  try {
    const identity = await new OpenProjectClient(config).me();
    return pass(`API key accepted — ${identity.name} (${identity.email})`);
  } catch (error) {
    return fail(humanMessage(error), `Then run: npx operator-mcp setup${flag}`);
  }
}

function clientChecks(home: string, profile: string, flag: string): Check[] {
  const name = serverName(profile);
  return detectClients(home).map((client) => {
    const command = client.entry(home, name);
    if (command) return pass(`${client.label} runs: ${command.join(" ")}`);
    return fail(`${client.label} has no "${name}" entry`, `Run: npx operator-mcp install${flag}`);
  });
}

async function connectionChecks(config: Config, flag: string): Promise<Check[]> {
  const reachable = await reachableCheck(config.url);
  return reachable.ok ? [reachable, await keyCheck(config, flag)] : [reachable];
}

export async function runDoctor(
  argv: string[],
  streams: Streams,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): Promise<number> {
  const config = loadConfig(argv, env);
  const flag = config.profile === "default" ? "" : ` --profile ${config.profile}`;
  const file = configFileCheck(config, env, flag);
  const configured = Boolean(config.url && config.apiKey);
  const checks = [
    file,
    ...(configured ? await connectionChecks(config, flag) : []),
    ...clientChecks(home, config.profile, flag),
  ];

  streams.stdout.write(`\n  OPerator doctor — profile "${config.profile}"\n\n`);
  for (const { ok, line } of checks) streams.stdout.write(`  ${ok ? "✓" : "✗"} ${line}\n`);
  streams.stdout.write("\n");
  return checks.every((check) => check.ok) ? 0 : 1;
}
