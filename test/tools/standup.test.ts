import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool } from "../support/harness.js";
import workPackage from "../fixtures/workPackage.json" with { type: "json" };

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Ada Lovelace", email: "ada@example.com" };
const entry = (hours: string, spentOn: string) => ({
  hours, spentOn, comment: { raw: "Pairing" },
  _links: { workPackage: { href: "/api/v3/work_packages/1234", title: "Fix login redirect" } },
});
const ENTRIES = { total: 2, count: 2, _embedded: { elements: [entry("PT2H30M", "2026-10-30"), entry("PT45M", "2026-10-30")] } };
const CHANGED = { total: 1, count: 1, _embedded: { elements: [workPackage] } };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: URL) => {
    if (url.pathname === "/api/v3/users/me") return respond(ME);
    return respond(url.pathname === "/api/v3/time_entries" ? ENTRIES : CHANGED);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function filtersFor(path: string): any[] {
  const call = fetchMock.mock.calls.find(([url]) => (url as URL).pathname === `/api/v3${path}`)!;
  return JSON.parse((call[0] as URL).searchParams.get("filters")!);
}

describe("standup", () => {
  it("totals my time entries and lists my changed work packages", async () => {
    const client = await connect();
    const result = (await callTool(client, "standup", { since: "2026-10-30" })).json();

    expect(result.timeEntries.totalHours).toBe(3.25);
    expect(result.timeEntries.rows[0]).toEqual({
      spentOn: "2026-10-30", hours: 2.5, workPackageId: 1234, workPackage: "Fix login redirect", comment: "Pairing",
    });
    expect(result.changedWorkPackages.rows[0]).toMatchObject({ id: 1234, status: "In progress" });
    expect(filtersFor("/time_entries")).toEqual([
      { user: { operator: "=", values: ["me"] } },
      { spentOn: { operator: "<>d", values: ["2026-10-30", ""] } },
    ]);
    expect(filtersFor("/work_packages")).toContainEqual({ updatedAt: { operator: "<>d", values: ["2026-10-30", ""] } });
  });

  it("starts from the previous working day: Friday on a Monday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 2, 9, 0));
    const client = await connect();
    const result = (await callTool(client, "standup")).json();

    expect(result.since).toBe("2026-10-30");
  });

  it("starts from yesterday on a Wednesday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 4, 9, 0));
    const client = await connect();
    expect((await callTool(client, "standup")).json().since).toBe("2026-11-03");
  });
});
