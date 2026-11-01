import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { linkId, linkTitle } from "../hal.js";
import { localDate } from "./time.js";
import { buildSearchFilters, collectionPath } from "./workPackages.js";
import { handler, type ToolContext } from "./shared.js";

const ROWS = 50;

function previousWorkingDayOffset(): number {
  const weekday = new Date().getDay();
  return weekday === 1 ? -3 : weekday === 0 ? -2 : -1;
}

function hoursOf(duration: unknown): number {
  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?/.exec(String(duration));
  return Number(match?.[1] ?? 0) + Number(match?.[2] ?? 0) / 60;
}

export function registerStandupTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "standup",
    {
      title: "Standup",
      annotations: { readOnlyHint: true },
      description:
        "\"What did I do yesterday\" in one call: your time entries since a date (with total hours) and the work packages assigned to you that changed since, with their current status.",
      inputSchema: {
        since: z
          .string()
          .optional()
          .describe("Local ISO date to start from. Defaults to the previous working day (Friday on a Monday)."),
      },
    },
    handler(async ({ since }: { since?: string }) => {
      const from = since ?? localDate(previousWorkingDayOffset());
      const [entries, changed] = await Promise.all([
        client.collection("/time_entries", {
          filters: [
            { user: { operator: "=", values: ["me"] } },
            { spentOn: { operator: "<>d", values: [from, ""] } },
          ],
          pageSize: ROWS,
        }),
        client.collection(collectionPath(config.defaultProject), {
          filters: await buildSearchFilters(client, { assignee: "me", updatedSince: from }),
          pageSize: ROWS,
          sortBy: [["updatedAt", "desc"]],
        }),
      ]);
      return {
        since: from,
        timeEntries: {
          totalHours: Math.round(entries.elements.reduce((sum, entry) => sum + hoursOf(entry.hours), 0) * 100) / 100,
          rows: entries.elements.map((entry) => ({
            spentOn: entry.spentOn,
            hours: Math.round(hoursOf(entry.hours) * 100) / 100,
            workPackageId: linkId(entry, "workPackage"),
            workPackage: linkTitle(entry, "workPackage"),
            comment: (entry.comment as { raw?: string } | undefined)?.raw || undefined,
          })),
        },
        changedWorkPackages: {
          total: changed.total,
          rows: changed.elements.map((wp) => ({
            id: wp.id, subject: wp.subject, status: linkTitle(wp, "status"), updatedAt: wp.updatedAt,
          })),
        },
      };
    }),
  );
}
