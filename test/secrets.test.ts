import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { connect, callTool } from "./support/harness.js";
import workPackage from "./fixtures/workPackage.json" with { type: "json" };

const API_KEY = "k3y-that-must-not-leak";
const PASSWORD = "url-password";
let fetchMock: ReturnType<typeof vi.fn>;

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  const home = mkdtempSync(join(tmpdir(), "operator-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("XDG_CONFIG_HOME", "");
  vi.stubEnv("APPDATA", "");
  fetchMock = vi.fn(async (url: URL) =>
    url.pathname.endsWith("/users/me")
      ? respond({ id: 12, name: "Ada", email: "ada@example.com" })
      : url.pathname.endsWith("/work_packages/1234")
        ? respond(workPackage)
        : respond({ message: "Unauthorized" }, 401),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("credentials never reach the agent", () => {
  it("keeps the API key and URL credentials out of instructions, results and errors", async () => {
    const config = loadConfig([], {
      OPENPROJECT_URL: `https://user:${PASSWORD}@op.acme.com/?token=abc`,
      OPENPROJECT_API_KEY: API_KEY,
    });
    const client = await connect(config);
    const texts = [
      client.getInstructions() ?? "",
      (await callTool(client, "whoami")).text,
      (await callTool(client, "get_work_package", { id: 1234 })).text,
      (await callTool(client, "list_projects")).text,
    ];

    expect(texts[3]).toContain("API key rejected");
    for (const text of texts) {
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain("token=abc");
    }
  });
});
