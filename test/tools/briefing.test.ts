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
const FEED = { total: 1, count: 1, _embedded: { elements: [notification] } };

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
    return respond(isAssignedQuery(url) ? ASSIGNED : CHANGED);
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

    expect(result.assignedToMe.total).toBe(2);
    expect(result.assignedToMe.byStatus).toEqual({ "In progress": 1, Done: 1 });
    expect(result.assignedToMe.pending.map((wp: any) => wp.id)).toEqual([1234]);
    expect(result.unreadNotifications.total).toBe(1);
    expect(result.recentlyChanged.latest[0].id).toBe(1234);
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

    expect(result.recentlyChanged.since).toBe("2026-10-25");
  });

  it("stays within the default project when one is configured", async () => {
    const client = await connect({ ...testConfig, defaultProject: "website" });
    await callTool(client, "briefing");

    expect(urlsFor("/projects/website/work_packages")).toHaveLength(2);
  });
});
