import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callTool, connect } from "../test/support/harness.js";
import { disposable, fixtures, liveClient, liveConfig, project, stamp } from "./support/live.js";

describe.skipIf(!disposable)("live tools through the MCP server", () => {
  let agent: Client;
  let made: ReturnType<typeof fixtures>;
  let wp: { id: number };
  const subject = `OPerator tools ${stamp()}`;

  beforeAll(async () => {
    made = fixtures(liveClient());
    wp = await made.workPackage(subject, { _links: { assignee: { href: "/api/v3/users/me" } } });
    agent = await connect(liveConfig());
  });
  afterAll(() => made?.cleanup());

  it("briefing lists the assigned work package", async () => {
    const result = await callTool(agent, "briefing", { since: "2000-01-01" });
    expect(result.isError).toBe(false);
    expect(result.text).toContain(subject);
    expect(result.json().assignedToMe.error).toBeUndefined();
  });

  it("lists activities for a work package and logs time by activity name", async () => {
    const listed = await callTool(agent, "list_metadata", { kind: "activities", workPackageId: wp.id });
    expect(listed.json().map((activity: { name: string }) => activity.name)).toContain("Development");
    const logged = await callTool(agent, "log_time", { workPackageId: wp.id, hours: 0.25, activity: "Development" });
    expect(logged.isError, logged.text).toBe(false);
  });

  it("standup finds the work package changed today and the time logged", async () => {
    await callTool(agent, "log_time", { workPackageId: wp.id, hours: 0.5 });
    const result = await callTool(agent, "standup", { since: new Date().toISOString().slice(0, 10) });
    expect(result.isError).toBe(false);
    expect(result.text).toContain(subject);
  });

  it("update_work_package writes a version by name and refuses a stale description", async () => {
    const versionName = `v-${stamp()}`;
    const version = await made.version(versionName);
    const current = await callTool(agent, "get_work_package", { id: wp.id });
    const lockVersion = current.json().lockVersion;

    const updated = await callTool(agent, "update_work_package", { id: wp.id, version: versionName });
    expect(updated.isError, updated.text).toBe(false);
    const stored = await liveClient().request("GET", `/work_packages/${wp.id}`);
    expect(stored._links.version.href).toBe(`/api/v3/versions/${version.id}`);

    const stale = await callTool(agent, "update_work_package", { id: wp.id, description: "x", lockVersion });
    expect(stale.isError).toBe(true);
    expect(stale.text).toMatch(/read|again|changed/i);
  });

  it("list_activities returns newest first with a limit", async () => {
    await callTool(agent, "comment_work_package", { id: wp.id, comment: "first" });
    await callTool(agent, "comment_work_package", { id: wp.id, comment: "second" });
    const result = await callTool(agent, "list_activities", { id: wp.id, limit: 1 });
    expect(result.isError).toBe(false);
    expect(result.text).toContain("second");
  });

  it("mark_notifications_read by id marks exactly those", async () => {
    const unread = await callTool(agent, "list_notifications", { unreadOnly: true });
    const ids: number[] = unread.json().notifications.map((item: { id: number }) => item.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);

    const [target, ...others] = ids;
    const marked = await callTool(agent, "mark_notifications_read", { ids: [target] });
    expect(marked.isError, marked.text).toBe(false);

    const after = await callTool(agent, "list_notifications", { unreadOnly: true });
    const remaining: number[] = after.json().notifications.map((item: { id: number }) => item.id);
    expect(remaining).not.toContain(target);
    expect(remaining.sort()).toEqual(others.sort());
  });
});
