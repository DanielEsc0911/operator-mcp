import { describe, expect, it } from "vitest";
import { buildInstructions } from "../src/server.js";
import type { Config } from "../src/config.js";

const config: Config = {
  profile: "acme",
  url: "https://op.acme.com",
  apiKey: "secret",
  conventionsPath: "/tmp/conventions.md",
  readOnly: false,
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
