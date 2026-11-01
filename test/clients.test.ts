import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIENTS, detectClients, findClient, mcpConfigSnippet } from "../src/clients.js";
import { desktopConfigPath, serverCommand, serverName } from "../src/serverCommand.js";
import { version } from "../src/server.js";

const PINNED = `operator-mcp@${version}`;

function home(...dirs: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "operator-home-"));
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
  return root;
}

function target(root: string, profile = "default") {
  return { home: root, name: serverName(profile), ...serverCommand(profile, node), run: vi.fn() };
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

const node = { versions: {}, execPath: "/usr/bin/node" };
const binary = { versions: { bun: "1.4.4" }, execPath: "/home/ada/.local/bin/operator-mcp" };

describe("serverName / serverCommand", () => {
  it("uses a bare name and no profile flag for the default profile", () => {
    expect(serverName("default")).toBe("openproject");
    expect(serverCommand("default", node)).toEqual({ command: "npx", args: ["-y", PINNED] });
  });

  it("suffixes the name and passes --profile for any other profile", () => {
    expect(serverName("acme")).toBe("openproject-acme");
    expect(serverCommand("acme", node)).toEqual({ command: "npx", args: ["-y", PINNED, "--profile", "acme"] });
  });

  it("registers the standalone binary by its absolute path when running under Bun", () => {
    expect(serverCommand("default", binary)).toEqual({ command: binary.execPath, args: [] });
    expect(serverCommand("acme", binary)).toEqual({ command: binary.execPath, args: ["--profile", "acme"] });
  });

  it("writes the binary path into a client config", () => {
    const root = home(".gemini");
    findClient("gemini")!.register({ home: root, name: "openproject", ...serverCommand("default", binary), run: vi.fn() });
    expect(readJson(join(root, ".gemini/settings.json")).mcpServers.openproject).toEqual({
      command: binary.execPath,
      args: [],
    });
  });
});

describe("detectClients", () => {
  it("finds only the clients whose config directory exists", () => {
    const root = home(".codex", ".config/opencode");
    expect(detectClients(root).map((client) => client.id).sort()).toEqual(["codex", "opencode"]);
  });

  it("detects Claude Code from a bare ~/.claude.json with no directory", () => {
    const root = home();
    writeFileSync(join(root, ".claude.json"), "{}\n");
    expect(detectClients(root).map((client) => client.id)).toEqual(["claude-code"]);
  });

  it("finds nothing in an empty home", () => {
    expect(detectClients(home())).toEqual([]);
  });
});

describe("claude-code", () => {
  it("delegates to the claude CLI rather than editing its config", () => {
    const root = home(".claude");
    const context = target(root);
    findClient("claude-code")!.register(context);
    expect(context.run).toHaveBeenCalledWith("claude", [
      "mcp", "add", "openproject", "--scope", "user", "--", "npx", "-y", PINNED,
    ]);
  });

  it("passes the profile flag through for a named profile", () => {
    const context = target(home(".claude"), "acme");
    findClient("claude-code")!.register(context);
    expect(context.run).toHaveBeenCalledWith("claude", [
      "mcp", "add", "openproject-acme", "--scope", "user", "--",
      "npx", "-y", PINNED, "--profile", "acme",
    ]);
  });
});

describe("antigravity", () => {
  it("writes the agy config, filling a blank file", () => {
    const root = home(".gemini/config");
    const path = join(root, ".gemini/config/mcp_config.json");
    writeFileSync(path, "");
    const client = findClient("antigravity")!;
    expect(detectClients(root)).toContain(client);
    client.register(target(root));
    expect(readJson(path).mcpServers.openproject).toEqual({ command: "npx", args: ["-y", PINNED] });
  });
});

describe("gemini", () => {
  it("creates settings.json when the file does not exist yet", () => {
    const root = home(".gemini");
    findClient("gemini")!.register(target(root));
    expect(readJson(join(root, ".gemini/settings.json")).mcpServers.openproject).toEqual({
      command: "npx",
      args: ["-y", PINNED],
    });
  });

  it("keeps unrelated servers and settings intact", () => {
    const root = home(".gemini");
    const path = join(root, ".gemini/settings.json");
    writeFileSync(path, JSON.stringify({ theme: "dark", mcpServers: { other: { command: "foo" } } }));
    findClient("gemini")!.register(target(root));

    const settings = readJson(path);
    expect(settings.theme).toBe("dark");
    expect(settings.mcpServers.other).toEqual({ command: "foo" });
    expect(settings.mcpServers.openproject.command).toBe("npx");
  });
});

describe("opencode", () => {
  it("writes a local mcp entry in opencode's own shape", () => {
    const root = home(".config/opencode");
    findClient("opencode")!.register(target(root));
    expect(readJson(join(root, ".config/opencode/opencode.json")).mcp.openproject).toEqual({
      type: "local",
      command: ["npx", "-y", PINNED],
      enabled: true,
    });
  });
});

describe("mimocode", () => {
  it("writes opencode's shape into mimocode.json", () => {
    const root = home(".config/mimocode");
    const client = findClient("mimocode")!;
    expect(detectClients(root)).toContain(client);
    client.register(target(root));
    const config = readJson(join(root, ".config/mimocode/mimocode.json"));
    expect(config.$schema).toBeUndefined();
    expect(config.mcp.openproject.command).toEqual(["npx", "-y", PINNED]);
  });
});

describe("codex", () => {
  it("appends an mcp_servers block to config.toml", () => {
    const root = home(".codex");
    findClient("codex")!.register(target(root));
    const text = readFileSync(join(root, ".codex/config.toml"), "utf8");
    expect(text).toContain("[mcp_servers.openproject]");
    expect(text).toContain('command = "npx"');
    expect(text).toContain(`args = ["-y", "${PINNED}"]`);
  });

  it("replaces its own block instead of duplicating it, leaving other blocks alone", () => {
    const root = home(".codex");
    const path = join(root, ".codex/config.toml");
    writeFileSync(path, 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "foo"\n');
    findClient("codex")!.register(target(root));
    findClient("codex")!.register(target(root));

    const text = readFileSync(path, "utf8");
    expect(text.match(/\[mcp_servers\.openproject\]/g)).toHaveLength(1);
    expect(text).toContain('model = "gpt-5"');
    expect(text).toContain("[mcp_servers.other]");
    expect(text).toContain('command = "foo"');
  });
});

describe("backups", () => {
  it("backs up every file it rewrites, and none that it creates", () => {
    const root = home(".gemini");
    const dir = join(root, ".gemini");
    findClient("gemini")!.register(target(root));
    expect(readdirSync(dir)).toEqual(["settings.json"]);

    findClient("gemini")!.register(target(root));
    expect(readdirSync(dir).filter((file) => file.endsWith(".bak"))).toHaveLength(1);
  });
});

describe("mcpConfigSnippet", () => {
  it("renders every client's manual instructions", () => {
    for (const client of CLIENTS) {
      expect(mcpConfigSnippet(client, "default")).toContain("operator-mcp");
    }
  });
});

describe("entry", () => {
  const agents = ["codex", "gemini", "opencode", "mimocode", "qwen", "kimi", "kimi-code", "iflow", "kiro", "windsurf"];
  const agentDirs = [".codex", ".gemini", ".config/opencode", ".config/mimocode", ".qwen", ".kimi", ".kimi-code", ".iflow", ".kiro/settings", ".codeium/windsurf"];

  it.each(agents)("%s reads back the command it registered", (id) => {
    const root = home(...agentDirs);
    const client = findClient(id)!;
    expect(client.detect(root)).toBe(true);
    expect(client.entry(root, "openproject-acme")).toBeNull();
    client.register(target(root, "acme"));
    expect(client.entry(root, "openproject-acme")).toEqual(["npx", "-y", PINNED, "--profile", "acme"]);
  });

  it("claude-code reads the user-scope entry from ~/.claude.json", () => {
    const root = home();
    writeFileSync(
      join(root, ".claude.json"),
      JSON.stringify({ mcpServers: { openproject: { type: "stdio", command: "npx", args: ["-y", PINNED] } } }),
    );
    expect(findClient("claude-code")!.entry(root, "openproject")).toEqual(["npx", "-y", PINNED]);
  });

  it("treats an unreadable config as no entry", () => {
    const root = home(".gemini");
    writeFileSync(join(root, ".gemini/settings.json"), "{ nope");
    expect(findClient("gemini")!.entry(root, "openproject")).toBeNull();
  });
});

describe("claude-desktop and cursor", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("knows Claude Desktop's config on macOS and Windows, and offers nothing on Linux", () => {
    expect(desktopConfigPath("/Users/ada", "darwin")).toBe(
      join("/Users/ada", "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    );
    expect(desktopConfigPath("C:/Users/ada", "win32", {})).toBe(join("C:/Users/ada", "AppData", "Roaming", "Claude", "claude_desktop_config.json"));
    expect(desktopConfigPath("/home/ada", "linux")).toBeNull();
  });

  it("prefers APPDATA for Claude Desktop on Windows", () => {
    expect(desktopConfigPath("C:/Users/ada", "win32", { APPDATA: "D:/Roam" })).toBe(join("D:/Roam", "Claude", "claude_desktop_config.json"));
    expect(desktopConfigPath("C:/Users/ada", "win32", {})).toBe(join("C:/Users/ada", "AppData", "Roaming", "Claude", "claude_desktop_config.json"));
  });

  it("detects Claude Desktop by its config directory, except on Linux", () => {
    vi.stubEnv("APPDATA", "");
    const root = home("Library/Application Support/Claude", "AppData/Roaming/Claude");
    const found = detectClients(root).map((client) => client.id);
    expect(found.includes("claude-desktop")).toBe(process.platform !== "linux");
  });

  it("writes Cursor's mcpServers entry into ~/.cursor/mcp.json", () => {
    const root = home(".cursor");
    expect(detectClients(root).map((client) => client.id)).toEqual(["cursor"]);
    findClient("cursor")!.register(target(root));
    expect(readJson(join(root, ".cursor/mcp.json")).mcpServers.openproject).toEqual({ command: "npx", args: ["-y", PINNED] });
    expect(findClient("cursor")!.entry(root, "openproject")).toEqual(["npx", "-y", PINNED]);
  });
});

describe("backups are one rolling .bak", () => {
  it("overwrites the same .bak on every rewrite", () => {
    const root = home(".gemini");
    for (let run = 0; run < 3; run++) findClient("gemini")!.register(target(root));
    expect(readdirSync(join(root, ".gemini")).sort()).toEqual(["settings.json", "settings.json.bak"]);
  });
});
