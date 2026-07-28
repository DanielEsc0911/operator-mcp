import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeUrl, profileDir, resolveProfile, loadConfig, saveConfig } from "../src/config.js";

let home: string;
const originalHome = process.env.HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "operator-"));
  process.env.HOME = home;
});

afterEach(() => {
  process.env.HOME = originalHome;
});

describe("normalizeUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeUrl("https://op.acme.com/")).toBe("https://op.acme.com");
  });

  it("strips a pasted api path", () => {
    expect(normalizeUrl("https://op.acme.com/api/v3/")).toBe("https://op.acme.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  https://op.acme.com  ")).toBe("https://op.acme.com");
  });
});

describe("resolveProfile", () => {
  it("prefers the --profile argument", () => {
    expect(resolveProfile(["--profile", "acme"], { OPENPROJECT_PROFILE: "other" })).toBe("acme");
  });

  it("falls back to the environment", () => {
    expect(resolveProfile([], { OPENPROJECT_PROFILE: "acme" })).toBe("acme");
  });

  it("defaults to 'default'", () => {
    expect(resolveProfile([], {})).toBe("default");
  });
});

describe("loadConfig", () => {
  it("reads a stored profile", () => {
    saveConfig("acme", { url: "https://op.acme.com", apiKey: "stored-key", defaultProject: "website" });
    const config = loadConfig(["--profile", "acme"], {});
    expect(config.url).toBe("https://op.acme.com");
    expect(config.apiKey).toBe("stored-key");
    expect(config.defaultProject).toBe("website");
    expect(config.conventionsPath).toBe(join(profileDir("acme"), "conventions.md"));
  });

  it("lets the environment override the file", () => {
    saveConfig("acme", { url: "https://op.acme.com", apiKey: "stored-key" });
    const config = loadConfig(["--profile", "acme"], { OPENPROJECT_API_KEY: "env-key" });
    expect(config.apiKey).toBe("env-key");
    expect(config.url).toBe("https://op.acme.com");
  });

  it("normalizes a url coming from the environment", () => {
    const config = loadConfig([], { OPENPROJECT_URL: "https://op.acme.com/api/v3" });
    expect(config.url).toBe("https://op.acme.com");
  });

  it("honours an explicit conventions path", () => {
    const config = loadConfig([], { OPENPROJECT_CONVENTIONS_PATH: "/repo/conventions.md" });
    expect(config.conventionsPath).toBe("/repo/conventions.md");
  });

  it("reads read-only mode", () => {
    expect(loadConfig([], { OPENPROJECT_READ_ONLY: "1" }).readOnly).toBe(true);
    expect(loadConfig([], { OPENPROJECT_READ_ONLY: "true" }).readOnly).toBe(true);
    expect(loadConfig([], {}).readOnly).toBe(false);
  });

  it("returns empty credentials rather than throwing when unconfigured", () => {
    const config = loadConfig([], {});
    expect(config.url).toBe("");
    expect(config.apiKey).toBe("");
  });

  it("ignores an unreadable config file", () => {
    mkdirSync(profileDir("broken"), { recursive: true });
    writeFileSync(join(profileDir("broken"), "config.json"), "{ not json");
    expect(loadConfig(["--profile", "broken"], {}).url).toBe("");
  });
});

describe("saveConfig", () => {
  it("writes owner-only permissions", () => {
    const path = saveConfig("acme", { url: "https://op.acme.com", apiKey: "secret" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(profileDir("acme")).mode & 0o777).toBe(0o700);
    expect(JSON.parse(readFileSync(path, "utf8")).apiKey).toBe("secret");
  });
});
