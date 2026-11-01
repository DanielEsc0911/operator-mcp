import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commandLine, readJson, tomlEntry, upsertTomlServer, writeMerged } from "./clientFiles.js";
import { desktopConfigPath, serverCommand, serverName } from "./serverCommand.js";
import { mcpServersClient, opencodeClient, type Client, type Runner } from "./clientShapes.js";

export type { Client, Runner, Target } from "./clientShapes.js";

const claudeServer = (home: string, name: string) => (home ? readJson(join(home, ".claude.json")).mcpServers?.[name] : undefined);

const SECRET_KEY = /KEY|TOKEN|SECRET|PASSWORD/i;

function claudeAdd(name: string, command: string, args: string[], saved: Record<string, string> = {}, hideSecrets = false): string[] {
  const env = Object.entries(saved).flatMap(([key, value]) => ["-e", `${key}=${hideSecrets && SECRET_KEY.test(key) ? "<your value>" : value}`]);
  return ["mcp", "add", name, "--scope", "user", ...env, "--", command, ...args];
}

function claudeGet(run: Runner, name: string): string[] | null {
  const text = run("claude", ["mcp", "get", name]);
  const command = /^\s*Command:\s*(.+)$/m.exec(text)?.[1].trim();
  const args = /^\s*Args:\s*(.+)$/m.exec(text)?.[1].trim();
  return command ? [command, ...(args ? args.split(" ") : [])] : null;
}

export const CLIENTS: Client[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    configPath: (home) => join(home, ".claude.json"),
    detect: (home) => existsSync(join(home, ".claude")) || existsSync(join(home, ".claude.json")),
    // The user-scope config is the claude CLI's own format; let it do the write.
    // Its `mcp add` refuses a name that exists, so an older entry goes first and its env is passed back.
    register: ({ home, name, command, args, run }) => {
      const existing = claudeServer(home, name);
      if (!existing) return void run("claude", claudeAdd(name, command, args));
      run("claude", ["mcp", "remove", name, "--scope", "user"]);
      try {
        run("claude", claudeAdd(name, command, args, existing.env));
      } catch (error) {
        if (existing.command) run("claude", claudeAdd(name, existing.command, existing.args ?? [], existing.env));
        throw error;
      }
    },
    entry: (home, name, run) => {
      try {
        const found = run && claudeGet(run, name);
        if (found) return found;
      } catch {}
      return commandLine(claudeServer(home, name));
    },
    manual: ({ home, name, command, args }) => `claude ${claudeAdd(name, command, args, claudeServer(home, name)?.env, true).join(" ")}`,
  },
  {
    id: "codex",
    label: "Codex CLI",
    configPath: (home) => join(home, ".codex", "config.toml"),
    detect: (home) => existsSync(join(home, ".codex")),
    register: ({ home, name, command, args }) => {
      const path = join(home, ".codex", "config.toml");
      writeMerged(path, upsertTomlServer(existsSync(path) ? readFileSync(path, "utf8") : "", name, command, args));
    },
    entry: (home, name) => tomlEntry(join(home, ".codex", "config.toml"), name),
    manual: ({ name, command, args }) => `# ~/.codex/config.toml\n${upsertTomlServer("", name, command, args).trimEnd()}`,
  },
  mcpServersClient("gemini", "Gemini CLI", (home) => join(home, ".gemini", "settings.json"), "~/.gemini/settings.json"),
  mcpServersClient("antigravity", "Antigravity CLI", (home) => join(home, ".gemini", "config", "mcp_config.json"), "~/.gemini/config/mcp_config.json"),
  mcpServersClient("claude-desktop", "Claude Desktop", (home) => desktopConfigPath(home), "Claude Desktop: Settings → Developer → Edit Config"),
  mcpServersClient("qwen", "Qwen Code", (home) => join(home, ".qwen", "settings.json"), "~/.qwen/settings.json"),
  mcpServersClient("kimi", "Kimi CLI", (home) => join(home, ".kimi", "mcp.json"), "~/.kimi/mcp.json"),
  mcpServersClient("kimi-code", "Kimi Code", (home) => join(home, ".kimi-code", "mcp.json"), "~/.kimi-code/mcp.json"),
  mcpServersClient("iflow", "iFlow CLI", (home) => join(home, ".iflow", "settings.json"), "~/.iflow/settings.json"),
  mcpServersClient("kiro", "Kiro", (home) => join(home, ".kiro", "settings", "mcp.json"), "~/.kiro/settings/mcp.json"),
  mcpServersClient("windsurf", "Windsurf", (home) => join(home, ".codeium", "windsurf", "mcp_config.json"), "~/.codeium/windsurf/mcp_config.json"),
  mcpServersClient("cursor", "Cursor", (home) => join(home, ".cursor", "mcp.json"), "~/.cursor/mcp.json"),
  opencodeClient("opencode", "opencode", ".config/opencode", "opencode", "https://opencode.ai/config.json"),
  opencodeClient("mimocode", "MiMo Code", ".config/mimocode", "mimocode"),
];

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
  return client.manual({ home, name: serverName(profile), ...serverCommand(profile), run: () => "" });
}
