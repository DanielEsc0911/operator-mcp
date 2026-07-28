import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";
import workPackage from "../fixtures/workPackage.json" with { type: "json" };

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };
const TYPES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "Bug" }] } };
const STATUSES = { total: 1, count: 1, _embedded: { elements: [{ id: 9, name: "In progress" }] } };

let fetchMock: ReturnType<typeof vi.fn>;

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: `no route for ${url.pathname}` }, 404);
  });
}

function callsTo(pathname: string) {
  return fetchMock.mock.calls.filter(([url]) => (url as URL).pathname === `/api/v3${pathname}`);
}

function bodyOf(call: any[]): any {
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("create_work_package", () => {
  it("posts to the project path with resolved links", async () => {
    routes({
      "/users/me": ME, "/projects/website/types": TYPES, "/statuses": STATUSES,
      "/projects/website/work_packages": workPackage,
      "/projects/website/available_assignees": { total: 1, count: 1, _embedded: { elements: [{ id: 5, name: "Ana Ruiz" }] } },
    });
    const client = await connect();

    const result = (await callTool(client, "create_work_package", {
      project: "website", type: "Bug", subject: "Fix login redirect",
      description: "Users land on /dashboard.", assignee: "Ana Ruiz",
      status: "In progress", dueDate: "2026-08-03",
    })).json();

    const [call] = callsTo("/projects/website/work_packages");
    expect(call[1].method).toBe("POST");
    expect(bodyOf(call)).toEqual({
      subject: "Fix login redirect",
      description: { raw: "Users land on /dashboard." },
      dueDate: "2026-08-03",
      _links: {
        type: { href: "/api/v3/types/7" },
        status: { href: "/api/v3/statuses/9" },
        assignee: { href: "/api/v3/users/5" },
      },
    });
    expect(result.id).toBe(1234);
  });

  it("uses the default project when none is given", async () => {
    routes({ "/users/me": ME, "/projects/website/types": TYPES, "/projects/website/work_packages": workPackage });
    const client = await connect({ ...testConfig, defaultProject: "website" });
    await callTool(client, "create_work_package", { type: "Bug", subject: "Something" });

    expect(callsTo("/projects/website/work_packages")).toHaveLength(1);
  });

  it("asks for a project when there is no default", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    const result = await callTool(client, "create_work_package", { type: "Bug", subject: "Something" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("No project given and no default project configured");
  });

  it("names the valid types when the type is unknown", async () => {
    routes({ "/users/me": ME, "/projects/website/types": TYPES });
    const client = await connect();
    const result = await callTool(client, "create_work_package", { project: "website", type: "Epicc", subject: "x" });

    expect(result.isError).toBe(true);
    expect(result.text).toBe('No type named "Epicc". Available: Bug');
  });

  it("is blocked in read-only mode", async () => {
    routes({ "/users/me": ME, "/types": TYPES });
    const client = await connect({ ...testConfig, readOnly: true });
    const result = await callTool(client, "create_work_package", { project: "website", type: "7", subject: "x" });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  });
});

describe("update_work_package", () => {
  it("reads the current lockVersion before patching", async () => {
    routes({ "/users/me": ME, "/statuses": STATUSES, "/work_packages/1234": workPackage });
    const client = await connect();
    await callTool(client, "update_work_package", { id: 1234, status: "In progress", percentageDone: 60 });

    const calls = callsTo("/work_packages/1234");
    expect(calls[0][1].method).toBe("GET");
    expect(calls[1][1].method).toBe("PATCH");
    expect(bodyOf(calls[1])).toEqual({
      lockVersion: 7,
      percentageDone: 60,
      _links: { status: { href: "/api/v3/statuses/9" } },
    });
  });

  it("sends only the fields that were supplied", async () => {
    routes({ "/users/me": ME, "/work_packages/1234": workPackage });
    const client = await connect();
    await callTool(client, "update_work_package", { id: 1234, subject: "New subject" });

    expect(bodyOf(callsTo("/work_packages/1234")[1])).toEqual({ lockVersion: 7, subject: "New subject" });
  });

  it("clears an assignee when passed null", async () => {
    routes({ "/users/me": ME, "/work_packages/1234": workPackage });
    const client = await connect();
    await callTool(client, "update_work_package", { id: 1234, assignee: null });

    expect(bodyOf(callsTo("/work_packages/1234")[1])._links).toEqual({ assignee: { href: null } });
  });

  it("refuses an update with no fields rather than issuing a pointless request", async () => {
    routes({ "/users/me": ME, "/work_packages/1234": workPackage });
    const client = await connect();
    const result = await callTool(client, "update_work_package", { id: 1234 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Nothing to update");
    expect(callsTo("/work_packages/1234")).toHaveLength(0);
  });

  it("tells the agent to re-read after a lock conflict", async () => {
    fetchMock.mockImplementation(async (url: URL, init: RequestInit) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (init.method === "GET") return respond(workPackage);
      return respond({ message: "Version mismatch" }, 409);
    });
    const client = await connect();
    const result = await callTool(client, "update_work_package", { id: 1234, subject: "New" });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Version mismatch. Read the resource again and retry.");
  });
});

describe("comment_work_package", () => {
  it("posts a raw markdown comment", async () => {
    routes({
      "/users/me": ME,
      "/work_packages/1234/activities": { id: 55, createdAt: "2026-07-28T10:00:00Z", _links: {} },
    });
    const client = await connect();
    const result = (await callTool(client, "comment_work_package", { id: 1234, comment: "Pushed `bug/1234-fix`." })).json();

    expect(bodyOf(callsTo("/work_packages/1234/activities")[0])).toEqual({ comment: { raw: "Pushed `bug/1234-fix`." } });
    expect(result).toEqual({ id: 55, createdAt: "2026-07-28T10:00:00Z", url: "https://op.acme.com/work_packages/1234" });
  });
});

describe("list_activities", () => {
  it("returns comments and field changes in order", async () => {
    routes({
      "/users/me": ME,
      "/work_packages/1234/activities": {
        total: 2, count: 2,
        _embedded: {
          elements: [
            { id: 1, _type: "Activity", createdAt: "2026-07-20T08:00:00Z", details: [{ raw: "Status set to New" }], _links: { user: { href: "/api/v3/users/5", title: "Ana Ruiz" } } },
            { id: 2, _type: "Activity::Comment", createdAt: "2026-07-28T10:00:00Z", comment: { raw: "Pushed the fix." }, _links: { user: { href: "/api/v3/users/12", title: "Daniel Escalona" } } },
          ],
        },
      },
    });
    const client = await connect();
    const result = (await callTool(client, "list_activities", { id: 1234 })).json();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, user: "Ana Ruiz", details: ["Status set to New"] });
    expect(result[1]).toMatchObject({ id: 2, user: "Daniel Escalona", comment: "Pushed the fix." });
  });
});

describe("link_work_packages", () => {
  it("posts a relation from one work package to another", async () => {
    routes({ "/users/me": ME, "/work_packages/1234/relations": { id: 3, type: "blocks", _links: {} } });
    const client = await connect();
    await callTool(client, "link_work_packages", { from: 1234, to: 1200, type: "blocks" });

    expect(bodyOf(callsTo("/work_packages/1234/relations")[0])).toEqual({
      type: "blocks",
      _links: { to: { href: "/api/v3/work_packages/1200" } },
    });
  });

  it("rejects a relation type OpenProject does not have", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    expect((await callTool(client, "link_work_packages", { from: 1, to: 2, type: "sortof" })).isError).toBe(true);
  });
});
