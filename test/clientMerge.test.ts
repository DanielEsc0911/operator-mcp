import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findClient } from "../src/clients.js";
import { serverCommand, serverName } from "../src/serverCommand.js";
import { cmdQuote, spawnRunner } from "../src/install.js";
import { version } from "../src/server.js";

const PINNED = `operator-mcp@${version}`;
const node = { versions: {}, execPath: "/usr/bin/node" };

function home(...dirs: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "operator-merge-"));
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
  return root;
}

const target = (root: string) => ({ home: root, name: "openproject", ...serverCommand("default", node), run: vi.fn(() => "") });
const write = (root: string, file: string, text: string) => writeFileSync(join(root, file), text);
const read = (root: string, file: string) => readFileSync(join(root, file), "utf8");
const json = (root: string, file: string) => JSON.parse(read(root, file));

describe("re-install keeps what the user added (R4)", () => {
  const stale = { command: "npx", args: ["-y", "operator-mcp"], env: { OPENPROJECT_READ_ONLY: "1" }, timeout: 9000 };

  it.each([
    ["gemini", ".gemini", ".gemini/settings.json"],
    ["cursor", ".cursor", ".cursor/mcp.json"],
  ])("%s keeps env and other fields", (id, dir, file) => {
    const root = home(dir);
    write(root, file, JSON.stringify({ mcpServers: { openproject: stale, other: { command: "x" } } }));
    findClient(id)!.register(target(root));
    const { openproject, other } = json(root, file).mcpServers;
    expect(openproject).toEqual({ ...stale, args: ["-y", PINNED] });
    expect(other).toEqual({ command: "x" });
  });

  it("opencode keeps env and a disabled entry disabled", () => {
    const root = home(".config/opencode");
    const entry = { type: "local", command: ["npx", "-y", "operator-mcp"], enabled: false, environment: { OPENPROJECT_READ_ONLY: "1" } };
    write(root, ".config/opencode/opencode.json", JSON.stringify({ mcp: { openproject: entry } }));
    findClient("opencode")!.register(target(root));
    expect(json(root, ".config/opencode/opencode.json").mcp.openproject).toEqual({ ...entry, command: ["npx", "-y", PINNED] });
  });

  it("claude code passes the old env back with -e", () => {
    const root = home();
    write(root, ".claude.json", JSON.stringify({ mcpServers: { openproject: stale } }));
    const context = target(root);
    findClient("claude-code")!.register(context);
    expect(context.run).toHaveBeenLastCalledWith("claude", [
      "mcp", "add", "openproject", "--scope", "user", "-e", "OPENPROJECT_READ_ONLY=1", "--", "npx", "-y", PINNED,
    ]);
  });

  it("codex keeps other keys, inline env and sub-tables", () => {
    const root = home(".codex");
    write(
      root,
      ".codex/config.toml",
      '[mcp_servers.openproject]\ncommand = "npx"\nargs = [\n  "-y",\n  "operator-mcp",\n]\nenv = { OPENPROJECT_READ_ONLY = "1" }\nstartup_timeout_sec = 30\n\n[mcp_servers.openproject.tools]\nx = 1\n',
    );
    findClient("codex")!.register(target(root));
    const text = read(root, ".codex/config.toml");
    expect(text).toContain(`args = ["-y", "${PINNED}"]`);
    expect(text).toContain('env = { OPENPROJECT_READ_ONLY = "1" }');
    expect(text).toContain("startup_timeout_sec = 30");
    expect(text).toContain("[mcp_servers.openproject.tools]");
    expect(text).not.toContain('"operator-mcp",');
  });
});

describe("pinning and bunx (R6, R15)", () => {
  it("pins the running version", () => {
    expect(serverCommand("default", node).args).toEqual(["-y", PINNED]);
  });

  it("registers npx, not bun, when run through bunx", () => {
    const bunx = { versions: { bun: "1.4.4" }, execPath: "/home/ada/.bun/bin/bun" };
    expect(serverCommand("default", bunx)).toEqual({ command: "npx", args: ["-y", PINNED] });
  });
});

describe("codex TOML edges (R13)", () => {
  const register = (text: string) => {
    const root = home(".codex");
    write(root, ".codex/config.toml", text);
    findClient("codex")!.register(target(root));
    return read(root, ".codex/config.toml");
  };

  it("keeps CRLF line endings throughout", () => {
    const text = register('model = "x"\r\n\r\n[mcp_servers.openproject]\r\ncommand = "old"\r\nargs = []\r\n');
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).toContain(`command = "npx"\r\n`);
  });

  it("does not read into the next table", () => {
    const text = register('[mcp_servers.openproject]\nargs = []\n\n[mcp_servers.evil]\ncommand = "evil"\n');
    expect(text).toContain('[mcp_servers.evil]\ncommand = "evil"');
    expect(text.match(/command = "npx"/g)).toHaveLength(1);
  });

  it("matches quoted and spaced headers", () => {
    const text = register('[ mcp_servers . "openproject" ] # mine\ncommand = "old"\n');
    expect(text.match(/mcp_servers/g)).toHaveLength(1);
    expect(text).toContain('command = "npx"');
  });

  it("reads back through a quoted header", () => {
    const root = home(".codex");
    write(root, ".codex/config.toml", '[mcp_servers."openproject"]\r\ncommand = "npx"\r\nargs = ["a"]\r\n');
    expect(findClient("codex")!.entry(root, "openproject")).toEqual(["npx", "a"]);
  });
});

describe("codex TOML forms (H4, H12, H13)", () => {
  const codex = (text: string) => {
    const root = home(".codex");
    write(root, ".codex/config.toml", text);
    return root;
  };
  const register = (root: string) => findClient("codex")!.register(target(root));

  it("replaces a single-quoted header instead of appending a duplicate", () => {
    const root = codex("[mcp_servers.'openproject']\ncommand = \"old\"\n");
    register(root);
    const text = read(root, ".codex/config.toml");
    expect(text.match(/mcp_servers/g)).toHaveLength(1);
    expect(text).toContain('command = "npx"');
  });

  it.each([
    ["a dotted key under [mcp_servers]", '[mcp_servers]\nopenproject.command = "old"\n'],
    ["an inline table under [mcp_servers]", '[mcp_servers]\nopenproject = { command = "old" }\n'],
    ["a root dotted key", 'mcp_servers.openproject.command = "old"\n'],
  ])("refuses to write when openproject is %s", (_form, text) => {
    const root = codex(text);
    expect(() => register(root)).toThrow(/will not rewrite/);
    expect(read(root, ".codex/config.toml")).toBe(text);
  });

  it("reads command and args without spaces around = and over several lines", () => {
    const root = codex('[mcp_servers.openproject]\ncommand="npx"\nargs=[\n  "-y",\n  "operator-mcp",\n]\n');
    expect(findClient("codex")!.entry(root, "openproject")).toEqual(["npx", "-y", "operator-mcp"]);
  });

  it("replaces a multi-line args whose strings contain a bracket", () => {
    const root = codex('[mcp_servers.openproject]\ncommand = "old"\nargs = [\n  "--x=[a]",\n]\nstartup_timeout_sec = 30\n');
    register(root);
    const text = read(root, ".codex/config.toml");
    expect(text).not.toContain("--x=[a]");
    expect(text).toContain("startup_timeout_sec = 30");
    expect(text).not.toMatch(/^\]/m);
  });

  it("reads a JSON file with trailing commas", () => {
    const root = home(".cursor");
    write(root, ".cursor/mcp.json", '{ "mcpServers": { "openproject": { "command": "npx", "args": ["a",], }, }, }');
    expect(findClient("cursor")!.entry(root, "openproject")).toEqual(["npx", "a"]);
  });
});

describe("Windows (R14)", () => {
  it("wraps npx in cmd /c", () => {
    expect(serverCommand("default", { ...node, platform: "win32" })).toEqual({
      command: "cmd",
      args: ["/c", "npx", "-y", PINNED],
    });
  });

  it("runs claude through a shell on win32 only", () => {
    const spawn = vi.fn(() => ({ status: 0, stdout: "" })) as any;
    spawnRunner("win32", spawn)("claude", ["mcp", "list"]);
    spawnRunner("linux", spawn)("claude", ["mcp", "list"]);
    expect(spawn.mock.calls.map((call: any[]) => call[2].shell)).toEqual([true, false]);
  });
});

describe("cmd quoting (H3)", () => {
  it("leaves plain arguments alone and quotes anything cmd would reinterpret", () => {
    expect(cmdQuote("mcp")).toBe("mcp");
    expect(cmdQuote("--scope")).toBe("--scope");
    expect(cmdQuote("a b")).toBe('"a b"');
    expect(cmdQuote("")).toBe('""');
    expect(cmdQuote("k=a&b|c")).toBe('"k=a&b|c"');
    expect(cmdQuote('say "hi"')).toBe('"say \\"hi\\""');
    expect(cmdQuote("50%")).toBe('"50"^%""');
  });

  it("quotes the arguments on win32 only", () => {
    const spawn = vi.fn(() => ({ status: 0, stdout: "" })) as any;
    spawnRunner("win32", spawn)("claude", ["mcp", "add", "-e", "K=a&b"]);
    spawnRunner("linux", spawn)("claude", ["mcp", "add", "-e", "K=a&b"]);
    expect(spawn.mock.calls.map((call: any[]) => call[1])).toEqual([["mcp", "add", "-e", '"K=a&b"'], ["mcp", "add", "-e", "K=a&b"]]);
  });
});

describe("Claude Code add failure (H2)", () => {
  const entry = { command: "npx", args: ["-y", "operator-mcp@0.1"], env: { OPENPROJECT_READ_ONLY: "1" } };

  it("restores the old entry when the new add fails, then reports the failure", () => {
    const root = home();
    write(root, ".claude.json", JSON.stringify({ mcpServers: { openproject: entry } }));
    let adds = 0;
    const run = vi.fn((_command: string, args: string[]) => {
      if (args[1] === "add" && ++adds === 1) throw new Error("add failed");
      return "";
    });
    expect(() => findClient("claude-code")!.register({ ...target(root), run })).toThrow("add failed");
    expect(run).toHaveBeenLastCalledWith("claude", [
      "mcp", "add", "openproject", "--scope", "user", "-e", "OPENPROJECT_READ_ONLY=1", "--", "npx", "-y", "operator-mcp@0.1",
    ]);
  });

  it("does not try to restore when the remove itself failed", () => {
    const root = home();
    write(root, ".claude.json", JSON.stringify({ mcpServers: { openproject: entry } }));
    const run = vi.fn(() => {
      throw new Error("remove failed");
    });
    expect(() => findClient("claude-code")!.register({ ...target(root), run })).toThrow("remove failed");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("the manual command carries the old env", () => {
    const root = home();
    write(root, ".claude.json", JSON.stringify({ mcpServers: { openproject: entry } }));
    expect(findClient("claude-code")!.manual(target(root))).toContain("-e OPENPROJECT_READ_ONLY=1 --");
  });

  it("the manual command never prints a secret from the old env", () => {
    const root = home();
    const env = { OPENPROJECT_API_KEY: "sk-secret", OPENPROJECT_READ_ONLY: "1" };
    write(root, ".claude.json", JSON.stringify({ mcpServers: { openproject: { ...entry, env } } }));
    const manual = findClient("claude-code")!.manual(target(root));
    expect(manual).not.toContain("sk-secret");
    expect(manual).toContain("-e OPENPROJECT_API_KEY=<your value>");
    expect(manual).toContain("-e OPENPROJECT_READ_ONLY=1");
  });
});

describe("JSONC (R37)", () => {
  it("refuses to rewrite a file with comments and leaves it untouched", () => {
    const root = home(".gemini");
    const text = '{\n  // my servers\n  "mcpServers": {}\n}\n';
    write(root, ".gemini/settings.json", text);
    expect(() => findClient("gemini")!.register(target(root))).toThrow(/comments/);
    expect(read(root, ".gemini/settings.json")).toBe(text);
  });

  it("reads an entry out of a commented file, ignoring // inside strings", () => {
    const root = home(".cursor");
    write(root, ".cursor/mcp.json", '{ /* c */ "mcpServers": { "openproject": { "command": "http://x//y" } } // end\n}');
    expect(findClient("cursor")!.entry(root, serverName("default"))).toEqual(["http://x//y"]);
  });

  it("uses opencode.jsonc when it exists", () => {
    const root = home(".config/opencode");
    write(root, ".config/opencode/opencode.jsonc", "{}");
    findClient("opencode")!.register(target(root));
    expect(json(root, ".config/opencode/opencode.jsonc").mcp.openproject.command).toEqual(["npx", "-y", PINNED]);
  });

  it("reads Claude Code's entry from `claude mcp get`", () => {
    const run = vi.fn(() => "openproject:\n  Scope: Project config\n  Type: stdio\n  Command: npx\n  Args: -y operator-mcp\n");
    expect(findClient("claude-code")!.entry(home(), "openproject", run)).toEqual(["npx", "-y", "operator-mcp"]);
  });

  it("falls back to the file when claude is missing", () => {
    const root = home();
    write(root, ".claude.json", JSON.stringify({ mcpServers: { openproject: { command: "npx", args: ["a"] } } }));
    const run = () => {
      throw new Error("not on PATH");
    };
    expect(findClient("claude-code")!.entry(root, "openproject", run)).toEqual(["npx", "a"]);
  });
});
