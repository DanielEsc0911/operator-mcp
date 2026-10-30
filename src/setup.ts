import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import type { Streams } from "./cli.js";
import { OpenProjectClient, type Identity } from "./client.js";
import { assertSecureUrl, normalizeUrl, profileDir, resolveProfile, saveConfig } from "./config.js";
import { TEMPLATE_PATH } from "./conventions.js";
import { humanMessage } from "./errors.js";
import { runInstall } from "./install.js";
import { SetupAborted, ask, askHidden } from "./prompts.js";

type Credentials = { url: string; apiKey: string };

export async function verifyCredentials(
  url: string,
  apiKey: string,
): Promise<{ identity: Identity; projectCount: number }> {
  const client = new OpenProjectClient({
    profile: "setup", url, apiKey, conventionsPath: "", readOnly: false, allowDelete: false,
  });
  const identity = await client.me();
  const { total } = await client.collection("/projects", { pageSize: 1 });
  return { identity, projectCount: total };
}

export function scaffoldConventions(path: string): string | null {
  if (existsSync(path)) return null;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  copyFileSync(TEMPLATE_PATH, path);
  return path;
}

export function maskKey(apiKey: string): string {
  return apiKey.length > 8 ? `…${apiKey.slice(-4)}` : "…";
}

export function keyHint(url: string): string {
  return `Create a key at ${url}/my/access_tokens (older instances: My account → Access token)`;
}

export function describeExisting(profile: string): string | null {
  const path = join(profileDir(profile), "config.json");
  if (!existsSync(path)) return null;
  const stored = JSON.parse(readFileSync(path, "utf8")) as Partial<Credentials>;
  return `${path}: ${stored.url ?? "(no url)"}, key ${stored.apiKey ? maskKey(stored.apiKey) : "(none)"}`;
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

async function verified({ url, apiKey }: Credentials, out: NodeJS.WritableStream): Promise<Credentials> {
  assertSecureUrl(url, process.env);
  const { identity, projectCount } = await verifyCredentials(url, apiKey);
  out.write(`  ✓ Connected as ${identity.name} (${identity.email})\n  ✓ ${projectCount} projects visible\n`);
  return { url, apiKey };
}

async function promptCredentials(rl: Interface, streams: Streams): Promise<Credentials> {
  for (;;) {
    try {
      const url = normalizeUrl(await ask(rl, "  OpenProject instance URL: "));
      if (!url) throw new Error("An instance URL is required.");
      streams.stdout.write(`  · ${keyHint(url)}\n`);
      const apiKey = await askHidden(rl, "  API key: ", streams.stdin, streams.stdout);
      return await verified({ url, apiKey }, streams.stdout);
    } catch (error) {
      if (error instanceof SetupAborted) throw error;
      streams.stdout.write(`  ✗ ${humanMessage(error)}\n`);
      if (/^n/i.test(await ask(rl, "  Try again? [Y/n] "))) throw new SetupAborted();
    }
  }
}

function finish(profile: string, credentials: Credentials, defaultProject: string | undefined, out: NodeJS.WritableStream) {
  out.write(`  ✓ Saved to ${saveConfig(profile, { ...credentials, defaultProject })}\n`);
  const manual = scaffoldConventions(join(profileDir(profile), "conventions.md"));
  out.write(manual ? `  ✓ Starter conventions written to ${manual}\n` : "  · Existing conventions kept\n");
}

export async function runSetup(argv: string[], streams: Streams): Promise<number> {
  const profile = resolveProfile(argv, process.env);
  const out = streams.stdout;

  if (argv.includes("--non-interactive")) {
    const credentials = await verified(nonInteractiveInput(argv, process.env), out);
    finish(profile, credentials, process.env.OPENPROJECT_DEFAULT_PROJECT, out);
    out.write("  Next: operator-mcp install --yes\n");
    return 0;
  }

  const rl = createInterface({ input: streams.stdin, output: out });
  try {
    out.write(`\n  OPerator setup — profile "${profile}"\n\n`);
    const existing = describeExisting(profile);
    if (existing) {
      out.write(`  This profile exists: ${existing}\n`);
      if (!/^y/i.test(await ask(rl, "  Overwrite it? [y/N] "))) return (out.write("  Kept the existing profile.\n"), 0);
    }
    const credentials = await promptCredentials(rl, streams);
    const defaultProject = (await ask(rl, "  Default project identifier (optional): ")) || undefined;
    finish(profile, credentials, defaultProject, out);
    return await runInstall(argv, streams, rl);
  } catch (error) {
    if (!(error instanceof SetupAborted)) throw error;
    out.write(`\n  ${error.message}\n`);
    return 130;
  } finally {
    rl.close();
  }
}
