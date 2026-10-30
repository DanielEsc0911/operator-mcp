import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { createInterface, type Interface } from "node:readline/promises";
import { offeredClients, detectClients, selfCommand, serverCommand, serverName, type Client, type Runner, type Target } from "./clients.js";
import type { Streams } from "./cli.js";
import { resolveProfile } from "./config.js";
import { humanMessage } from "./errors.js";
import { listed } from "./outro.js";
import { confirmList } from "./prompts.js";
import { step, style, tilde, type Output, type Style } from "./ui.js";

export type Outcome = { client: Client; error?: string };

const spawnRunner: Runner = (command, args) => {
  const result = spawnSync(command, args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (result.error) throw new Error(`\`${command}\` is not on your PATH`);
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `\`${command}\` exited with ${result.status}`);
};

export function registerAll(clients: Client[], target: Target): Outcome[] {
  return clients.map((client) => {
    try {
      client.register(target);
      return { client };
    } catch (error) {
      return { client, error: humanMessage(error) };
    }
  });
}

const indent = (text: string, spaces: number) => text.replace(/^/gm, " ".repeat(spaces));

function report(outcomes: Outcome[], target: Target, out: Output, s: Style): void {
  const width = Math.max(...outcomes.map(({ client }) => client.label.length)) + 2;
  outcomes.forEach(({ client, error }, index) => {
    const label = index === 0 ? "Patching in" : "";
    const where = error ?? tilde(client.configPath(target.home), target.home);
    step(out, s, label, error ? "fail" : "done", `${client.label.padEnd(width)}${s.muted(where)}`);
    if (error) out.write(`${indent(`Add it yourself:\n${indent(client.manual(target), 2)}`, 22)}\n`);
  });
}

async function pick(detected: Client[], argv: string[], streams: Streams, rl: Interface, s: Style): Promise<Client[]> {
  if (argv.includes("--yes") || !streams.stdin.isTTY) return detected;
  const labels = detected.map((client) => client.label);
  const chosen = await confirmList(rl, streams.stdout, s, "Which agents should OPerator patch into?", labels);
  streams.stdout.write("\n");
  return chosen.map((index) => detected[index]);
}

export async function patchAgents(argv: string[], streams: Streams, rl: Interface, home = homedir()): Promise<Client[]> {
  const out = streams.stdout;
  const s = style(out);
  const profile = resolveProfile(argv, process.env);
  const target: Target = { home, name: serverName(profile), ...serverCommand(profile), run: spawnRunner };

  const detected = detectClients(home);
  if (detected.length === 0) {
    out.write(`  ${s.bold("No agent found on this machine.")} Register OPerator by hand in yours:\n\n`);
    for (const client of offeredClients(home)) out.write(`  ${s.accent(client.label)}\n${indent(client.manual(target), 4)}\n\n`);
    return [];
  }

  const chosen = await pick(detected, argv, streams, rl, s);
  if (chosen.length === 0) return (out.write("  Nothing registered.\n"), []);
  const outcomes = registerAll(chosen, target);
  report(outcomes, target, out, s);

  const missed = offeredClients(home).filter((client) => !detected.includes(client));
  if (missed.length > 0) {
    out.write(`\n  ${s.muted(`Not installed here: ${missed.map((client) => client.label).join(", ")}.`)}\n`);
    out.write(`  ${s.muted(`Install one later, then run: ${selfCommand()} install`)}\n`);
  }
  return outcomes.filter((outcome) => !outcome.error).map((outcome) => outcome.client);
}

export async function runInstall(argv: string[], streams: Streams): Promise<number> {
  const out = streams.stdout;
  const s = style(out);
  const rl = createInterface({ input: streams.stdin, output: out });
  try {
    out.write("\n");
    const patched = await patchAgents(argv, streams, rl);
    if (patched.length === 0) return 0;
    out.write(`\n  Check the line any time: ${s.bold(`${selfCommand()} doctor`)}\n`);
    out.write(`  Restart ${listed(patched.map((client) => client.label))}, then ask: ${s.accent("what's on my plate?")}\n\n`);
    return 0;
  } finally {
    rl.close();
  }
}
