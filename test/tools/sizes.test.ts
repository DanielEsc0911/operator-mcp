import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool } from "../support/harness.js";
import {
  ACTIVITIES_PAGE, ASSIGNED, ASSIGNED_PAGE, ME, NOTIFICATIONS_PAGE, SEARCH_PAGE, TIME_ENTRIES_PAGE,
} from "../support/realistic.js";

const BUDGET = 8 * 1024;

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
    const path = url.pathname.replace("/api/v3", "");
    const size = Number(url.searchParams.get("pageSize") ?? 20);
    const first = <T,>(page: { total: number; _embedded: { elements: T[] } }) =>
      respond({ ...page, count: Math.min(size, page._embedded.elements.length), _embedded: { elements: page._embedded.elements.slice(0, size) } });
    if (path === "/users/me") return respond(ME);
    if (path === "/notifications") return first(NOTIFICATIONS_PAGE);
    if (path === "/time_entries") return first(TIME_ENTRIES_PAGE);
    if (path.endsWith("/activities")) return respond(ACTIVITIES_PAGE);
    if (url.searchParams.get("pageSize") === "1") return respond({ ...ASSIGNED_PAGE, _embedded: { elements: [] } });
    const wanted = Number(url.searchParams.get("pageSize") ?? 20);
    return respond(wanted >= 46 ? ASSIGNED_PAGE : { ...SEARCH_PAGE, _embedded: { elements: ASSIGNED.slice(0, wanted) } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("default responses stay under 8 KB on a realistic instance", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["briefing", {}],
    ["standup", { since: "2026-10-01" }],
    ["my_work", {}],
    ["list_notifications", {}],
    ["search_work_packages", { assignee: "me" }],
    ["list_activities", { id: 1000 }],
  ];
  for (const [tool, args] of cases) {
    it(tool, async () => {
      const result = await callTool(await connect(), tool, args);
      expect(result.isError).toBe(false);
      expect(Buffer.byteLength(result.text)).toBeLessThan(BUDGET);
    });
  }
});
