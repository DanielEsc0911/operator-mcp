import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OpenProjectClient } from "../src/client.js";
import { listMetadata } from "../src/resolve.js";
import { buildSearchFilters } from "../src/tools/workPackages.js";
import { toIsoDuration } from "../src/tools/time.js";
import { disposable, fixtures, liveClient, project, stamp } from "./support/live.js";

describe.skipIf(!disposable)("live OpenProject endpoints", () => {
  let client: OpenProjectClient;
  let made: ReturnType<typeof fixtures>;
  let wp: { id: number; lockVersion: number };

  beforeAll(async () => {
    client = liveClient();
    made = fixtures(client);
    wp = await made.workPackage(`OPerator live ${stamp()}`);
  });
  afterAll(() => made?.cleanup());

  it("authenticates and identifies the key's owner", async () => {
    const me = await client.me();
    expect(me.id).toBeGreaterThan(0);
    expect(me.name).toBeTruthy();
  });

  it("lists every metadata kind the tools resolve against", async () => {
    for (const kind of ["types", "statuses", "priorities"] as const) {
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
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("accepts <>d with an open upper bound for updatedAt, and rejects >d", async () => {
    const since = await client.collection(`/projects/${project}/work_packages`, {
      filters: await buildSearchFilters(client, { updatedSince: "2000-01-01", project }),
      pageSize: 1,
    });
    expect(since.total).toBeGreaterThanOrEqual(1);
    const future = await client.collection(`/projects/${project}/work_packages`, {
      filters: [{ updatedAt: { operator: "<>d", values: ["2999-01-01", ""] } }],
      pageSize: 1,
    });
    expect(future.total).toBe(0);
    await expect(
      client.collection(`/projects/${project}/work_packages`, { filters: [{ updatedAt: { operator: ">d", values: ["2000-01-01"] } }] }),
    ).rejects.toThrow();
  });

  it("answers groupBy=status with top-level groups", async () => {
    const result = await client.collection(`/projects/${project}/work_packages`, { groupBy: "status", pageSize: 1 });
    expect(result.groups?.length).toBeGreaterThan(0);
    expect(result.groups?.[0]).toHaveProperty("count");
  });

  it("updates with the current lockVersion and answers 409 on a stale one", async () => {
    const fresh = await client.request("GET", `/work_packages/${wp.id}`);
    const updated = await client.request("PATCH", `/work_packages/${wp.id}`, {
      body: { lockVersion: fresh.lockVersion, subject: "OPerator live (updated)" },
    });
    expect(updated.subject).toBe("OPerator live (updated)");
    await expect(
      client.request("PATCH", `/work_packages/${wp.id}`, { body: { lockVersion: fresh.lockVersion, subject: "stale" } }),
    ).rejects.toThrow(/Read the resource again/);
  });

  it("comments, and lists activities whatever pageSize and sortBy say", async () => {
    await client.request("POST", `/work_packages/${wp.id}/activities`, { body: { comment: { raw: "Live comment." } } });
    const all = await client.collection(`/work_packages/${wp.id}/activities`, { pageSize: 1, sortBy: [["id", "desc"]] });
    expect(all.elements.length).toBeGreaterThanOrEqual(2);
    expect(all.elements.length).toBe(all.total);
  });

  it("logs time with only a workPackage link, and filters time entries by user=me and <>d", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const entry = await client.request("POST", "/time_entries", {
      body: { hours: toIsoDuration(0.25), spentOn: today, _links: { workPackage: { href: `/api/v3/work_packages/${wp.id}` } } },
    });
    const filtered = await client.collection("/time_entries", {
      filters: [
        { user: { operator: "=", values: ["me"] } },
        { spentOn: { operator: "<>d", values: [today, ""] } },
      ],
    });
    expect(filtered.elements.map((item) => item.id)).toContain(entry.id);
    await client.request("DELETE", `/time_entries/${entry.id}`);
  });

  it("reads the unread notification feed with a readIAN filter", async () => {
    const result = await client.collection("/notifications", {
      filters: [{ readIAN: { operator: "=", values: ["f"] } }],
      pageSize: 5,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("collects more than one page", async () => {
    const tag = stamp();
    const batch = 15;
    for (let done = 0; done < 105; done += batch) {
      await Promise.all(Array.from({ length: batch }, (_, i) => made.workPackage(`${tag} ${done + i}`)));
    }
    const result = await client.collectAll(`/projects/${project}/work_packages`, {
      filters: [{ subject: { operator: "~", values: [tag] } }],
    });
    expect(result.total).toBe(105);
    expect(result.count).toBe(105);
    expect(result.truncated).toBe(false);
  }, 180_000);
});
