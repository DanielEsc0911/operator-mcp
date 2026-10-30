import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";

let fetchMock: ReturnType<typeof vi.fn>;

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(respond({ id: 12, name: "Daniel Escalona", email: "d@e.me" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("api_request", () => {
  it("refuses DELETE unless the environment allows it, without sending anything", async () => {
    const client = await connect();
    fetchMock.mockClear();
    const result = await callTool(client, "api_request", { method: "DELETE", path: "/work_packages/1" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("OPENPROJECT_ALLOW_DELETE=1");
    expect(fetchMock).not.toHaveBeenCalled();
  });


  it("returns the raw HAL response unflattened", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ _type: "Type", id: 7, _links: { self: { href: "/api/v3/types/7" } } }));

    expect((await callTool(client, "api_request", { method: "GET", path: "/types/7" })).json()).toEqual({
      _type: "Type",
      id: 7,
      _links: { self: { href: "/api/v3/types/7" } },
    });
  });

  it("accepts a path without a leading slash", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ ok: true }));
    await callTool(client, "api_request", { method: "GET", path: "statuses" });

    expect(fetchMock.mock.lastCall![0].toString()).toBe("https://op.acme.com/api/v3/statuses");
  });

  it("passes query parameters through untouched", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0 }));
    await callTool(client, "api_request", {
      method: "GET",
      path: "/work_packages",
      query: { filters: '[{"id":{"operator":"=","values":["1"]}}]' },
    });

    expect((fetchMock.mock.lastCall![0] as URL).searchParams.get("filters")).toBe(
      '[{"id":{"operator":"=","values":["1"]}}]',
    );
  });

  it("sends a body on POST", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ id: 99 }));
    await callTool(client, "api_request", {
      method: "POST",
      path: "/work_packages/1234/watchers",
      body: { user: { href: "/api/v3/users/12" } },
    });

    expect(JSON.parse(fetchMock.mock.lastCall![1].body)).toEqual({ user: { href: "/api/v3/users/12" } });
  });

  it("sends DELETE when the environment allows it, and acknowledges an empty 204", async () => {
    const client = await connect({ ...testConfig, allowDelete: true });
    fetchMock.mockResolvedValue(respond(null, 204));

    expect((await callTool(client, "api_request", { method: "DELETE", path: "/work_packages/1234/watchers/12" })).json())
      .toEqual({ ok: true });
  });

  it("is blocked for writes in read-only mode", async () => {
    const client = await connect({ ...testConfig, readOnly: true });
    const result = await callTool(client, "api_request", { method: "PATCH", path: "/work_packages/1234" });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  });

  it("still allows reads in read-only mode", async () => {
    const client = await connect({ ...testConfig, readOnly: true });
    fetchMock.mockResolvedValue(respond({ id: 7 }));

    expect((await callTool(client, "api_request", { method: "GET", path: "/types/7" })).isError).toBe(false);
  });
});
