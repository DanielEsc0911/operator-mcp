import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import type { Streams } from "./cli.js";
import type { Client } from "./clients.js";
import { assertSecureUrl, normalizeUrl, profileDir, resolveProfile, saveConfig } from "./config.js";
import { describeExisting, keyHint, nonInteractiveInput, scaffoldConventions, verifyCredentials } from "./credentials.js";
import type { Credentials, Verified } from "./credentials.js";
import { doctorChecks, printChecks } from "./doctor.js";
import { humanMessage } from "./errors.js";
import { patchAgents } from "./install.js";
import { outro } from "./outro.js";
import { SetupAborted, ask, askHidden, choose } from "./prompts.js";
import { version } from "./server.js";
import { greet, lamp, step, style, tilde, type Output, type Style } from "./ui.js";

type Line = { out: Output; s: Style };

async function verified({ url, apiKey }: Credentials, { out, s }: Line): Promise<Verified> {
  assertSecureUrl(url, process.env);
  const result = await lamp(out, s, "Line check", new URL(url).host, verifyCredentials(url, apiKey));
  const { identity, projectCount } = result;
  step(out, s, "Line's open", "done", `${identity.name} (${identity.email}) · ${projectCount} projects`);
  return result;
}

async function promptCredentials(rl: Interface, streams: Streams, line: Line): Promise<Credentials & Verified> {
  const { out, s } = line;
  for (;;) {
    try {
      out.write(`  ${s.bold("Where does your OpenProject live?")}\n`);
      const url = normalizeUrl(await ask(rl, "  › "));
      if (!url) throw new Error("An instance URL is required, like https://openproject.example.com");
      out.write(`\n  ${s.bold("Your API key.")} ${keyHint(url)}\n`);
      const apiKey = await askHidden(rl, "  › ", streams.stdin, out);
      out.write("\n");
      return { url, apiKey, ...(await verified({ url, apiKey }, line)) };
    } catch (error) {
      if (error instanceof SetupAborted) throw error;
      step(out, s, "Line check", "fail", humanMessage(error));
      if (/^n/i.test(await ask(rl, "\n  Try again? [Y/n] "))) throw new SetupAborted();
      out.write("\n");
    }
  }
}

function save(profile: string, credentials: Credentials, defaultProject: string | undefined, { out, s }: Line): void {
  const home = homedir();
  step(out, s, "Saved", "done", tilde(saveConfig(profile, { ...credentials, defaultProject }), home));
  const manual = scaffoldConventions(join(profileDir(profile), "conventions.md"));
  step(out, s, "Manual", "done", manual ? `${tilde(manual, home)} ${s.muted("· your house rules")}` : "existing conventions kept");
}

async function pickProject({ projects }: Verified, rl: Interface, { out, s }: Line): Promise<string | undefined> {
  if (projects.length === 0) return undefined;
  out.write("\n");
  const options = projects.map(({ name, identifier }): [string, string] => [name, identifier]);
  const picked = await choose(rl, out, s, "Default project, for when you don't name one", options);
  out.write("\n");
  return picked || undefined;
}

async function keepExisting(profile: string, rl: Interface, { out, s }: Line): Promise<boolean> {
  const existing = describeExisting(profile);
  if (!existing) return false;
  out.write(`  ${s.bold("This profile is already set up:")} ${existing}\n`);
  const keep = !/^y/i.test(await ask(rl, "  Replace it? [y/N] "));
  out.write(keep ? "  Kept the existing profile.\n\n" : "\n");
  return keep;
}

async function interactive(argv: string[], streams: Streams, rl: Interface, profile: string): Promise<number> {
  const line = { out: streams.stdout, s: style(streams.stdout) };
  const home = homedir();
  greet(line.out, line.s, "setup", [
    ["Profile", profile],
    ["Config", tilde(profileDir(profile), home)],
    ["Version", version],
  ]);
  if (await keepExisting(profile, rl, line)) return 0;
  const { url, apiKey, ...found } = await promptCredentials(rl, streams, line);
  const defaultProject = await pickProject(found, rl, line);
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
    line.out.write("  Next: operator-mcp install --yes\n");
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
