import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";
import workPackage from "../fixtures/workPackage.json" with { type: "json" };

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Ada Lovelace", email: "ada@example.com" };
const TYPES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "Bug" }] } };
const STATUSES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "In progress" }] } };
const NO_ACTIVITY = { total: 0, count: 0, _embedded: { elements: [] } };
const RESULTS = { total: 1, count: 1, _embedded: { elements: [workPackage] } };

let fetchMock: ReturnType<typeof vi.fn>;

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: `no route for ${url.pathname}` }, 404);
  });
}

function lastQuery(key: string): string | null {
  return (fetchMock.mock.lastCall![0] as URL).searchParams.get(key);
}

function filtersOf(): any[] {
  return JSON.parse(lastQuery("filters") ?? "[]");
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("get_work_package", () => {
  it("returns a flattened work package including its description", async () => {
    routes({ "/users/me": ME, "/work_packages/1234": workPackage, "/work_packages/1234/activities": NO_ACTIVITY });
    const client = await connect();
    const result = (await callTool(client, "get_work_package", { id: 1234 })).json();

    expect(result).toMatchObject({
      id: 1234, subject: "Fix login redirect", type: "Bug", status: "In progress",
      assignee: "Ada Lovelace", lockVersion: 7, url: "https://op.acme.com/work_packages/1234",
    });
    expect(result.description).toContain("Users land on /dashboard");
    expect(result.parent).toEqual({ id: 1200, subject: "Auth overhaul" });
  });

  it("adds the three newest comments, capped at 500 characters", async () => {
    const comments = [1, 2, 3, 4].map((id) => ({ id, comment: { raw: `c${id}${"x".repeat(600)}` }, createdAt: `2026-07-0${id}`, _links: { user: { title: "Ana" } } }));
    const withChange = [{ id: 9, details: [{ raw: "Status changed" }], _links: {} }, ...comments];
    routes({
      "/users/me": ME, "/work_packages/1234": workPackage,
      "/work_packages/1234/activities": { total: 5, count: 5, _embedded: { elements: withChange } },
    });
    const client = await connect();
    const result = (await callTool(client, "get_work_package", { id: 1234 })).json();

    expect(result.latestComments.map((entry: any) => entry.createdAt)).toEqual(["2026-07-04", "2026-07-03", "2026-07-02"]);
    expect(result.latestComments[0].comment).toHaveLength(500);
  });

  it("caps a huge description and says so", async () => {
    const huge = { ...workPackage, description: { raw: "d".repeat(25_000) } };
    routes({ "/users/me": ME, "/work_packages/1234": huge, "/work_packages/1234/activities": NO_ACTIVITY });
    const client = await connect();
    const result = (await callTool(client, "get_work_package", { id: 1234 })).json();

    expect(result.description).toHaveLength(20_000);
    expect(result.descriptionTruncated).toBe(true);
  });

  it("explains a missing work package", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    const result = await callTool(client, "get_work_package", { id: 9999 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("no route for /api/v3/work_packages/9999");
  });
});

describe("search_work_packages", () => {
  it("queries the project path rather than a project filter, so identifiers work", async () => {
    routes({ "/users/me": ME, "/projects/website/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { project: "website" });

    expect((fetchMock.mock.lastCall![0] as URL).pathname).toBe("/api/v3/projects/website/work_packages");
  });

  it("encodes the project as a single path segment", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    await callTool(client, "search_work_packages", { project: "../../users/me" });

    expect((fetchMock.mock.lastCall![0] as URL).pathname).toBe("/api/v3/projects/..%2F..%2Fusers%2Fme/work_packages");
  });

  it("uses the operator form for open and closed", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();

    await callTool(client, "search_work_packages", { status: "open" });
    expect(filtersOf()).toContainEqual({ status: { operator: "o", values: [] } });

    await callTool(client, "search_work_packages", { status: "closed" });
    expect(filtersOf()).toContainEqual({ status: { operator: "c", values: [] } });
  });

  it("resolves any other status name to its id", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS, "/statuses": STATUSES });
    const client = await connect();
    await callTool(client, "search_work_packages", { status: "In progress" });

    expect(filtersOf()).toContainEqual({ status: { operator: "=", values: ["7"] } });
  });

  it("passes 'me' through to OpenProject untranslated", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { assignee: "me" });

    expect(filtersOf()).toContainEqual({ assignee: { operator: "=", values: ["me"] } });
  });

  it("resolves an assignee name to a user id", async () => {
    const people = { total: 1, count: 1, _embedded: { elements: [{ id: 5, name: "Ana Ruiz", _links: { self: { href: "/api/v3/users/5" } } }] } };
    routes({ "/users/me": ME, "/work_packages": RESULTS, "/principals": people });
    const client = await connect();
    await callTool(client, "search_work_packages", { assignee: "Ana Ruiz" });

    expect(filtersOf()).toContainEqual({ assignee: { operator: "=", values: ["5"] } });
  });

  it("treats open and closed case-insensitively", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { status: " Open " });

    expect(filtersOf()).toContainEqual({ status: { operator: "o", values: [] } });
  });

  it("resolves a type name to its id", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS, "/types": TYPES });
    const client = await connect();
    await callTool(client, "search_work_packages", { type: "Bug" });

    expect(filtersOf()).toContainEqual({ type: { operator: "=", values: ["7"] } });
  });

  it("builds a full text filter", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { query: "login" });

    expect(filtersOf()).toContainEqual({ search: { operator: "**", values: ["login"] } });
  });

  it("builds an updatedSince filter", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { updatedSince: "2026-07-01" });

    expect(filtersOf()).toContainEqual({ updatedAt: { operator: "<>d", values: ["2026-07-01", ""] } });
  });

  it("sends no filters parameter when nothing was asked for", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", {});

    expect(lastQuery("filters")).toBeNull();
  });

  it("returns the total alongside flattened results without descriptions", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    const result = (await callTool(client, "search_work_packages", {})).json();

    expect(result.total).toBe(1);
    expect(result.results[0].subject).toBe("Fix login redirect");
    expect(result.results[0].description).toBeUndefined();
  });

  it("caps the page size at 100", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { limit: 5000 });

    expect(lastQuery("pageSize")).toBe("100");
  });

  it("sorts on request", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { sortBy: "updatedAt", sortDirection: "desc" });

    expect(lastQuery("sortBy")).toBe('[["updatedAt","desc"]]');
  });
});

describe("my_work", () => {
  it("asks for open work assigned to me, soonest due first", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    const result = (await callTool(client, "my_work")).json();

    expect(filtersOf()).toEqual([
      { assignee: { operator: "=", values: ["me"] } },
      { status: { operator: "o", values: [] } },
    ]);
    expect(lastQuery("sortBy")).toBe('[["dueDate","asc"]]');
    expect(result.total).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(lastQuery("pageSize")).toBe("20");
  });

  it("maps page to OpenProject's page-number offset", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "my_work", { page: 3 });
    expect(lastQuery("offset")).toBe("3");
    await callTool(client, "search_work_packages", { page: 2 });
    expect(lastQuery("offset")).toBe("2");
  });

  it("can ask for closed work instead", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "my_work", { status: "closed" });

    expect(filtersOf()).toContainEqual({ status: { operator: "c", values: [] } });
  });

  it("stays within the default project when one is configured", async () => {
    routes({ "/users/me": ME, "/projects/website/work_packages": RESULTS });
    const client = await connect({ ...testConfig, defaultProject: "website" });
    await callTool(client, "my_work");

    expect((fetchMock.mock.lastCall![0] as URL).pathname).toBe("/api/v3/projects/website/work_packages");
  });
});
