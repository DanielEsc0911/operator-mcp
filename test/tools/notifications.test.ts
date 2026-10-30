import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import notification from "../fixtures/notification.json" with { type: "json" };

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };
const FEED = { total: 1, count: 1, _embedded: { elements: [notification] } };

let fetchMock: ReturnType<typeof vi.fn>;

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: `no route for ${url.pathname}` }, 404);
  });
}

function filtersOf(): any[] {
  return JSON.parse((fetchMock.mock.lastCall![0] as URL).searchParams.get("filters") ?? "[]");
}

function pathsCalled(): string[] {
  return fetchMock.mock.calls.map(([url]) => (url as URL).pathname);
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("list_notifications", () => {
  it("flattens the feed into triage-ready rows", async () => {
    routes({ "/users/me": ME, "/notifications": FEED });
    const client = await connect();
    const result = (await callTool(client, "list_notifications")).json();

    expect(result.total).toBe(1);
    expect(result.notifications[0]).toMatchObject({
      id: 88, reason: "mentioned", read: false, project: "Website", actor: "Ana Ruiz",
      workPackageId: 1234, workPackageSubject: "Fix login redirect",
      url: "https://op.acme.com/work_packages/1234",
    });
  });

  it("filters to unread using OpenProject's boolean encoding", async () => {
    routes({ "/users/me": ME, "/notifications": FEED });
    const client = await connect();
    await callTool(client, "list_notifications", { unreadOnly: true });

    expect(filtersOf()).toContainEqual({ readIAN: { operator: "=", values: ["f"] } });
  });

  it("filters by reason and project", async () => {
    routes({ "/users/me": ME, "/notifications": FEED });
    const client = await connect();
    await callTool(client, "list_notifications", { reason: "mentioned", project: "3" });

    expect(filtersOf()).toContainEqual({ reason: { operator: "=", values: ["mentioned"] } });
    expect(filtersOf()).toContainEqual({ project: { operator: "=", values: ["3"] } });
  });

  it("rejects a reason OpenProject does not define", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    expect((await callTool(client, "list_notifications", { reason: "shouted-at" })).isError).toBe(true);
  });

  it("sends no filters when nothing was asked for", async () => {
    routes({ "/users/me": ME, "/notifications": FEED });
    const client = await connect();
    await callTool(client, "list_notifications");

    expect((fetchMock.mock.lastCall![0] as URL).searchParams.has("filters")).toBe(false);
  });
});

describe("mark_notifications_read", () => {
  it("marks each id individually", async () => {
    routes({ "/users/me": ME, "/notifications/88/read_ian": null, "/notifications/89/read_ian": null });
    const client = await connect();
    const result = (await callTool(client, "mark_notifications_read", { ids: [88, 89] })).json();

    expect(pathsCalled()).toContain("/api/v3/notifications/88/read_ian");
    expect(pathsCalled()).toContain("/api/v3/notifications/89/read_ian");
    expect(result).toEqual({ marked: 2 });
  });

  it("marks the whole filtered collection when asked for all", async () => {
    routes({ "/users/me": ME, "/notifications/read_ian": null });
    const client = await connect();
    await callTool(client, "mark_notifications_read", { all: true, reason: "mentioned" });

    expect(pathsCalled()).toContain("/api/v3/notifications/read_ian");
    expect(filtersOf()).toContainEqual({ reason: { operator: "=", values: ["mentioned"] } });
  });

  it("refuses when given neither ids nor all", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    const result = await callTool(client, "mark_notifications_read", {});

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Pass ids, or all: true");
  });

  it("is blocked in read-only mode", async () => {
    routes({ "/users/me": ME });
    const client = await connect({ ...testConfig, readOnly: true });
    const result = await callTool(client, "mark_notifications_read", { ids: [88] });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  });
});

describe("watch_work_package", () => {
  it("adds you as a watcher", async () => {
    routes({ "/users/me": ME, "/work_packages/1234/watchers": { id: 12, _links: {} } });
    const client = await connect();
    const result = (await callTool(client, "watch_work_package", { id: 1234, watching: true })).json();

    const call = fetchMock.mock.calls.find(([url]) => (url as URL).pathname === "/api/v3/work_packages/1234/watchers")!;
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({ user: { href: "/api/v3/users/12" } });
    expect(result).toEqual({ id: 1234, watching: true });
  });

  it("removes you by user id when unwatching, with api_request DELETE still disabled", async () => {
    routes({ "/users/me": ME, "/work_packages/1234/watchers/12": null });
    const client = await connect();
    const result = (await callTool(client, "watch_work_package", { id: 1234, watching: false })).json();

    const call = fetchMock.mock.calls.find(([url]) => (url as URL).pathname === "/api/v3/work_packages/1234/watchers/12")!;
    expect(call[1].method).toBe("DELETE");
    expect(result).toEqual({ id: 1234, watching: false });
  });
});
