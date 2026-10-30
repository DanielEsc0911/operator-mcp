import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIENTS, findClient, type Client } from "../src/clients.js";
import { registerAll, selectClients } from "../src/install.js";

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

describe("selectClients", () => {
  const detected = [claude, gemini];

  it("treats an empty answer as all of them", () => {
    expect(selectClients("", detected)).toEqual(detected);
    expect(selectClients("  ", detected)).toEqual(detected);
    expect(selectClients("all", detected)).toEqual(detected);
  });

  it("registers nothing when the user says none", () => {
    expect(selectClients("none", detected)).toEqual([]);
  });

  it("accepts list positions", () => {
    expect(selectClients("2", detected)).toEqual([gemini]);
    expect(selectClients("1, 2", detected)).toEqual(detected);
  });

  it("accepts client ids", () => {
    expect(selectClients("gemini", detected)).toEqual([gemini]);
  });

  it("ignores tokens that match nothing rather than guessing", () => {
    expect(selectClients("gemini nonsense 9", detected)).toEqual([gemini]);
  });
});

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
    const context = target();
    for (const client of CLIENTS as Client[]) {
      expect(client.manual(context)).toContain("operator-mcp");
      expect(client.configPath(context.home)).toContain(context.home);
    }
  });
});
