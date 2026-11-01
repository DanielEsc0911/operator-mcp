import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Streams } from "./cli.js";
import { OpenProjectClient } from "./client.js";
import { detectClients, type Runner } from "./clients.js";
import { selfCommand, serverName } from "./serverCommand.js";
import { type Config, loadConfig, profileDir } from "./config.js";
import { flagValue } from "./flags.js";
import { humanMessage, networkReason } from "./errors.js";
import { t } from "./i18n/index.js";
import { spawnRunner } from "./install.js";
import { checkLine, lamp, style, tilde, type Output } from "./ui.js";

export type Check = { ok: boolean; line: string; next?: string };

const pass = (line: string): Check => ({ ok: true, line });
const fail = (line: string, next: string): Check => ({ ok: false, line, next });

const profileFlag = (profile: string) => (profile === "default" ? "" : ` --profile ${profile}`);
const requestedProfile = (argv: string[], env: NodeJS.ProcessEnv) =>
  flagValue(argv, "--profile") || env.OPENPROJECT_PROFILE || "default";

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
    // The doctor pings the operator-configured OpenProject URL, so the request destination is
    // the operator's own server rather than an authenticated or attacker-controlled sink.
    const response = await fetch(new URL(`${url}/api/v3`), { signal: AbortSignal.timeout(10_000) }); // lgtm[js/request-forgery]
    const root = await response.json().catch(() => null);
    if (root?._type !== "Root" && root?._type !== "Error") return fail(t().unreachable(url, t().notOpenProject(response.status)), t().checkNetwork);
    return pass(t().reachable(url));
  } catch (error) {
    return fail(t().unreachable(url, networkReason(error)), t().checkNetwork);
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

function clientChecks(home: string, profile: string, flag: string, run: Runner): Check[] {
  const name = serverName(profile);
  return detectClients(home).map((client) => {
    const command = client.entry(home, name, run);
    if (command) return pass(t().agentRuns(client.label, tilde(command.join(" "), home)));
    return fail(t().agentMissing(client.label, name), t().run(`${selfCommand()} install${flag}`));
  });
}

async function connectionChecks(config: Config, flag: string): Promise<Check[]> {
  const reachable = await reachableCheck(config.url);
  return reachable.ok ? [reachable, await keyCheck(config, flag)] : [reachable];
}

export async function doctorChecks(argv: string[], env: NodeJS.ProcessEnv, home: string, run: Runner = spawnRunner()): Promise<Check[]> {
  let config: Config;
  try {
    config = loadConfig(argv, env);
  } catch (error) {
    return [fail(humanMessage(error), t().run(`${selfCommand()} setup${profileFlag(requestedProfile(argv, env))}`))];
  }
  const flag = profileFlag(config.profile);
  const configured = Boolean(config.url && config.apiKey);
  return [
    configFileCheck(config, env, flag, home),
    ...(configured ? await connectionChecks(config, flag) : []),
    ...clientChecks(home, config.profile, flag, run),
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
  run: Runner = spawnRunner(),
): Promise<number> {
  const out = streams.stdout;
  const s = style(out);
  out.write(`\n  ${s.bold(s.accent("OPerator"))}  ${s.muted(t().doctorTitle(requestedProfile(argv, env)))}\n\n`);
  const healthy = await printChecks(out, doctorChecks(argv, env, home, run));
  out.write("\n");
  return healthy ? 0 : 1;
}
