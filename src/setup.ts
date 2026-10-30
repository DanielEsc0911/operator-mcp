import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import type { Streams } from "./cli.js";
import type { Client } from "./clients.js";
import { assertSecureUrl, normalizeUrl, profileDir, resolveProfile, saveConfig } from "./config.js";
import { describeExisting, keyHint, nonInteractiveInput, scaffoldConventions, storedCredentials, verifyCredentials } from "./credentials.js";
import type { Credentials, Verified } from "./credentials.js";
import { doctorChecks, printChecks } from "./doctor.js";
import { humanMessage } from "./errors.js";
import { t } from "./i18n/index.js";
import { patchAgents } from "./install.js";
import { outro } from "./outro.js";
import { SetupAborted, ask, askHidden, choose } from "./prompts.js";
import { canSelect, select } from "./select.js";
import { version } from "./server.js";
import { greet, lamp, step, style, tilde, type Output, type Style } from "./ui.js";

type Line = { out: Output; s: Style };
type Connection = Credentials & Verified;

async function verified({ url, apiKey }: Credentials, { out, s }: Line): Promise<Connection> {
  assertSecureUrl(url, process.env);
  const result = await lamp(out, s, t().lineCheck, new URL(url).host, verifyCredentials(url, apiKey));
  const { identity, projectCount } = result;
  step(out, s, t().lineOpen, t().done, t().lineOpenDetail(`${identity.name} (${identity.email})`, projectCount));
  return { url, apiKey, ...result };
}

async function promptCredentials(rl: Interface, streams: Streams, line: Line): Promise<Connection> {
  const { out, s } = line;
  for (;;) {
    try {
      out.write(`  ${s.bold(t().urlQuestion)} ${s.muted(t().urlExample)}\n`);
      const url = normalizeUrl(await ask(rl, "  › "));
      if (!url) throw new Error(t().urlRequired);
      out.write(`\n  ${s.bold(t().keyQuestion)} ${keyHint(url)}\n`);
      const apiKey = await askHidden(rl, "  › ", streams.stdin, out);
      out.write("\n");
      return await verified({ url, apiKey }, line);
    } catch (error) {
      if (error instanceof SetupAborted) throw error;
      step(out, s, t().lineCheck, t().fail, humanMessage(error));
      if (/^n/i.test(await ask(rl, `\n  ${t().tryAgain}`))) throw new SetupAborted();
      out.write("\n");
    }
  }
}

async function keptConnection(profile: string, rl: Interface, line: Line): Promise<Connection | null> {
  const stored = storedCredentials(profile);
  if (!stored) return null;
  line.out.write(`  ${line.s.bold(t().existing)} ${describeExisting(profile)}\n`);
  if (/^n/i.test(await ask(rl, `  ${t().keepIt}`))) return (line.out.write("\n"), null);
  line.out.write("\n");
  try {
    return await verified({ url: normalizeUrl(stored.url ?? ""), apiKey: stored.apiKey ?? "" }, line);
  } catch (error) {
    step(line.out, line.s, t().lineCheck, t().fail, humanMessage(error));
    line.out.write("\n");
    return null;
  }
}

function save(profile: string, credentials: Credentials, defaultProject: string | undefined, { out, s }: Line): void {
  const home = homedir();
  step(out, s, t().saved, t().done, tilde(saveConfig(profile, { ...credentials, defaultProject }), home));
  const manual = scaffoldConventions(join(profileDir(profile), "conventions.md"));
  step(out, s, t().manual, t().done, manual ? `${tilde(manual, home)} ${s.muted(`· ${t().manualNew}`)}` : t().manualKept);
}

async function pickProject({ projects }: Verified, rl: Interface, streams: Streams, { out, s }: Line): Promise<string | undefined> {
  if (projects.length === 0) return undefined;
  out.write("\n");
  const text = t();
  let picked: string;
  if (canSelect(streams)) {
    const rows = [...projects.map(({ name, identifier }) => ({ label: name, hint: identifier })), { label: text.projectNone }, { label: text.projectOther }];
    const index = await select(streams.stdin, out, s, text.projectQuestion, rows);
    picked = projects[index]?.identifier ?? (index === projects.length ? "" : await ask(rl, `  ${text.projectIdentifier} › `));
  } else {
    picked = await choose(rl, out, s, text.projectQuestion, projects.map(({ name, identifier }) => [name, identifier]));
  }
  out.write("\n");
  return picked || undefined;
}

async function interactive(argv: string[], streams: Streams, rl: Interface, profile: string): Promise<number> {
  const line = { out: streams.stdout, s: style(streams.stdout) };
  const home = homedir();
  const { facts } = t();
  greet(line.out, line.s, t().setupTitle, [
    [facts.profile, profile],
    [facts.config, tilde(profileDir(profile), home)],
    [facts.version, version],
  ]);
  const { url, apiKey, ...found } = (await keptConnection(profile, rl, line)) ?? (await promptCredentials(rl, streams, line));
  const defaultProject = await pickProject(found, rl, streams, line);
  save(profile, { url, apiKey }, defaultProject, line);
  line.out.write("\n");
  const agents: Client[] = await patchAgents(argv, streams, rl, home);
  line.out.write("\n");
  const healthy = await printChecks(line.out, doctorChecks(argv, process.env, home));
  outro(line.out, line.s, agents, healthy);
  return 0;
}

export async function runSetup(argv: string[], streams: Streams): Promise<number> {
  const profile = resolveProfile(argv, process.env);
  const line = { out: streams.stdout, s: style(streams.stdout) };

  if (argv.includes("--non-interactive")) {
    const credentials = nonInteractiveInput(argv, process.env);
    await verified(credentials, line);
    save(profile, credentials, process.env.OPENPROJECT_DEFAULT_PROJECT, line);
    line.out.write(`  ${t().nextNonInteractive}\n`);
    return 0;
  }

  const rl = createInterface({ input: streams.stdin, output: streams.stdout });
  try {
    return await interactive(argv, streams, rl, profile);
  } catch (error) {
    if (!(error instanceof SetupAborted)) throw error;
    line.out.write(`\n  ${error.message}\n`);
    return 130;
  } finally {
    rl.close();
  }
}
