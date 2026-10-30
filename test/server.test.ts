import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { buildInstructions } from "../src/server.js";
import { connect } from "./support/harness.js";
import type { Config } from "../src/config.js";

const config: Config = {
  profile: "acme",
  url: "https://op.acme.com",
  apiKey: "secret",
  conventionsPath: "/tmp/conventions.md",
  readOnly: false,
  allowDelete: false,
};

const identity = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };

describe("buildInstructions", () => {
  it("names the user, instance and profile", () => {
    expect(buildInstructions(config, identity, null)).toContain(
      'You are Daniel Escalona (daescalona@proton.me) on https://op.acme.com, profile "acme".',
    );
  });

  it("carries the manual verbatim", () => {
    const manual = "## Git\n- Branch: `{type}/{wp-id}-{slug}`";
    const instructions = buildInstructions(config, identity, manual);
    expect(instructions).toContain("Follow these conventions in all OpenProject work:");
    expect(instructions).toContain("- Branch: `{type}/{wp-id}-{slug}`");
  });

  it("never truncates a large manual", () => {
    const manual = `## Rules\n${"- a rule\n".repeat(5000)}`;
    expect(buildInstructions(config, identity, manual)).toContain(manual.trim());
  });

  it("mentions the default project when configured", () => {
    expect(buildInstructions({ ...config, defaultProject: "website" }, identity, null)).toContain(
      "Default project: website.",
    );
  });

  it("announces read-only mode", () => {
    expect(buildInstructions({ ...config, readOnly: true }, identity, null)).toContain("This server is read-only.");
  });

  it("degrades gracefully when identity could not be resolved", () => {
    const instructions = buildInstructions(config, null, "## Git\n- Rebase.");
    expect(instructions).toContain("Identity is unresolved");
    expect(instructions).toContain("- Rebase.");
  });

  it("omits the conventions block when there is no manual", () => {
    expect(buildInstructions(config, identity, null)).not.toContain("Follow these conventions");
    expect(buildInstructions(config, identity, "   ")).not.toContain("Follow these conventions");
  });
});

describe("tool registration", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(identity), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reports the package version", async () => {
    const client = await connect();
    const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(client.getServerVersion()?.version).toBe(version);
  });

  it("registers exactly the twenty planned tools", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "add_convention", "api_request", "comment_work_package", "conventions", "create_work_package",
      "get_work_package", "link_work_packages", "list_activities", "list_metadata", "list_notifications",
      "list_projects", "list_users", "log_time", "mark_notifications_read", "my_work",
      "remove_convention", "search_work_packages", "update_work_package", "watch_work_package", "whoami",
    ]);
  });
});
