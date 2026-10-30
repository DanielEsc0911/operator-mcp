import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { createInterface, type Interface } from "node:readline/promises";
import { CLIENTS, detectClients, serverCommand, serverName, type Client, type Runner, type Target } from "./clients.js";
import type { Streams } from "./cli.js";
import { resolveProfile } from "./config.js";
import { humanMessage } from "./errors.js";

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

export function selectClients(answer: string, detected: Client[]): Client[] {
  const wanted = answer.trim().toLowerCase();
  if (wanted === "" || wanted === "all") return detected;
  if (wanted === "none") return [];
  const chosen = wanted.split(/[\s,]+/).map((token) => {
    const byNumber = detected[Number(token) - 1];
    return byNumber ?? detected.find((client) => client.id === token);
  });
  return chosen.filter((client): client is Client => client !== undefined);
}

function report(outcomes: Outcome[], target: Target, out: NodeJS.WritableStream): void {
  for (const { client, error } of outcomes) {
    if (!error) {
      out.write(`  ✓ ${client.label} — ${client.configPath(target.home)}\n`);
      continue;
    }
    out.write(`  ✗ ${client.label} — ${error}\n`);
    out.write(`    Add it yourself:\n${client.manual(target).replace(/^/gm, "      ")}\n`);
  }
}

export async function runInstall(argv: string[], streams: Streams, existing?: Interface): Promise<number> {
  const out = streams.stdout;
  const say = (line: string) => out.write(`${line}\n`);
  const profile = resolveProfile(argv, process.env);
  const home = homedir();
  const target: Target = { home, name: serverName(profile), ...serverCommand(profile), run: spawnRunner };

  const detected = detectClients(home);
  if (detected.length === 0) {
    say("\n  No supported agent found. Register OPerator by hand:\n");
    for (const client of CLIENTS) say(`  ${client.label}:\n${client.manual(target).replace(/^/gm, "    ")}\n`);
    return 0;
  }

  say(`\n  Found ${detected.length === 1 ? "1 agent" : `${detected.length} agents`}:\n`);
  detected.forEach((client, index) => say(`    ${index + 1}. ${client.label}`));

  const rl = existing ?? createInterface({ input: streams.stdin, output: out });
  try {
    const skipPrompt = argv.includes("--yes") || !streams.stdin.isTTY;
    const answer = skipPrompt ? "all" : await rl.question("\n  Register with which? [all] ");
    const chosen = selectClients(answer, detected);
    if (chosen.length === 0) return (say("\n  Nothing registered.\n"), 0);

    say(`\n  Registering as "${target.name}":\n`);
    report(registerAll(chosen, target), target, out);

    const missed = CLIENTS.filter((client) => !detected.includes(client));
    if (missed.length > 0) {
      say(`\n  Not installed here: ${missed.map((client) => client.label).join(", ")}.`);
      say("  Install one, then run: npx operator-mcp install");
    }
    say("\n  Check it any time with: npx operator-mcp doctor");
    say("\n  Restart your agent, then ask it: what's on my plate?\n");
    return 0;
  } finally {
    if (!existing) rl.close();
  }
}
