import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commandLine, readJson, tomlEntry, tomlKey, upsertTomlTable, writeMerged } from "./clientFiles.js";
import { mcpServersClient, opencodeClient, type Client } from "./clientShapes.js";

export type { Client, Runner, Target } from "./clientShapes.js";

export type ServerCommand = { command: string; args: string[] };

type Runtime = { versions: Partial<Record<string, string>>; execPath: string };


export function serverName(profile: string): string {
  return profile === "default" ? "openproject" : `openproject-${profile}`;
}

export function serverCommand(profile: string, runtime: Runtime = process): ServerCommand {
  const flag = profile === "default" ? [] : ["--profile", profile];
  if (runtime.versions.bun) return { command: runtime.execPath, args: flag };
  return { command: "npx", args: ["-y", "operator-mcp", ...flag] };
}

export function desktopConfigPath(
  home: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return null;
}

function codexBody(command: string, args: string[]): string {
  return `command = ${JSON.stringify(command)}\nargs = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]`;
}

const claudeEntry = (home: string, name: string) => commandLine(readJson(join(home, ".claude.json")).mcpServers?.[name]);

export const CLIENTS: Client[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    configPath: (home) => join(home, ".claude.json"),
    detect: (home) => existsSync(join(home, ".claude")) || existsSync(join(home, ".claude.json")),
    // The user-scope config is the claude CLI's own format; let it do the write.
    // Its `mcp add` refuses a name that exists, so an older entry goes first.
    register: ({ home, name, command, args, run }) => {
      if (claudeEntry(home, name)) run("claude", ["mcp", "remove", name, "--scope", "user"]);
      run("claude", ["mcp", "add", name, "--scope", "user", "--", command, ...args]);
    },
    entry: (home, name) => claudeEntry(home, name),
    manual: ({ name, command, args }) => `claude mcp add ${name} --scope user -- ${[command, ...args].join(" ")}`,
  },
  {
    id: "codex",
    label: "Codex CLI",
    configPath: (home) => join(home, ".codex", "config.toml"),
    detect: (home) => existsSync(join(home, ".codex")),
    register: ({ home, name, command, args }) => {
      const path = join(home, ".codex", "config.toml");
      const body = codexBody(command, args);
      const text = existsSync(path) ? readFileSync(path, "utf8") : "";
      writeMerged(path, upsertTomlTable(text, `[mcp_servers.${tomlKey(name)}]`, body));
    },
    entry: (home, name) => tomlEntry(join(home, ".codex", "config.toml"), `[mcp_servers.${tomlKey(name)}]`),
    manual: ({ name, command, args }) => `# ~/.codex/config.toml\n[mcp_servers.${tomlKey(name)}]\n${codexBody(command, args)}`,
  },
  mcpServersClient("gemini", "Gemini CLI", (home) => join(home, ".gemini", "settings.json"), "~/.gemini/settings.json"),
  mcpServersClient("claude-desktop", "Claude Desktop", (home) => desktopConfigPath(home), "Claude Desktop: Settings → Developer → Edit Config"),
  mcpServersClient("qwen", "Qwen Code", (home) => join(home, ".qwen", "settings.json"), "~/.qwen/settings.json"),
  mcpServersClient("kimi", "Kimi CLI", (home) => join(home, ".kimi", "mcp.json"), "~/.kimi/mcp.json"),
  mcpServersClient("kimi-code", "Kimi Code", (home) => join(home, ".kimi-code", "mcp.json"), "~/.kimi-code/mcp.json"),
  mcpServersClient("iflow", "iFlow CLI", (home) => join(home, ".iflow", "settings.json"), "~/.iflow/settings.json"),
  mcpServersClient("kiro", "Kiro", (home) => join(home, ".kiro", "settings", "mcp.json"), "~/.kiro/settings/mcp.json"),
  mcpServersClient("windsurf", "Windsurf", (home) => join(home, ".codeium", "windsurf", "mcp_config.json"), "~/.codeium/windsurf/mcp_config.json"),
  mcpServersClient("cursor", "Cursor", (home) => join(home, ".cursor", "mcp.json"), "~/.cursor/mcp.json"),
  opencodeClient("opencode", "opencode", ".config/opencode/opencode.json", "https://opencode.ai/config.json"),
  opencodeClient("mimocode", "MiMo Code", ".config/mimocode/mimocode.jsonc"),
];

export function selfCommand(runtime: Runtime = process): string {
  return runtime.versions.bun ? "operator-mcp" : "npx operator-mcp";
}

export function offeredClients(home: string): Client[] {
  return CLIENTS.filter((client) => client.configPath(home) !== "");
}

export function findClient(id: string): Client | undefined {
  return CLIENTS.find((client) => client.id === id);
}

export function detectClients(home: string): Client[] {
  return CLIENTS.filter((client) => client.detect(home));
}

export function mcpConfigSnippet(client: Client, profile: string, home = ""): string {
  return client.manual({ home, name: serverName(profile), ...serverCommand(profile), run: () => {} });
}
