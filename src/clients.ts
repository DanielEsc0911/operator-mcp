import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { commandLine, editJson, readJson, tomlEntry, tomlKey, upsertTomlTable, writeMerged } from "./clientFiles.js";

export type Runner = (command: string, args: string[]) => void;

export type Target = {
  home: string;
  name: string;
  command: string;
  args: string[];
  run: Runner;
};

export type ServerCommand = { command: string; args: string[] };

type Runtime = { versions: Partial<Record<string, string>>; execPath: string };

export type Client = {
  id: string;
  label: string;
  configPath: (home: string) => string;
  detect: (home: string) => boolean;
  register: (target: Target) => void;
  entry: (home: string, name: string) => string[] | null;
  manual: (target: Target) => string;
};

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

function mcpServersClient(id: string, label: string, path: (home: string) => string | null, shown: string): Client {
  const file = (home: string) => path(home) ?? "";
  return {
    id,
    label,
    configPath: file,
    detect: (home) => path(home) !== null && existsSync(dirname(file(home))),
    register: ({ home, name, command, args }) =>
      editJson(file(home), (settings) => {
        settings.mcpServers = { ...settings.mcpServers, [name]: { command, args } };
      }),
    entry: (home, name) => commandLine(readJson(file(home)).mcpServers?.[name]),
    manual: ({ name, command, args }) => `// ${shown}\n${JSON.stringify({ mcpServers: { [name]: { command, args } } }, null, 2)}`,
  };
}

function codexBody(command: string, args: string[]): string {
  return `command = ${JSON.stringify(command)}\nargs = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]`;
}

export const CLIENTS: Client[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    configPath: (home) => join(home, ".claude.json"),
    detect: (home) => existsSync(join(home, ".claude")) || existsSync(join(home, ".claude.json")),
    // The user-scope config is the claude CLI's own format; let it do the write.
    register: ({ name, command, args, run }) => run("claude", ["mcp", "add", name, "--scope", "user", "--", command, ...args]),
    entry: (home, name) => commandLine(readJson(join(home, ".claude.json")).mcpServers?.[name]),
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
  mcpServersClient("cursor", "Cursor", (home) => join(home, ".cursor", "mcp.json"), "~/.cursor/mcp.json"),
  {
    id: "opencode",
    label: "opencode",
    configPath: (home) => join(home, ".config", "opencode", "opencode.json"),
    detect: (home) => existsSync(join(home, ".config", "opencode")),
    register: ({ home, name, command, args }) =>
      editJson(join(home, ".config", "opencode", "opencode.json"), (config) => {
        config.$schema ??= "https://opencode.ai/config.json";
        config.mcp = { ...config.mcp, [name]: { type: "local", command: [command, ...args], enabled: true } };
      }),
    entry: (home, name) => commandLine(readJson(join(home, ".config", "opencode", "opencode.json")).mcp?.[name]),
    manual: ({ name, command, args }) =>
      `// ~/.config/opencode/opencode.json\n${JSON.stringify(
        { mcp: { [name]: { type: "local", command: [command, ...args], enabled: true } } },
        null,
        2,
      )}`,
  },
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
