import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Streams } from "./cli.js";
import { OpenProjectClient } from "./client.js";
import { detectClients, selfCommand, serverName } from "./clients.js";
import { type Config, loadConfig, profileDir, resolveProfile } from "./config.js";
import { humanMessage } from "./errors.js";
import { checkLine, lamp, style, tilde, type Output } from "./ui.js";

export type Check = { ok: boolean; line: string; next?: string };

const pass = (line: string): Check => ({ ok: true, line });
const fail = (line: string, next: string): Check => ({ ok: false, line, next });

function configFileCheck(config: Config, env: NodeJS.ProcessEnv, flag: string, home: string): Check {
  const path = join(profileDir(config.profile), "config.json");
  const shown = tilde(path, home);
  if (!existsSync(path)) {
    if (env.OPENPROJECT_URL && env.OPENPROJECT_API_KEY) return pass("URL and key from the environment");
    return fail(`No config file at ${shown}`, `Run: ${selfCommand()} setup${flag}`);
  }
  if (process.platform !== "win32" && statSync(path).mode & 0o077) {
    return fail(`Config file ${shown} is readable by other users`, `Run: chmod 600 ${shown}`);
  }
  if (!config.url || !config.apiKey) return fail(`${shown} has no URL or API key`, `Run: ${selfCommand()} setup${flag}`);
  return pass(`Config file ${shown}`);
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
    return fail(humanMessage(error), `Then run: ${selfCommand()} setup${flag}`);
  }
}

function clientChecks(home: string, profile: string, flag: string): Check[] {
  const name = serverName(profile);
  return detectClients(home).map((client) => {
    const command = client.entry(home, name);
    if (command) return pass(`${client.label} runs: ${tilde(command.join(" "), home)}`);
    return fail(`${client.label} has no "${name}" entry`, `Run: ${selfCommand()} install${flag}`);
  });
}

async function connectionChecks(config: Config, flag: string): Promise<Check[]> {
  const reachable = await reachableCheck(config.url);
  return reachable.ok ? [reachable, await keyCheck(config, flag)] : [reachable];
}

export async function doctorChecks(argv: string[], env: NodeJS.ProcessEnv, home: string): Promise<Check[]> {
  const config = loadConfig(argv, env);
  const flag = config.profile === "default" ? "" : ` --profile ${config.profile}`;
  const configured = Boolean(config.url && config.apiKey);
  return [
    configFileCheck(config, env, flag, home),
    ...(configured ? await connectionChecks(config, flag) : []),
    ...clientChecks(home, config.profile, flag),
  ];
}

export async function printChecks(out: Output, work: Promise<Check[]>): Promise<boolean> {
  const s = style(out);
  const checks = await lamp(out, s, "Line test", "running the doctor's checks", work);
  for (const { ok, line, next } of checks) checkLine(out, s, ok, line, next);
  return checks.every((check) => check.ok);
}

export async function runDoctor(
  argv: string[],
  streams: Streams,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): Promise<number> {
  const out = streams.stdout;
  const s = style(out);
  out.write(`\n  ${s.bold(s.accent("OPerator"))}  ${s.muted(`doctor · profile ${resolveProfile(argv, env)}`)}\n\n`);
  const healthy = await printChecks(out, doctorChecks(argv, env, home));
  out.write("\n");
  return healthy ? 0 : 1;
}
