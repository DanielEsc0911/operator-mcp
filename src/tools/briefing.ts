import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Filter } from "../client.js";
import { humanMessage } from "../errors.js";
import { flattenNotification, linkTitle, type HalResource } from "../hal.js";
import { resolveProjectId } from "../resolve.js";
import { localDate } from "./time.js";
import { buildSearchFilters, collectionPath } from "./workPackages.js";
import { handler, type ToolContext } from "./shared.js";

const DEFAULT_WINDOW_DAYS = 7;
const PENDING_LIMIT = 100;
const NOTIFICATION_SAMPLE = 50;
const LATEST = 10;
const PENDING_ROWS = 15;

async function section<T>(work: Promise<T>): Promise<T | { error: string }> {
  try {
    return await work;
  } catch (error) {
    return { error: humanMessage(error) };
  }
}

function pendingRow(wp: HalResource) {
  return {
    id: wp.id,
    subject: wp.subject,
    status: linkTitle(wp, "status"),
    priority: linkTitle(wp, "priority"),
    dueDate: wp.dueDate ?? undefined,
    percentageDone: wp.percentageDone ?? undefined,
  };
}

function countByStatus(workPackages: HalResource[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const wp of workPackages) {
    const status = linkTitle(wp, "status") ?? "Unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function soonestDue(a: HalResource, b: HalResource): number {
  return String(a.dueDate ?? "9999").localeCompare(String(b.dueDate ?? "9999"));
}

function groupByProject(workPackages: HalResource[]): Record<string, ReturnType<typeof pendingRow>[]> {
  const groups: Record<string, ReturnType<typeof pendingRow>[]> = {};
  for (const wp of workPackages) (groups[linkTitle(wp, "project") ?? "Unknown"] ??= []).push(pendingRow(wp));
  return groups;
}

function collapseNotifications(rows: Record<string, unknown>[]) {
  const byTarget = new Map<unknown, { workPackageId: unknown; subject: unknown; count: number; reasons: Set<unknown>; actor: unknown; at: unknown }>();
  for (const row of rows) {
    const target = row.workPackageId ?? row.resource;
    const entry = byTarget.get(target) ?? {
      workPackageId: row.workPackageId, subject: row.workPackageSubject ?? row.resource,
      count: 0, reasons: new Set(), actor: row.actor, at: row.createdAt,
    };
    entry.count++;
    entry.reasons.add(row.reason);
    if (String(row.createdAt) > String(entry.at)) Object.assign(entry, { actor: row.actor, at: row.createdAt });
    byTarget.set(target, entry);
  }
  return [...byTarget.values()]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, LATEST)
    .map((entry) => ({ ...entry, reasons: [...entry.reasons] }));
}

export function registerBriefingTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;
  const project = config.defaultProject;

  async function assigned() {
    const filters = await buildSearchFilters(client, { assignee: "me", status: "open", project });
    const path = collectionPath(project);
    const [list, counts] = await Promise.all([
      client.collection(path, { filters, pageSize: PENDING_LIMIT, sortBy: [["dueDate", "asc"]] }),
      client.collection(path, { filters, pageSize: 1, groupBy: "status" }),
    ]);
    const counted = counts.groups
      ? { byStatus: Object.fromEntries(counts.groups.map((group) => [group.value, group.count])) }
      : { byStatus: countByStatus(list.elements), byStatusCountedFirst: list.elements.length };
    const notDone = list.elements.filter((wp) => wp.percentageDone !== 100).sort(soonestDue);
    return {
      total: list.total,
      ...counted,
      ...(list.total > list.elements.length ? { pendingTruncated: true } : {}),
      pendingCount: notDone.length,
      pending: groupByProject(notDone.slice(0, PENDING_ROWS)),
    };
  }

  async function unread() {
    const filters: Filter[] = [{ readIAN: { operator: "=", values: ["f"] } }];
    if (project) filters.push({ project: { operator: "=", values: [await resolveProjectId(client, project)] } });
    const { total, elements } = await client.collection("/notifications", { filters, pageSize: NOTIFICATION_SAMPLE, sortBy: [["id", "desc"]] });
    return { total, latest: collapseNotifications(elements.map((item) => flattenNotification(item, config.url))) };
  }

  async function teamActivity(since: string) {
    const { total, elements } = await client.collection(collectionPath(project), {
      filters: await buildSearchFilters(client, { updatedSince: since, project }),
      pageSize: LATEST,
      sortBy: [["updatedAt", "desc"]],
    });
    const latest = elements.map((wp) => ({
      id: wp.id, subject: wp.subject, status: linkTitle(wp, "status"), updatedAt: wp.updatedAt,
      ...(project ? {} : { project: linkTitle(wp, "project") }),
    }));
    return { since, total, latest };
  }

  server.registerTool(
    "briefing",
    {
      title: "Briefing",
      annotations: { readOnlyHint: true },
      description:
        "One-call answer to \"what's pending / what's new / what's on my plate\". `assignedToMe`: your open work grouped by project (`pending` is the " +
        PENDING_ROWS +
        " soonest due, leaving out items already at 100%; `pendingCount` is how many there are in total, call `my_work` with `page` for the rest; `byStatus` counts all of them). `unreadNotifications`: unread notifications collapsed per work package. `teamActivity`: work packages changed by anyone in scope. All three share the scope named in `scope`. Build a work package link from `urlTemplate`. A section that failed is `{ error }`; the others are still valid. Call this first and answer from it.",
      inputSchema: {
        since: z
          .string()
          .optional()
          .describe(`ISO date. \`teamActivity\` lists work packages updated on or after it. Defaults to ${DEFAULT_WINDOW_DAYS} days ago.`),
      },
    },
    handler(async ({ since }: { since?: string }) => {
      const [assignedToMe, unreadNotifications, activity] = await Promise.all([
        section(assigned()),
        section(unread()),
        section(teamActivity(since ?? localDate(-DEFAULT_WINDOW_DAYS))),
      ]);
      return {
        scope: project ? `project ${project}` : "whole instance",
        urlTemplate: `${config.url}/work_packages/{id}`,
        assignedToMe,
        unreadNotifications,
        teamActivity: activity,
      };
    }),
  );
}
