import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { profileDir, saveConfig } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";

const ME = { id: 12, name: "Ada Lovelace", email: "ada@example.com" };

let fetchMock: ReturnType<typeof vi.fn>;
let home: string;
let text: string;
let streams: any;

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function doctor(argv: string[] = ["doctor"], env: NodeJS.ProcessEnv = {}) {
  return runDoctor(argv, streams, env, home);
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: URL) => (String(url).endsWith("/users/me") ? respond(ME) : respond({})));
  vi.stubGlobal("fetch", fetchMock);
  home = mkdtempSync(join(tmpdir(), "operator-doctor-"));
  vi.stubEnv("XDG_CONFIG_HOME", join(home, ".config"));
  vi.stubEnv("APPDATA", "");
  text = "";
  const stdout = new PassThrough();
  stdout.on("data", (chunk: Buffer) => (text += chunk));
  streams = { stdin: new PassThrough(), stdout, stderr: stdout };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("runDoctor", () => {
  it("passes a healthy profile and never prints the key", async () => {
    saveConfig("default", { url: "https://op.example.com", apiKey: "supersecretkey" });
    expect(await doctor()).toBe(0);
    expect(text).toContain("✓ Config file");
    expect(text).toContain("✓ https://op.example.com is reachable");
    expect(text).toContain("✓ API key accepted — Ada Lovelace");
    expect(text).not.toContain("supersecretkey");
    expect(text).not.toContain("✗");
  });

  it("points at setup when nothing is configured, and makes no request", async () => {
    expect(await doctor(["doctor", "--profile", "acme"])).toBe(1);
    expect(text).toContain("✗ No config file");
    expect(text).toContain("operator-mcp setup --profile acme");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails a config file that lacks a key", async () => {
    saveConfig("default", { url: "https://op.example.com" });
    expect(await doctor()).toBe(1);
    expect(text).toContain("has no URL or API key");
  });

  it("accepts credentials from the environment without a file", async () => {
    const env = { OPENPROJECT_URL: "https://op.example.com", OPENPROJECT_API_KEY: "k" };
    expect(await doctor(["doctor"], env)).toBe(0);
    expect(text).toContain("from the environment");
  });

  it.skipIf(process.platform === "win32")("flags a config file other users can read", async () => {
    saveConfig("default", { url: "https://op.example.com", apiKey: "k" });
    chmodSync(join(profileDir("default"), "config.json"), 0o644);
    expect(await doctor()).toBe(1);
    expect(text).toContain("chmod 600");
  });

  it("reports an unreachable instance and skips the key check", async () => {
    saveConfig("default", { url: "https://op.invalid", apiKey: "k" });
    fetchMock.mockRejectedValue(new TypeError("getaddrinfo ENOTFOUND"));
    expect(await doctor()).toBe(1);
    expect(text).toContain("✗ Cannot reach https://op.invalid");
    expect(text).not.toContain("API key accepted");
  });

  it("explains a rejected key", async () => {
    saveConfig("default", { url: "https://op.example.com", apiKey: "k" });
    fetchMock.mockImplementation(async (url: URL) => (String(url).endsWith("/users/me") ? respond({}, 401) : respond({})));
    expect(await doctor()).toBe(1);
    expect(text).toContain("/my/access_token");
  });

  it("shows what each detected agent runs, and which lack an entry", async () => {
    saveConfig("default", { url: "https://op.example.com", apiKey: "k" });
    mkdirSync(join(home, ".gemini"));
    writeFileSync(
      join(home, ".gemini", "settings.json"),
      JSON.stringify({ mcpServers: { openproject: { command: "npx", args: ["-y", "operator-mcp"] } } }),
    );
    mkdirSync(join(home, ".codex"));
    expect(await doctor()).toBe(1);
    expect(text).toContain("✓ Gemini CLI runs: npx -y operator-mcp");
    expect(text).toContain("✗ Codex CLI has no \"openproject\" entry");
    expect(text).toContain("operator-mcp install");
  });
});
