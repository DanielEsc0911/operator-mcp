import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCredentials, scaffoldConventions } from "../src/setup.js";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

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
