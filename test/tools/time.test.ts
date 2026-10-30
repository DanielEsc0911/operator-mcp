import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";
import { toIsoDuration } from "../../src/tools/time.js";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Ada Lovelace", email: "ada@example.com" };
const ACTIVITIES = { total: 1, count: 1, _embedded: { elements: [{ id: 3, name: "Development" }] } };
const ENTRY = { id: 501, hours: "PT2H30M", spentOn: "2026-07-28", _links: {} };

let fetchMock: ReturnType<typeof vi.fn>;

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: `no route for ${url.pathname}` }, 404);
  });
}

function timeEntryBody(): any {
  const call = fetchMock.mock.calls.find(([url]) => (url as URL).pathname === "/api/v3/time_entries")!;
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("toIsoDuration", () => {
  it("converts whole hours", () => {
    expect(toIsoDuration(4)).toBe("PT4H");
  });

  it("converts fractional hours to hours and minutes", () => {
    expect(toIsoDuration(2.5)).toBe("PT2H30M");
    expect(toIsoDuration(1.25)).toBe("PT1H15M");
  });

  it("converts a value under an hour to minutes alone", () => {
    expect(toIsoDuration(0.5)).toBe("PT30M");
  });

  it("rounds to the nearest minute", () => {
    expect(toIsoDuration(0.008)).toBe("PT0H");
    expect(toIsoDuration(1.017)).toBe("PT1H1M");
  });
});

describe("log_time", () => {
  it("posts an ISO 8601 duration linked to the work package", async () => {
    routes({ "/users/me": ME, "/time_entries": ENTRY });
    const client = await connect();
    const result = (await callTool(client, "log_time", {
      workPackageId: 1234, hours: 2.5, date: "2026-07-28", comment: "Traced the redirect.",
    })).json();

    expect(timeEntryBody()).toEqual({
      hours: "PT2H30M",
      spentOn: "2026-07-28",
      comment: { raw: "Traced the redirect." },
      _links: { workPackage: { href: "/api/v3/work_packages/1234" } },
    });
    expect(result).toMatchObject({ id: 501, hours: "PT2H30M", spentOn: "2026-07-28" });
  });

  it("defaults the date to today", async () => {
    vi.setSystemTime(new Date("2026-07-28T15:00:00Z"));
    routes({ "/users/me": ME, "/time_entries": ENTRY });
    const client = await connect();
    await callTool(client, "log_time", { workPackageId: 1234, hours: 1 });

    expect(timeEntryBody().spentOn).toBe("2026-07-28");
    vi.useRealTimers();
  });

  it("resolves a named activity", async () => {
    routes({ "/users/me": ME, "/time_entries": ENTRY, "/time_entries/activities": ACTIVITIES });
    const client = await connect();
    await callTool(client, "log_time", { workPackageId: 1234, hours: 1, activity: "Development" });

    expect(timeEntryBody()._links.activity).toEqual({ href: "/api/v3/time_entries/activities/3" });
  });

  it("rejects a non-positive duration before making a request", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    const result = await callTool(client, "log_time", { workPackageId: 1234, hours: 0 });

    expect(result.isError).toBe(true);
  });

  it("is blocked in read-only mode", async () => {
    routes({ "/users/me": ME });
    const client = await connect({ ...testConfig, readOnly: true });
    const result = await callTool(client, "log_time", { workPackageId: 1234, hours: 1 });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  });
});
