import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };

const PROJECTS = {
  total: 2,
  count: 2,
  _embedded: {
    elements: [
      { id: 3, name: "Website", identifier: "website", active: true, _links: {} },
      { id: 4, name: "Intranet", identifier: "intranet", active: true, _links: {} },
    ],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: "no route" }, 404);
  });
}

describe("whoami", () => {
  it("reports identity and connection state", async () => {
    routes({ "/users/me": ME });
    const client = await connect({ ...testConfig, defaultProject: "website" });

    expect((await callTool(client, "whoami")).json()).toEqual({
      user: "Daniel Escalona",
      email: "daescalona@proton.me",
      userId: 12,
      instanceUrl: "https://op.acme.com",
      profile: "test",
      defaultProject: "website",
      readOnly: false,
      conventionsLoaded: false,
    });
  });

  it("reports read-only mode so an agent can plan around it", async () => {
    routes({ "/users/me": ME });
    const client = await connect({ ...testConfig, readOnly: true });
    expect((await callTool(client, "whoami")).json().readOnly).toBe(true);
  });

  it("returns a readable error when the key is rejected", async () => {
    fetchMock.mockResolvedValue(respond({}, 401));
    const client = await connect();
    const result = await callTool(client, "whoami");

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      "API key rejected by https://op.acme.com — regenerate at https://op.acme.com/my/access_token",
    );
  });

  it("returns the setup instruction when unconfigured", async () => {
    const client = await connect({ ...testConfig, url: "", apiKey: "" });
    const result = await callTool(client, "whoami");

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Not configured. Run: npx openproject-mcp setup");
  });
});

describe("list_projects", () => {
  it("flattens every visible project", async () => {
    routes({ "/users/me": ME, "/projects": PROJECTS });
    const client = await connect();

    expect((await callTool(client, "list_projects")).json()).toEqual([
      { id: 3, name: "Website", identifier: "website", active: true, description: undefined, url: "https://op.acme.com/projects/website" },
      { id: 4, name: "Intranet", identifier: "intranet", active: true, description: undefined, url: "https://op.acme.com/projects/intranet" },
    ]);
  });

  it("filters by name, case-insensitively", async () => {
    routes({ "/users/me": ME, "/projects": PROJECTS });
    const client = await connect();
    const found = (await callTool(client, "list_projects", { query: "intra" })).json();

    expect(found).toHaveLength(1);
    expect(found[0].identifier).toBe("intranet");
  });
});

describe("list_users", () => {
  const assignees = {
    total: 1, count: 1,
    _embedded: { elements: [{ id: 12, name: "Daniel Escalona", email: "daescalona@proton.me", _links: {} }] },
  };

  it("uses available_assignees when a project is given", async () => {
    routes({ "/users/me": ME, "/projects/website/available_assignees": assignees });
    const client = await connect();

    expect((await callTool(client, "list_users", { project: "website" })).json()).toEqual([
      { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" },
    ]);
  });

  it("falls back to the default project", async () => {
    routes({ "/users/me": ME, "/projects/website/available_assignees": assignees });
    const client = await connect({ ...testConfig, defaultProject: "website" });

    expect((await callTool(client, "list_users")).json()).toHaveLength(1);
  });

  it("queries principals when no project is in play", async () => {
    routes({ "/users/me": ME, "/principals": assignees });
    const client = await connect();

    expect((await callTool(client, "list_users")).json()).toHaveLength(1);
  });
});
