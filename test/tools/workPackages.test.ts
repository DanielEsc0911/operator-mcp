import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";
import workPackage from "../fixtures/workPackage.json" with { type: "json" };

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };
const TYPES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "Bug" }] } };
const STATUSES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "In progress" }] } };
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
    routes({ "/users/me": ME, "/work_packages/1234": workPackage });
    const client = await connect();
    const result = (await callTool(client, "get_work_package", { id: 1234 })).json();

    expect(result).toMatchObject({
      id: 1234, subject: "Fix login redirect", type: "Bug", status: "In progress",
      assignee: "Daniel Escalona", lockVersion: 7, url: "https://op.acme.com/work_packages/1234",
    });
    expect(result.description).toContain("Users land on /dashboard");
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

    expect(filtersOf()).toContainEqual({ updatedAt: { operator: ">d", values: ["2026-07-01"] } });
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
    expect(result).toHaveLength(1);
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
