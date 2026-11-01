import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import workPackage from "../fixtures/workPackage.json" with { type: "json" };
import notification from "../fixtures/notification.json" with { type: "json" };

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Ada Lovelace", email: "ada@example.com" };
const finished = { ...workPackage, id: 1300, percentageDone: 100, _links: { ...workPackage._links, status: { href: "/api/v3/statuses/18", title: "Done" } } };
const ASSIGNED = { total: 2, count: 2, _embedded: { elements: [workPackage, finished] } };
const CHANGED = { total: 1, count: 1, _embedded: { elements: [workPackage] } };
const FEED = { total: 3, count: 3, _embedded: { elements: [
  notification,
  { ...notification, id: 89, reason: "commented", createdAt: "2026-07-28T10:00:00Z" },
  { ...notification, id: 90, reason: "assigned", createdAt: "2026-07-27T10:00:00Z", _links: { ...notification._links, resource: { href: "/api/v3/work_packages/1300", title: "Other" } } },
] } };
const GROUPS = { ...ASSIGNED, count: 1, groups: [{ value: "In progress", count: 9 }, { value: "Done", count: 4 }] };

let fetchMock: ReturnType<typeof vi.fn>;

function filtersOf(url: URL): any[] {
  return JSON.parse(url.searchParams.get("filters") ?? "[]");
}

function isAssignedQuery(url: URL): boolean {
  return filtersOf(url).some((filter) => filter.assignee);
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: URL) => {
    if (url.pathname === "/api/v3/users/me") return respond(ME);
    if (url.pathname === "/api/v3/notifications") return respond(FEED);
    if (isAssignedQuery(url)) return respond(url.searchParams.get("groupBy") ? GROUPS : ASSIGNED);
    return respond(CHANGED);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function urlsFor(path: string): URL[] {
  return fetchMock.mock.calls.map(([url]) => url as URL).filter((url) => url.pathname === `/api/v3${path}`);
}

describe("briefing", () => {
  it("answers pending, unread and recent in one call", async () => {
    const client = await connect();
    const result = (await callTool(client, "briefing")).json();

    expect(result.scope).toBe("whole instance");
    expect(result.urlTemplate).toBe("https://op.acme.com/work_packages/{id}");
    expect(result.assignedToMe.total).toBe(2);
    expect(result.assignedToMe.byStatus).toEqual({ "In progress": 9, Done: 4 });
    expect(result.assignedToMe.pending).toEqual({
      Website: [{ id: 1234, subject: "Fix login redirect", status: "In progress", priority: "High", dueDate: "2026-08-03", percentageDone: 40 }],
    });
    expect(result.teamActivity.latest[0]).toMatchObject({ id: 1234, project: "Website" });
    expect(result.recentlyChanged).toBeUndefined();
  });

  it("collapses notifications per work package", async () => {
    const client = await connect();
    const { unreadNotifications } = (await callTool(client, "briefing")).json();

    expect(unreadNotifications.total).toBe(3);
    expect(unreadNotifications.latest).toEqual([
      { workPackageId: 1234, subject: "Fix login redirect", count: 2, reasons: ["mentioned", "commented"], actor: "Ana Ruiz", at: "2026-07-28T10:00:00Z" },
      { workPackageId: 1300, subject: "Other", count: 1, reasons: ["assigned"], actor: "Ana Ruiz", at: "2026-07-27T10:00:00Z" },
    ]);
  });

  it("asks for my open work, my unread notifications and recent changes", async () => {
    const client = await connect();
    await callTool(client, "briefing", { since: "2026-10-01" });
    const workPackageUrls = urlsFor("/work_packages");
    const assigned = workPackageUrls.find(isAssignedQuery)!;
    const changed = workPackageUrls.find((url) => !isAssignedQuery(url))!;

    expect(filtersOf(assigned)).toEqual([
      { assignee: { operator: "=", values: ["me"] } },
      { status: { operator: "o", values: [] } },
    ]);
    expect(filtersOf(changed)).toEqual([{ updatedAt: { operator: "<>d", values: ["2026-10-01", ""] } }]);
    expect(filtersOf(urlsFor("/notifications")[0])).toEqual([{ readIAN: { operator: "=", values: ["f"] } }]);
  });

  it("defaults the recent window to the last seven days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    const client = await connect();
    const result = (await callTool(client, "briefing")).json();
    vi.useRealTimers();

    expect(result.teamActivity.since).toBe("2026-10-25");
  });

  it("keeps all three sections inside the default project", async () => {
    const projects = { total: 1, count: 1, _embedded: { elements: [{ id: 3, identifier: "website", name: "Website" }] } };
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (url.pathname === "/api/v3/projects") return respond(projects);
      if (url.pathname === "/api/v3/notifications") return respond(FEED);
      return respond(isAssignedQuery(url) ? ASSIGNED : CHANGED);
    });
    const client = await connect({ ...testConfig, defaultProject: "website" });
    const result = (await callTool(client, "briefing")).json();

    expect(result.scope).toBe("project website");
    expect(urlsFor("/projects/website/work_packages")).toHaveLength(3);
    expect(filtersOf(urlsFor("/notifications")[0])).toContainEqual({ project: { operator: "=", values: ["3"] } });
  });

  it("returns the other sections when one request fails", async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (url.pathname === "/api/v3/notifications") return new Response("{}", { status: 500 });
      return respond(isAssignedQuery(url) ? ASSIGNED : CHANGED);
    });
    const client = await connect();
    const result = (await callTool(client, "briefing")).json();

    expect(result.unreadNotifications.error).toBeTruthy();
    expect(result.assignedToMe.total).toBe(2);
    expect(result.teamActivity.total).toBe(1);
  });

  it("stays under 6 KB for 25 open items and 50 unread notifications", async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ...workPackage, id: 2000 + i, subject: `Work package number ${i}` }));
    const feed = Array.from({ length: 50 }, (_, i) => ({ ...notification, id: 300 + i, _links: { ...notification._links, resource: { href: `/api/v3/work_packages/${3000 + i}`, title: `Notified ${i}` } } }));
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (url.pathname === "/api/v3/notifications") return respond({ total: 50, count: 50, _embedded: { elements: feed } });
      const size = Number(url.searchParams.get("pageSize"));
      const elements = many.slice(0, size);
      return respond({ total: 25, count: elements.length, _embedded: { elements }, groups: [{ value: "In progress", count: 25 }] });
    });
    const client = await connect();
    const text = (await callTool(client, "briefing")).text;

    expect(Buffer.byteLength(text)).toBeLessThan(6_144);
  });
});
