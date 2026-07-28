import { describe, expect, it, beforeAll } from "vitest";
import { OpenProjectClient } from "../src/client.js";
import { listMetadata } from "../src/resolve.js";
import { buildSearchFilters } from "../src/tools/workPackages.js";
import { toIsoDuration } from "../src/tools/time.js";

const url = process.env.OPENPROJECT_URL;
const apiKey = process.env.OPENPROJECT_API_KEY;
const project = process.env.OPENPROJECT_TEST_PROJECT;
const configured = Boolean(url && apiKey && project);

describe.skipIf(!configured)("live OpenProject instance", () => {
  let client: OpenProjectClient;
  let createdId: number;

  beforeAll(() => {
    client = new OpenProjectClient({
      profile: "live",
      url: url!,
      apiKey: apiKey!,
      conventionsPath: "",
      readOnly: false,
      defaultProject: project,
    });
  });

  it("authenticates and identifies the key's owner", async () => {
    const me = await client.me();
    expect(me.id).toBeGreaterThan(0);
    expect(me.name).toBeTruthy();
  });

  it("lists every metadata kind the tools resolve against", async () => {
    for (const kind of ["types", "statuses", "priorities", "activities"] as const) {
      const entries = await listMetadata(client, kind);
      expect(entries.length, `${kind} came back empty`).toBeGreaterThan(0);
      expect(entries[0]).toHaveProperty("name");
    }
  });

  it("accepts the open-status operator", async () => {
    const result = await client.collection(`/projects/${project}/work_packages`, {
      filters: await buildSearchFilters(client, { status: "open", project }),
      pageSize: 1,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("accepts the >d operator for updatedAt", async () => {
    const result = await client.collection(`/projects/${project}/work_packages`, {
      filters: await buildSearchFilters(client, { updatedSince: "2000-01-01", project }),
      pageSize: 1,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("creates, reads, updates and comments on a work package", async () => {
    const [type] = await listMetadata(client, "types", project);
    const created = await client.request("POST", `/projects/${project}/work_packages`, {
      body: { subject: `OPerator smoke ${Date.now()}`, _links: { type: { href: `/api/v3/types/${type.id}` } } },
    });
    createdId = created.id;
    expect(created.lockVersion).toBeTypeOf("number");

    const fetched = await client.request("GET", `/work_packages/${createdId}`);
    const updated = await client.request("PATCH", `/work_packages/${createdId}`, {
      body: { lockVersion: fetched.lockVersion, subject: "OPerator smoke (updated)" },
    });
    expect(updated.subject).toBe("OPerator smoke (updated)");

    const comment = await client.request("POST", `/work_packages/${createdId}/activities`, {
      body: { comment: { raw: "Smoke test comment." } },
    });
    expect(comment.id).toBeGreaterThan(0);
  });

  it("logs time against the work package with only a workPackage link", async () => {
    const entry = await client.request("POST", "/time_entries", {
      body: {
        hours: toIsoDuration(0.25),
        spentOn: new Date().toISOString().slice(0, 10),
        _links: { workPackage: { href: `/api/v3/work_packages/${createdId}` } },
      },
    });
    expect(entry.id).toBeGreaterThan(0);
  });

  it("reads the notification feed with a readIAN filter", async () => {
    const result = await client.collection("/notifications", {
      filters: [{ readIAN: { operator: "=", values: ["f"] } }],
      pageSize: 5,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("accepts read_ian with filters as a query parameter", async () => {
    await client.request("POST", "/notifications/read_ian", {
      query: { filters: JSON.stringify([{ reason: { operator: "=", values: ["dateAlert"] } }]) },
    });
  });
});
