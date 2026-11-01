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

  it("flags truncation and keeps a week of data under 8 KB", async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      ...entry("PT1H", "2026-10-30"), comment: { raw: "Revisión del flujo de aprobación de solicitudes de compra con el equipo" },
      _links: { workPackage: { href: `/api/v3/work_packages/${1000 + i}`, title: `Revisar el flujo de aprobación de solicitudes de compra del departamento ${i}`.slice(0, 85) } },
    }));
    const wps = Array.from({ length: 20 }, (_, i) => ({ ...workPackage, id: 2000 + i, subject: `Revisar el flujo de aprobación de solicitudes de compra del departamento ${i}`.slice(0, 85) }));
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      const isEntries = url.pathname === "/api/v3/time_entries";
      const elements = (isEntries ? entries : wps).slice(0, Number(url.searchParams.get("pageSize")));
      return respond({ total: 25, count: elements.length, _embedded: { elements } });
    });
    const client = await connect();
    const result = await callTool(client, "standup", { since: "2026-10-26" });

    expect(Buffer.byteLength(result.text)).toBeLessThan(8_192);
    expect(result.json().timeEntries).toMatchObject({ total: 25, truncated: true });
    expect(result.json().changedWorkPackages).toMatchObject({ total: 25, truncated: true });
    expect(result.json().timeEntries.rows).toHaveLength(20);
  });
});
