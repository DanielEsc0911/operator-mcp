import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, statSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configHome, normalizeUrl, profileDir, resolveProfile, loadConfig, saveConfig, assertSecureUrl } from "../src/config.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "operator-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("XDG_CONFIG_HOME", "");
  vi.stubEnv("APPDATA", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configHome", () => {
  it("uses XDG_CONFIG_HOME when it is set", () => {
    expect(configHome({ XDG_CONFIG_HOME: "/xdg" }, "linux")).toBe(join("/xdg", "operator-mcp"));
  });

  it("falls back to ~/.config on Linux and macOS", () => {
    expect(configHome({}, "darwin")).toBe(join(home, ".config", "operator-mcp"));
  });

  it("uses APPDATA on Windows", () => {
    expect(configHome({ APPDATA: "C:\\Users\\ada\\AppData\\Roaming", XDG_CONFIG_HOME: "/xdg" }, "win32")).toBe(
      join("C:\\Users\\ada\\AppData\\Roaming", "operator-mcp"),
    );
  });

  it("places every profile under it", () => {
    vi.stubEnv("XDG_CONFIG_HOME", join(home, "xdg"));
    expect(profileDir("acme")).toBe(join(home, "xdg", "operator-mcp", "acme"));
  });
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

  it("keeps a sub-path install", () => {
    expect(normalizeUrl("https://acme.com/openproject/api/v3")).toBe("https://acme.com/openproject");
  });

  it("drops credentials, query and hash", () => {
    expect(normalizeUrl("https://user:pass@op.acme.com/op/?token=x#frag")).toBe("https://op.acme.com/op");
  });

  it("assumes https for a bare host", () => {
    expect(normalizeUrl("openproject.acme.com")).toBe("https://openproject.acme.com");
    expect(normalizeUrl("acme.com/openproject/")).toBe("https://acme.com/openproject");
    expect(normalizeUrl("localhost:8080")).toBe("https://localhost:8080");
  });

  it("keeps an explicit scheme and an empty answer", () => {
    expect(normalizeUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
    expect(normalizeUrl("  ")).toBe("");
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

  it("accepts dots, dashes and underscores after the first character", () => {
    expect(resolveProfile(["--profile", "acme.prod_2-eu"], {})).toBe("acme.prod_2-eu");
  });

  it("rejects a name that could leave the config directory", () => {
    expect(() => resolveProfile(["--profile", "../../.ssh"], {})).toThrow(/Invalid profile name/);
    expect(() => resolveProfile([], { OPENPROJECT_PROFILE: "a/b" })).toThrow(/Invalid profile name/);
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

describe("assertSecureUrl", () => {
  it("refuses plain http to a remote host", () => {
    expect(() => assertSecureUrl("http://op.acme.com", {})).toThrow(/OPENPROJECT_ALLOW_INSECURE_HTTP/);
    expect(() => loadConfig([], { OPENPROJECT_URL: "http://op.acme.com" })).toThrow(/https/);
  });

  it("allows plain http to loopback", () => {
    for (const url of ["http://localhost:8080", "http://127.0.0.1", "http://[::1]:3000"]) {
      expect(() => assertSecureUrl(url, {})).not.toThrow();
    }
  });

  it("allows plain http when the environment opts in", () => {
    expect(() => assertSecureUrl("http://op.acme.com", { OPENPROJECT_ALLOW_INSECURE_HTTP: "1" })).not.toThrow();
  });
});

describe("credential file mode", () => {
  it.skipIf(process.platform === "win32")("warns on stderr when the file is readable by others, and still loads it", () => {
    const path = saveConfig("acme", { url: "https://op.acme.com", apiKey: "k" });
    chmodSync(path, 0o644);
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    expect(loadConfig(["--profile", "acme"], {}).apiKey).toBe("k");
    expect(String(write.mock.calls[0]?.[0])).toContain(`chmod 600 ${path}`);
    write.mockRestore();
  });

  it("stays quiet for an owner-only file", () => {
    saveConfig("acme", { url: "https://op.acme.com", apiKey: "k" });
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    loadConfig(["--profile", "acme"], {});
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });
});

describe("allowDelete", () => {
  it("is on only when the environment opts in", () => {
    expect(loadConfig([], { OPENPROJECT_ALLOW_DELETE: "1" }).allowDelete).toBe(true);
    expect(loadConfig([], {}).allowDelete).toBe(false);
  });
});

describe("saveConfig", () => {
  it.skipIf(process.platform === "win32")("writes owner-only permissions", () => {
    const path = saveConfig("acme", { url: "https://op.acme.com", apiKey: "secret" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(profileDir("acme")).mode & 0o777).toBe(0o700);
    expect(JSON.parse(readFileSync(path, "utf8")).apiKey).toBe("secret");
  });
});
