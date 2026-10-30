import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findClient, offeredClients } from "../src/clients.js";
import { registerAll } from "../src/install.js";

const claude = findClient("claude-code")!;
const gemini = findClient("gemini")!;

function target() {
  return {
    home: mkdtempSync(join(tmpdir(), "operator-install-")),
    name: "openproject",
    command: "npx",
    args: ["-y", "operator-mcp"],
    run: vi.fn(),
  };
}

describe("registerAll", () => {
  it("reports success per client", () => {
    const context = target();
    const outcomes = registerAll([gemini], context);
    expect(outcomes).toEqual([{ client: gemini }]);
  });

  it("captures a failure as a message instead of throwing", () => {
    const context = { ...target(), run: () => { throw new Error("`claude` is not on your PATH"); } };
    expect(registerAll([claude], context)).toEqual([{ client: claude, error: "`claude` is not on your PATH" }]);
  });

  it("keeps registering the rest after one client fails", () => {
    const context = { ...target(), run: () => { throw new Error("nope"); } };
    const outcomes = registerAll([claude, gemini], context);
    expect(outcomes.map((outcome) => outcome.error)).toEqual(["nope", undefined]);
  });
});

describe("every client", () => {
  it("offers manual instructions that name the package", () => {
    vi.stubEnv("APPDATA", "");
    const context = target();
    for (const client of offeredClients(context.home)) {
      expect(client.manual(context)).toContain("operator-mcp");
      expect(client.configPath(context.home)).toContain(context.home);
    }
    vi.unstubAllEnvs();
  });
});

describe("patchAgents", () => {
  it("registers every detected agent with --yes and reports where it wrote", async () => {
    const { mkdirSync, readFileSync } = await import("node:fs");
    const { PassThrough } = await import("node:stream");
    const { createInterface } = await import("node:readline/promises");
    const { patchAgents } = await import("../src/install.js");
    const home = mkdtempSync(join(tmpdir(), "operator-patch-"));
    mkdirSync(join(home, ".cursor"));
    let text = "";
    const stdout = new PassThrough();
    stdout.on("data", (chunk: Buffer) => (text += chunk));
    const streams = { stdin: new PassThrough(), stdout, stderr: stdout } as any;
    const rl = createInterface({ input: streams.stdin, output: stdout });
    const patched = await patchAgents(["install", "--yes"], streams, rl, home);
    rl.close();
    expect(patched.map((client) => client.id)).toEqual(["cursor"]);
    expect(text).toContain("Patching in  done   Cursor");
    expect(text).toContain(join("~", ".cursor", "mcp.json"));
    expect(JSON.parse(readFileSync(join(home, ".cursor/mcp.json"), "utf8")).mcpServers.openproject).toBeDefined();
  });
});
