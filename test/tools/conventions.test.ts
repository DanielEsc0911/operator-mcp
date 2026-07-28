import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, callTool, testConfig } from "../support/harness.js";

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };

const MANUAL = `# ACME — OpenProject conventions

## Git / GitLab
- Branch: \`{type}/{wp-id}-{slug}\`

## Workflow
- Move to \`In progress\` only once a branch exists.
`;

let path: string;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), "operator-tool-manual-")), "conventions.md");
  writeFileSync(path, MANUAL);
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(ME), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function withManual(extra: Partial<typeof testConfig> = {}) {
  return { ...testConfig, conventionsPath: path, ...extra };
}

describe("instructions", () => {
  it("carry the manual to every client at connection", async () => {
    const client = await connect(withManual());
    expect(client.getInstructions()).toContain("- Branch: `{type}/{wp-id}-{slug}`");
  });
});

describe("conventions", () => {
  it("returns the manual as plain markdown, not escaped json", async () => {
    const client = await connect(withManual());
    const result = await callTool(client, "conventions");

    expect(result.text).toBe(MANUAL);
    expect(result.text).not.toContain("\\n");
  });

  it("says so when no manual exists", async () => {
    const client = await connect({ ...testConfig, conventionsPath: join(tmpdir(), "absent-manual.md") });
    expect((await callTool(client, "conventions")).text).toContain("No conventions manual");
  });
});

describe("add_convention", () => {
  it("appends a rule to an existing section", async () => {
    const client = await connect(withManual());
    const result = (await callTool(client, "add_convention", {
      section: "Git / GitLab",
      rule: "Rebase, never merge.",
    })).json();

    expect(result).toMatchObject({ section: "Git / GitLab", rule: "Rebase, never merge." });
    expect(readFileSync(path, "utf8")).toContain("- Rebase, never merge.");
  });

  it("creates a section that does not exist yet", async () => {
    const client = await connect(withManual());
    await callTool(client, "add_convention", { section: "Reviews", rule: "Two approvals before merge." });

    expect(readFileSync(path, "utf8")).toContain("## Reviews\n\n- Two approvals before merge.");
  });

  it("is blocked in read-only mode", async () => {
    const client = await connect(withManual({ readOnly: true }));
    const result = await callTool(client, "add_convention", { section: "Git / GitLab", rule: "Nope." });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });
});

describe("remove_convention", () => {
  it("refuses without confirm and leaves the file untouched", async () => {
    const client = await connect(withManual());
    const result = await callTool(client, "remove_convention", {
      section: "Workflow",
      rule: "Move to `In progress` only once a branch exists.",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("confirm: true");
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });

  it("removes with confirm and keeps a backup", async () => {
    const client = await connect(withManual());
    const result = (await callTool(client, "remove_convention", {
      section: "Workflow",
      rule: "Move to `In progress` only once a branch exists.",
      confirm: true,
    })).json();

    expect(result.removed).toBe(true);
    expect(readFileSync(result.backupPath, "utf8")).toBe(MANUAL);
    expect(readFileSync(path, "utf8")).not.toContain("only once a branch exists");
  });

  it("reports the real bullets when nothing matches", async () => {
    const client = await connect(withManual());
    const result = (await callTool(client, "remove_convention", {
      section: "Workflow", rule: "a rule nobody wrote", confirm: true,
    })).json();

    expect(result.removed).toBe(false);
    expect(result.bullets).toEqual(["Move to `In progress` only once a branch exists."]);
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });

  it("is blocked in read-only mode even with confirm", async () => {
    const client = await connect(withManual({ readOnly: true }));
    const result = await callTool(client, "remove_convention", {
      section: "Workflow", rule: "Move to `In progress` only once a branch exists.", confirm: true,
    });

    expect(result.isError).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });
});

describe("the conventions resource", () => {
  it("serves the manual at openproject://conventions", async () => {
    const client = await connect(withManual());
    const result = await client.readResource({ uri: "openproject://conventions" });

    expect(result.contents[0].text).toBe(MANUAL);
    expect(result.contents[0].mimeType).toBe("text/markdown");
  });
});
