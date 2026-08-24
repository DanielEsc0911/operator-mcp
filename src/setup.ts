import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import { OpenProjectClient, type Identity } from "./client.js";
import { normalizeUrl, profileDir, resolveProfile, saveConfig } from "./config.js";
import { TEMPLATE_PATH } from "./conventions.js";
import { humanMessage } from "./errors.js";

export async function verifyCredentials(
  url: string,
  apiKey: string,
): Promise<{ identity: Identity; projectCount: number }> {
  const client = new OpenProjectClient({
    profile: "setup", url, apiKey, conventionsPath: "", readOnly: false,
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

export function mcpConfigSnippet(profile: string): string {
  const isDefault = profile === "default";
  const name = isDefault ? "openproject" : `openproject-${profile}`;
  const args = isDefault ? ["-y", "operator-mcp"] : ["-y", "operator-mcp", "--profile", profile];
  return JSON.stringify({ mcpServers: { [name]: { command: "npx", args } } }, null, 2);
}

const ETX = 3;
const BACKSPACE = [8, 127];
const NEWLINE = [10, 13];

// readline offers no masked input: it renders every keystroke through an
// internal refresh path that cannot be muted, so the key is read straight from
// a raw stdin with the interface's own listeners detached for the duration.
function readHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    const borrowed = stdin.listeners("data") as ((chunk: Buffer) => void)[];
    stdin.removeAllListeners("data");
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();

    let value = "";
    const finish = (answer: string) => {
      stdin.off("data", onData);
      for (const listener of borrowed) stdin.on("data", listener);
      stdout.write("\n");
      resolve(answer);
    };

    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === ETX) {
          finish("");
          process.exit(130);
        }
        if (NEWLINE.includes(byte)) return finish(value);
        if (BACKSPACE.includes(byte)) value = value.slice(0, -1);
        else value += String.fromCharCode(byte);
      }
    };

    stdin.on("data", onData);
  });
}

async function promptHidden(rl: Interface, question: string): Promise<string> {
  if (!process.stdin.isTTY) return (await rl.question(question)).trim();
  return (await readHidden(question)).trim();
}

export async function runSetup(argv: string[]): Promise<void> {
  const profile = resolveProfile(argv, process.env);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(`\n  OPerator setup — profile "${profile}"\n`);

    let url = "";
    let apiKey = "";
    for (;;) {
      url = normalizeUrl(await rl.question("  OpenProject instance URL: "));
      apiKey = await promptHidden(rl, "  API key: ");
      try {
        const { identity, projectCount } = await verifyCredentials(url, apiKey);
        console.log(`  ✓ Connected as ${identity.name} (${identity.email})`);
        console.log(`  ✓ ${projectCount} projects visible`);
        break;
      } catch (error) {
        console.log(`  ✗ ${humanMessage(error)}\n`);
      }
    }

    const defaultProject = (await rl.question("  Default project identifier (optional): ")).trim() || undefined;
    console.log(`  ✓ Saved to ${saveConfig(profile, { url, apiKey, defaultProject })}`);

    const manual = scaffoldConventions(join(profileDir(profile), "conventions.md"));
    console.log(manual ? `  ✓ Starter conventions written to ${manual}` : "  · Existing conventions kept");

    console.log("\n  Add this to your MCP client config:\n");
    console.log(mcpConfigSnippet(profile));
    console.log("");
  } finally {
    rl.close();
  }
}
