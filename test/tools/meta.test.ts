import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";

let fetchMock: ReturnType<typeof vi.fn>;

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn().mockResolvedValue(respond({ id: 12, name: "Daniel Escalona", email: "d@e.me" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("list_metadata", () => {
  it("returns ids and names", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "Bug" }] } }));

    expect((await callTool(client, "list_metadata", { kind: "types" })).json()).toEqual([{ id: 7, name: "Bug" }]);
  });

  it("scopes types to the configured default project", async () => {
    const client = await connect({ ...testConfig, defaultProject: "website" });
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0, _embedded: { elements: [] } }));
    await callTool(client, "list_metadata", { kind: "types" });

    expect((fetchMock.mock.lastCall![0] as URL).pathname).toBe("/api/v3/projects/website/types");
  });

  it("rejects an unknown kind before making a request", async () => {
    const client = await connect();
    expect((await callTool(client, "list_metadata", { kind: "wombats" })).isError).toBe(true);
  });
});
