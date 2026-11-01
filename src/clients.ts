import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { commandLine, editJson, readJson, tomlEntry, upsertTomlServer, writeMerged } from "./clientFiles.js";
import { desktopConfigPath, serverCommand, serverName } from "./serverCommand.js";

export type Runner = (command: string, args: string[]) => string;

export type Target = {
  home: string;
  name: string;
  command: string;
  args: string[];
  run: Runner;
};

export type Client = {
  id: string;
  label: string;
  configPath: (home: string) => string;
  detect: (home: string) => boolean;
  register: (target: Target) => void;
  entry: (home: string, name: string, run?: Runner) => string[] | null;
  manual: (target: Target) => string;
};

function mcpServersClient(id: string, label: string, path: (home: string) => string | null, shown: string): Client {
  const file = (home: string) => path(home) ?? "";
  return {
    id,
    label,
    configPath: file,
    detect: (home) => path(home) !== null && existsSync(dirname(file(home))),
    register: ({ home, name, command, args }) =>
      editJson(file(home), (settings) => {
        const servers = settings.mcpServers ?? {};
        settings.mcpServers = { ...servers, [name]: { ...servers[name], command, args } };
      }),
    entry: (home, name) => commandLine(readJson(file(home)).mcpServers?.[name]),
    manual: ({ name, command, args }) => `// ${shown}\n${JSON.stringify({ mcpServers: { [name]: { command, args } } }, null, 2)}`,
  };
}

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

function opencodePath(home: string): string {
  const dir = join(home, ".config", "opencode");
  return existsSync(join(dir, "opencode.jsonc")) ? join(dir, "opencode.jsonc") : join(dir, "opencode.json");
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
  mcpServersClient("claude-desktop", "Claude Desktop", (home) => desktopConfigPath(home), "Claude Desktop: Settings → Developer → Edit Config"),
  mcpServersClient("cursor", "Cursor", (home) => join(home, ".cursor", "mcp.json"), "~/.cursor/mcp.json"),
  {
    id: "opencode",
    label: "opencode",
    configPath: opencodePath,
    detect: (home) => existsSync(join(home, ".config", "opencode")),
    register: ({ home, name, command, args }) =>
      editJson(opencodePath(home), (config) => {
        config.$schema ??= "https://opencode.ai/config.json";
        const mcp = config.mcp ?? {};
        config.mcp = { ...mcp, [name]: { enabled: true, ...mcp[name], type: "local", command: [command, ...args] } };
      }),
    entry: (home, name) => commandLine(readJson(opencodePath(home)).mcp?.[name]),
    manual: ({ name, command, args }) =>
      `// ~/.config/opencode/opencode.json\n${JSON.stringify(
        { mcp: { [name]: { type: "local", command: [command, ...args], enabled: true } } },
        null,
        2,
      )}`,
  },
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
