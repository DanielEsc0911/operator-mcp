import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { saveConfig } from "../src/config.js";
import {
  describeExisting,
  keyHint,
  maskKey,
  nonInteractiveInput,
  runSetup,
  scaffoldConventions,
  verifyCredentials,
} from "../src/setup.js";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("XDG_CONFIG_HOME", mkdtempSync(join(tmpdir(), "operator-setup-")));
  vi.stubEnv("APPDATA", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function capture() {
  let text = "";
  const stdout = new PassThrough() as any;
  stdout.on("data", (chunk: Buffer) => (text += chunk));
  const streams = { stdin: new PassThrough() as any, stdout, stderr: stdout };
  return { streams, text: () => text };
}

describe("verifyCredentials", () => {
  it("returns the identity and how many projects are visible", async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      url.pathname === "/api/v3/users/me" ? respond(ME) : respond({ total: 7, count: 1, _embedded: { elements: [] } }),
    );

    expect(await verifyCredentials("https://op.acme.com", "secret")).toEqual({
      identity: ME,
      projectCount: 7,
    });
  });

  it("propagates a readable message for a bad key", async () => {
    fetchMock.mockResolvedValue(respond({}, 401));
    await expect(verifyCredentials("https://op.acme.com", "wrong")).rejects.toThrow("API key rejected");
  });

  it("propagates a readable message for an unreachable host", async () => {
    fetchMock.mockRejectedValue(new TypeError("getaddrinfo ENOTFOUND"));
    await expect(verifyCredentials("https://op.invalid", "secret")).rejects.toThrow("Cannot reach https://op.invalid");
  });
});

describe("scaffoldConventions", () => {
  it("copies the packaged template when no manual exists", () => {
    const path = join(mkdtempSync(join(tmpdir(), "operator-scaffold-")), "conventions.md");
    expect(scaffoldConventions(path)).toBe(path);
    expect(readFileSync(path, "utf8")).toContain("## Git / GitLab");
  });

  it("creates any missing parent directory", () => {
    const path = join(mkdtempSync(join(tmpdir(), "operator-scaffold-")), "nested", "conventions.md");
    scaffoldConventions(path);
    expect(existsSync(path)).toBe(true);
  });

  it("never overwrites an existing manual", () => {
    const path = join(mkdtempSync(join(tmpdir(), "operator-scaffold-")), "conventions.md");
    writeFileSync(path, "# Mine\n");
    expect(scaffoldConventions(path)).toBeNull();
    expect(readFileSync(path, "utf8")).toBe("# Mine\n");
  });
});

describe("nonInteractiveInput", () => {
  it("takes the url from --url and the key from OPENPROJECT_API_KEY", () => {
    expect(
      nonInteractiveInput(["setup", "--non-interactive", "--url", "https://op.example.com/"], { OPENPROJECT_API_KEY: "k" }),
    ).toEqual({ url: "https://op.example.com", apiKey: "k" });
  });

  it("falls back to OPENPROJECT_URL", () => {
    const input = nonInteractiveInput(["setup"], { OPENPROJECT_URL: "https://op.example.com", OPENPROJECT_API_KEY: "k" });
    expect(input.url).toBe("https://op.example.com");
  });

  it("names what is missing instead of prompting", () => {
    expect(() => nonInteractiveInput(["setup"], { OPENPROJECT_API_KEY: "k" })).toThrow(/--url or OPENPROJECT_URL/);
    expect(() => nonInteractiveInput(["setup", "--url", "https://op.example.com"], {})).toThrow(/OPENPROJECT_API_KEY/);
  });
});

describe("keyHint", () => {
  it("points at the access token page, old and new", () => {
    const hint = keyHint("https://op.example.com");
    expect(hint).toContain("https://op.example.com/my/access_tokens");
    expect(hint).toContain("My account");
  });
});

describe("describeExisting", () => {
  it("shows the stored url and a masked key", () => {
    saveConfig("acme", { url: "https://op.example.com", apiKey: "supersecretkey" });
    const text = describeExisting("acme")!;
    expect(text).toContain("https://op.example.com");
    expect(text).toContain(maskKey("supersecretkey"));
    expect(text).not.toContain("supersecretkey");
  });

  it("is null for a new profile", () => {
    expect(describeExisting("fresh")).toBeNull();
  });
});

describe("runSetup --non-interactive", () => {
  const env = { OPENPROJECT_API_KEY: "k" };

  it("saves the profile after a successful verify", async () => {
    vi.stubEnv("OPENPROJECT_API_KEY", env.OPENPROJECT_API_KEY);
    fetchMock.mockImplementation(async (url: URL) =>
      url.pathname === "/api/v3/users/me" ? respond(ME) : respond({ total: 2, count: 1, _embedded: { elements: [] } }),
    );
    const { streams, text } = capture();
    const argv = ["setup", "--profile", "ci", "--non-interactive", "--url", "https://op.example.com"];
    expect(await runSetup(argv, streams)).toBe(0);
    expect(text()).toContain("Daniel Escalona");
    expect(describeExisting("ci")).toContain("https://op.example.com");
  });

  it("exits non-zero on a rejected key and saves nothing", async () => {
    vi.stubEnv("OPENPROJECT_API_KEY", "wrong");
    fetchMock.mockResolvedValue(respond({}, 401));
    const { streams } = capture();
    await expect(
      runSetup(["setup", "--profile", "ci", "--non-interactive", "--url", "https://op.example.com"], streams),
    ).rejects.toThrow("API key rejected");
    expect(describeExisting("ci")).toBeNull();
  });
});
