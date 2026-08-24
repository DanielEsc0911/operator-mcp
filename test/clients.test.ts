import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIENTS, detectClients, findClient, serverArgs, serverName, mcpConfigSnippet } from "../src/clients.js";

function home(...dirs: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "operator-home-"));
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
  return root;
}

function target(root: string, profile = "default") {
  return { home: root, name: serverName(profile), args: serverArgs(profile), run: vi.fn() };
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("serverName / serverArgs", () => {
  it("uses a bare name and no profile flag for the default profile", () => {
    expect(serverName("default")).toBe("openproject");
    expect(serverArgs("default")).toEqual(["-y", "operator-mcp"]);
  });

  it("suffixes the name and passes --profile for any other profile", () => {
    expect(serverName("acme")).toBe("openproject-acme");
    expect(serverArgs("acme")).toEqual(["-y", "operator-mcp", "--profile", "acme"]);
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
      "mcp", "add", "openproject", "--scope", "user", "--", "npx", "-y", "operator-mcp",
    ]);
  });

  it("passes the profile flag through for a named profile", () => {
    const context = target(home(".claude"), "acme");
    findClient("claude-code")!.register(context);
    expect(context.run).toHaveBeenCalledWith("claude", [
      "mcp", "add", "openproject-acme", "--scope", "user", "--",
      "npx", "-y", "operator-mcp", "--profile", "acme",
    ]);
  });
});

describe("gemini", () => {
  it("creates settings.json when the file does not exist yet", () => {
    const root = home(".gemini");
    findClient("gemini")!.register(target(root));
    expect(readJson(join(root, ".gemini/settings.json")).mcpServers.openproject).toEqual({
      command: "npx",
      args: ["-y", "operator-mcp"],
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
      command: ["npx", "-y", "operator-mcp"],
      enabled: true,
    });
  });
});

describe("codex", () => {
  it("appends an mcp_servers block to config.toml", () => {
    const root = home(".codex");
    findClient("codex")!.register(target(root));
    const text = readFileSync(join(root, ".codex/config.toml"), "utf8");
    expect(text).toContain("[mcp_servers.openproject]");
    expect(text).toContain('command = "npx"');
    expect(text).toContain('args = ["-y", "operator-mcp"]');
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
