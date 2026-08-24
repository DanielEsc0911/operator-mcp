import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
  manual: (target: Target) => string;
};

export function serverName(profile: string): string {
  return profile === "default" ? "openproject" : `openproject-${profile}`;
}

export function serverArgs(profile: string): string[] {
  const base = ["-y", "operator-mcp"];
  return profile === "default" ? base : [...base, "--profile", profile];
}

function backup(path: string): void {
  if (!existsSync(path)) return;
  copyFileSync(path, `${path}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`);
}

function writeMerged(path: string, text: string): void {
  backup(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { mode: 0o600 });
}

function editJson(path: string, edit: (document: Record<string, any>) => void): void {
  let document: Record<string, any> = {};
  if (existsSync(path)) {
    try {
      document = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new Error(`${path} is not valid JSON — fix or move it, then run: npx operator-mcp install`);
    }
  }
  edit(document);
  writeMerged(path, `${JSON.stringify(document, null, 2)}\n`);
}

function tomlKey(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
}

function upsertTomlTable(text: string, header: string, body: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(header);
  if (start === -1) return `${text.trimEnd()}\n\n${header}\n${body}\n`.replace(/^\n+/, "");

  const after = lines.findIndex((line, index) => index > start && line.trimStart().startsWith("["));
  const end = after === -1 ? lines.length : after;
  lines.splice(start, end - start, header, ...body.split("\n"), "");
  return lines.join("\n");
}

export const CLIENTS: Client[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    configPath: (home) => join(home, ".claude.json"),
    detect: (home) => existsSync(join(home, ".claude")) || existsSync(join(home, ".claude.json")),
    // The user-scope config is the claude CLI's own format; let it do the write.
    register: ({ name, args, run }) => run("claude", ["mcp", "add", name, "--scope", "user", "--", "npx", ...args]),
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
