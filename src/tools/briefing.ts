import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { flattenNotification, flattenWorkPackage, linkTitle, type HalResource } from "../hal.js";
import { buildSearchFilters, collectionPath } from "./workPackages.js";
import { localDate } from "./time.js";
import { handler, type ToolContext } from "./shared.js";

const DEFAULT_WINDOW_DAYS = 7;

function countByStatus(workPackages: HalResource[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const wp of workPackages) {
    const status = linkTitle(wp, "status") ?? "Unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export function registerBriefingTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "briefing",
    {
      title: "Briefing",
      annotations: { readOnlyHint: true },
      description:
        "One-call answer to \"what's pending / what's new / what's on my plate\": your open work (`pending` leaves out items already at 100%, which `byStatus` still counts), unread notifications, and recently changed work packages. Call this first and answer from it; use other tools only for follow-up detail.",
      inputSchema: {
        since: z
          .string()
          .optional()
          .describe(`ISO date. "Recently changed" means updated on or after it. Defaults to ${DEFAULT_WINDOW_DAYS} days ago.`),
      },
    },
    handler(async ({ since }: { since?: string }) => {
      const project = config.defaultProject;
      const changedSince = since ?? localDate(-DEFAULT_WINDOW_DAYS);
      const [assigned, unread, changed] = await Promise.all([
        client.collection(collectionPath(project), {
          filters: await buildSearchFilters(client, { assignee: "me", status: "open" }),
          pageSize: 100,
          sortBy: [["dueDate", "asc"]],
        }),
        client.collection("/notifications", { filters: [{ readIAN: { operator: "=", values: ["f"] } }], pageSize: 10 }),
        client.collection(collectionPath(project), {
          filters: await buildSearchFilters(client, { updatedSince: changedSince }),
          pageSize: 10,
          sortBy: [["updatedAt", "desc"]],
        }),
      ]);
      const pending = assigned.elements.filter((wp) => wp.percentageDone !== 100);
      return {
        assignedToMe: {
          total: assigned.total,
          byStatus: countByStatus(assigned.elements),
          pending: pending.map((wp) => flattenWorkPackage(wp, config.url)),
        },
        unreadNotifications: {
          total: unread.total,
          latest: unread.elements.map((item) => flattenNotification(item, config.url)),
        },
        recentlyChanged: {
          since: changedSince,
          total: changed.total,
          latest: changed.elements.map((wp) => flattenWorkPackage(wp, config.url)),
        },
      };
    }),
  );
}
