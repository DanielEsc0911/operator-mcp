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
        fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (url.pathname === "/api/v3/projects/website") return respond({ id: 3, identifier: "website" });
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

  const SUBJECT = "Revisar el flujo de aprobación de solicitudes de compra del departamento";
  const projectName = (i: number) => `Proyecto de modernización de la plataforma institucional ${i % 5}`.padEnd(65, ".");
  const realistic = (i: number) => ({
    ...workPackage, id: 2000 + i, subject: `${SUBJECT} ${i}`.slice(0, 85), dueDate: `2026-11-${String(10 + (i % 18)).padStart(2, "0")}`,
    _links: { ...workPackage._links, project: { href: `/api/v3/projects/${i % 5}`, title: projectName(i) } },
  });

  it("stays under 8 KB for 46 open items, 50 notifications and a week of activity", async () => {
    const open = Array.from({ length: 46 }, (_, i) => realistic(i));
    const feed = Array.from({ length: 50 }, (_, i) => ({
      ...notification, id: 300 + i,
      _links: { ...notification._links, resource: { href: `/api/v3/work_packages/${3000 + i}`, title: `${SUBJECT} ${i}`.slice(0, 85) } },
    }));
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (url.pathname === "/api/v3/notifications") return respond({ total: 50, count: 50, _embedded: { elements: feed } });
      const size = Number(url.searchParams.get("pageSize"));
      const elements = (isAssignedQuery(url) ? open : open.slice(10, 20)).slice(0, size);
      return respond({ total: elements.length === size && isAssignedQuery(url) ? 46 : elements.length, count: elements.length, _embedded: { elements }, groups: [{ value: "In progress", count: 46 }] });
    });
    const client = await connect();
    const text = (await callTool(client, "briefing")).text;
    const result = JSON.parse(text);

    expect(Buffer.byteLength(text)).toBeLessThan(8_192);
    expect(result.assignedToMe.pendingCount).toBe(46);
    const rows = Object.values(result.assignedToMe.pending).flat() as any[];
    expect(rows).toHaveLength(15);
    const soonest = open.map((wp) => wp.dueDate).sort().slice(0, 15);
    expect(rows.map((row) => row.dueDate).sort()).toEqual(soonest);
  });

  it("leaves the project off activity rows when the scope is one project", async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (url.pathname === "/api/v3/projects/website") return respond({ id: 3 });
      if (url.pathname === "/api/v3/notifications") return respond(FEED);
      return respond(isAssignedQuery(url) ? ASSIGNED : CHANGED);
    });
    const client = await connect({ ...testConfig, defaultProject: "website" });
    const result = (await callTool(client, "briefing")).json();

    expect(result.teamActivity.latest[0].project).toBeUndefined();
  });

  it("counts the fetched items by status when the groups are missing", async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (url.pathname === "/api/v3/notifications") return respond(FEED);
      return respond(isAssignedQuery(url) ? ASSIGNED : CHANGED);
    });
    const client = await connect();
    const { assignedToMe } = (await callTool(client, "briefing")).json();

    expect(assignedToMe.byStatus).toEqual({ "In progress": 1, Done: 1 });
    expect(assignedToMe.byStatusCountedFirst).toBe(2);
  });

  it("asks for notifications newest first", async () => {
    await callTool(await connect(), "briefing");

    expect(urlsFor("/notifications")[0].searchParams.get("sortBy")).toBe('[["id","desc"]]');
  });

  it("marks the assigned section truncated when more exist than were fetched", async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (url.pathname === "/api/v3/notifications") return respond(FEED);
      return respond(isAssignedQuery(url) ? { ...ASSIGNED, total: 150 } : CHANGED);
    });
    const { assignedToMe } = (await callTool(await connect(), "briefing")).json();

    expect(assignedToMe.truncated).toBe(true);
    expect(assignedToMe.pendingTruncated).toBeUndefined();
  });

  it("filters unread notifications through the shared feed filter, resolving a project name", async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (url.pathname === "/api/v3/notifications") return respond(FEED);
      if (url.pathname === "/api/v3/projects/web") return respond({ id: 3 });
      return respond(isAssignedQuery(url) ? ASSIGNED : CHANGED);
    });
    await callTool(await connect({ ...testConfig, defaultProject: "web" }), "briefing");

    expect(filtersOf(urlsFor("/notifications")[0])).toEqual([
      { readIAN: { operator: "=", values: ["f"] } },
      { project: { operator: "=", values: ["3"] } },
    ]);
  });
});
