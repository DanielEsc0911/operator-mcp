import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";
import workPackage from "../fixtures/workPackage.json" with { type: "json" };

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const list = (elements: unknown[]) => ({ total: elements.length, count: elements.length, _embedded: { elements } });
const PROJECTS = list([{ id: 3, identifier: "web", name: "Sitio Web Institucional" }]);

let fetchMock: ReturnType<typeof vi.fn>;

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const path = url.pathname.replace("/api/v3", "");
    if (path === "/projects") return respond(PROJECTS);
    if (path.startsWith("/projects/Sitio")) return respond({ message: "not found" }, 404);
    return path in map ? respond(map[path]) : respond({ message: `no route for ${path}` }, 404);
  });
}

const paths = () => fetchMock.mock.calls.map(([url]) => (url as URL).pathname.replace("/api/v3", ""));

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ME = { id: 12, name: "Ada", email: "a@b.c" };

describe("a project given by name reaches the API as its id", () => {
  it("search_work_packages", async () => {
    routes({ "/users/me": ME, "/projects/3/work_packages": list([workPackage]) });
    const result = await callTool(await connect(), "search_work_packages", { project: "Sitio Web Institucional" });
    expect(result.isError).toBe(false);
    expect(paths()).toContain("/projects/3/work_packages");
  });

  it("create_work_package", async () => {
    routes({
      "/users/me": ME, "/projects/3/types": list([{ id: 7, name: "Bug" }]), "/projects/3/work_packages": workPackage,
    });
    const result = await callTool(await connect(), "create_work_package", { project: "Sitio Web Institucional", type: "Bug", subject: "x" });
    expect(result.isError).toBe(false);
    expect(paths()).toContain("/projects/3/work_packages");
  });

  it("list_users", async () => {
    routes({ "/users/me": ME, "/projects/3/available_assignees": list([{ id: 5, name: "Ana", email: "a@a.a" }]) });
    const result = await callTool(await connect(), "list_users", { project: "Sitio Web Institucional" });
    expect(result.json().users).toHaveLength(1);
  });

  it("list_metadata", async () => {
    routes({ "/users/me": ME, "/projects/3/types": list([{ id: 7, name: "Bug" }]) });
    const result = await callTool(await connect(), "list_metadata", { kind: "types", project: "Sitio Web Institucional" });
    expect(result.json()).toEqual([{ id: 7, name: "Bug" }]);
  });
});
