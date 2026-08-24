import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { createInterface, type Interface } from "node:readline/promises";
import { CLIENTS, detectClients, serverArgs, serverName, type Client, type Runner, type Target } from "./clients.js";
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

function report(outcomes: Outcome[], target: Target): void {
  for (const { client, error } of outcomes) {
    if (!error) {
      console.log(`  ✓ ${client.label} — ${client.configPath(target.home)}`);
      continue;
    }
    console.log(`  ✗ ${client.label} — ${error}`);
    console.log(`    Add it yourself:\n${client.manual(target).replace(/^/gm, "      ")}`);
  }
}

export async function runInstall(argv: string[], existing?: Interface): Promise<void> {
  const profile = resolveProfile(argv, process.env);
  const home = homedir();
  const target: Target = { home, name: serverName(profile), args: serverArgs(profile), run: spawnRunner };

  const detected = detectClients(home);
  if (detected.length === 0) {
    console.log("\n  No supported agent found. Register OPerator by hand:\n");
    for (const client of CLIENTS) console.log(`  ${client.label}:\n${client.manual(target).replace(/^/gm, "    ")}\n`);
    return;
  }

  console.log(`\n  Found ${detected.length === 1 ? "1 agent" : `${detected.length} agents`}:\n`);
  detected.forEach((client, index) => console.log(`    ${index + 1}. ${client.label}`));

  const rl = existing ?? createInterface({ input: process.stdin, output: process.stdout });
  try {
    const skipPrompt = argv.includes("--yes") || !process.stdin.isTTY;
    const answer = skipPrompt ? "all" : await rl.question("\n  Register with which? [all] ");
    const chosen = selectClients(answer, detected);
    if (chosen.length === 0) return console.log("\n  Nothing registered.\n");

    console.log(`\n  Registering as "${target.name}":\n`);
    report(registerAll(chosen, target), target);

    const missed = CLIENTS.filter((client) => !detected.includes(client));
    if (missed.length > 0) {
      console.log(`\n  Not installed here: ${missed.map((client) => client.label).join(", ")}.`);
      console.log("  Install one, then run: npx operator-mcp install");
    }
    console.log("\n  Restart your agent, then ask it: what's on my plate?\n");
  } finally {
    if (!existing) rl.close();
  }
}
