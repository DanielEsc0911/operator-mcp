import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commandLine, editJson, readJson, tomlEntry, tomlKey, upsertTomlTable, writeMerged } from "./clientFiles.js";

export type Runner = (command: string, args: string[]) => void;

export type Target = {
  home: string;
  name: string;
  args: string[];
  run: Runner;
};

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

export function serverArgs(profile: string): string[] {
  const base = ["-y", "operator-mcp"];
  return profile === "default" ? base : [...base, "--profile", profile];
}

export const CLIENTS: Client[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    configPath: (home) => join(home, ".claude.json"),
    detect: (home) => existsSync(join(home, ".claude")) || existsSync(join(home, ".claude.json")),
    // The user-scope config is the claude CLI's own format; let it do the write.
    register: ({ name, args, run }) => run("claude", ["mcp", "add", name, "--scope", "user", "--", "npx", ...args]),
    entry: (home, name) => commandLine(readJson(join(home, ".claude.json")).mcpServers?.[name]),
    manual: ({ name, args }) => `claude mcp add ${name} --scope user -- npx ${args.join(" ")}`,
  },
  {
    id: "codex",
    label: "Codex CLI",
    configPath: (home) => join(home, ".codex", "config.toml"),
    detect: (home) => existsSync(join(home, ".codex")),
    register: ({ home, name, args }) => {
      const path = join(home, ".codex", "config.toml");
      const body = `command = "npx"\nargs = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]`;
      const text = existsSync(path) ? readFileSync(path, "utf8") : "";
      writeMerged(path, upsertTomlTable(text, `[mcp_servers.${tomlKey(name)}]`, body));
    },
    entry: (home, name) => tomlEntry(join(home, ".codex", "config.toml"), `[mcp_servers.${tomlKey(name)}]`),
    manual: ({ name, args }) =>
      `# ~/.codex/config.toml\n[mcp_servers.${tomlKey(name)}]\ncommand = "npx"\nargs = [${args
        .map((arg) => JSON.stringify(arg))
        .join(", ")}]`,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    configPath: (home) => join(home, ".gemini", "settings.json"),
    detect: (home) => existsSync(join(home, ".gemini")),
    register: ({ home, name, args }) =>
      editJson(join(home, ".gemini", "settings.json"), (settings) => {
        settings.mcpServers = { ...settings.mcpServers, [name]: { command: "npx", args } };
      }),
    entry: (home, name) => commandLine(readJson(join(home, ".gemini", "settings.json")).mcpServers?.[name]),
    manual: ({ name, args }) =>
      `// ~/.gemini/settings.json\n${JSON.stringify({ mcpServers: { [name]: { command: "npx", args } } }, null, 2)}`,
  },
  {
    id: "opencode",
    label: "opencode",
    configPath: (home) => join(home, ".config", "opencode", "opencode.json"),
    detect: (home) => existsSync(join(home, ".config", "opencode")),
    register: ({ home, name, args }) =>
      editJson(join(home, ".config", "opencode", "opencode.json"), (config) => {
        config.$schema ??= "https://opencode.ai/config.json";
        config.mcp = { ...config.mcp, [name]: { type: "local", command: ["npx", ...args], enabled: true } };
      }),
    entry: (home, name) => commandLine(readJson(join(home, ".config", "opencode", "opencode.json")).mcp?.[name]),
    manual: ({ name, args }) =>
      `// ~/.config/opencode/opencode.json\n${JSON.stringify(
        { mcp: { [name]: { type: "local", command: ["npx", ...args], enabled: true } } },
        null,
        2,
      )}`,
  },
];

export function findClient(id: string): Client | undefined {
  return CLIENTS.find((client) => client.id === id);
}

export function detectClients(home: string): Client[] {
  return CLIENTS.filter((client) => client.detect(home));
}

export function mcpConfigSnippet(client: Client, profile: string, home = ""): string {
  return client.manual({ home, name: serverName(profile), args: serverArgs(profile), run: () => {} });
}
