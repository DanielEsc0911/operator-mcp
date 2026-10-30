import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Streams } from "./cli.js";
import { OpenProjectClient } from "./client.js";
import { detectClients, selfCommand, serverName } from "./clients.js";
import { type Config, loadConfig, profileDir, resolveProfile } from "./config.js";
import { humanMessage } from "./errors.js";
import { t } from "./i18n/index.js";
import { checkLine, lamp, style, tilde, type Output } from "./ui.js";

export type Check = { ok: boolean; line: string; next?: string };

const pass = (line: string): Check => ({ ok: true, line });
const fail = (line: string, next: string): Check => ({ ok: false, line, next });

function configFileCheck(config: Config, env: NodeJS.ProcessEnv, flag: string, home: string): Check {
  const path = join(profileDir(config.profile), "config.json");
  const shown = tilde(path, home);
  if (!existsSync(path)) {
    if (env.OPENPROJECT_URL && env.OPENPROJECT_API_KEY) return pass(t().fromEnvironment);
    return fail(t().noConfigFile(shown), t().run(`${selfCommand()} setup${flag}`));
  }
  if (process.platform !== "win32" && statSync(path).mode & 0o077) {
    return fail(t().sharedFile(shown), t().run(`chmod 600 ${shown}`));
  }
  if (!config.url || !config.apiKey) return fail(t().incomplete(shown), t().run(`${selfCommand()} setup${flag}`));
  return pass(t().configFile(shown));
}

async function reachableCheck(url: string): Promise<Check> {
  try {
    await fetch(new URL(`${url}/api/v3`), { signal: AbortSignal.timeout(10_000) });
    return pass(t().reachable(url));
  } catch {
    return fail(t().unreachable(url), t().checkNetwork);
  }
}

async function keyCheck(config: Config, flag: string): Promise<Check> {
  try {
    const identity = await new OpenProjectClient(config).me();
    return pass(t().keyAccepted(`${identity.name} (${identity.email})`));
  } catch (error) {
    return fail(humanMessage(error), t().thenRun(`${selfCommand()} setup${flag}`));
  }
}

function clientChecks(home: string, profile: string, flag: string): Check[] {
  const name = serverName(profile);
  return detectClients(home).map((client) => {
    const command = client.entry(home, name);
    if (command) return pass(t().agentRuns(client.label, tilde(command.join(" "), home)));
    return fail(t().agentMissing(client.label, name), t().run(`${selfCommand()} install${flag}`));
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
  const checks = await lamp(out, s, t().lineTest, t().lineTestDetail, work);
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
  out.write(`\n  ${s.bold(s.accent("OPerator"))}  ${s.muted(t().doctorTitle(resolveProfile(argv, env)))}\n\n`);
  const healthy = await printChecks(out, doctorChecks(argv, env, home));
  out.write("\n");
  return healthy ? 0 : 1;
}
