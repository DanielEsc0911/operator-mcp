import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Filter } from "../client.js";
import { flattenNotification } from "../hal.js";
import { handler, type ToolContext } from "./shared.js";

const REASONS = [
  "assigned", "mentioned", "commented", "created", "dateAlert", "prioritized",
  "processed", "responsible", "subscribed", "scheduled", "watched",
] as const;

type FeedArgs = { unreadOnly?: boolean; reason?: string; project?: string; limit?: number };

function feedFilters({ unreadOnly, reason, project }: FeedArgs): Filter[] {
  const filters: Filter[] = [];
  // OpenProject encodes boolean filter values as the strings "t" and "f".
  if (unreadOnly) filters.push({ readIAN: { operator: "=", values: ["f"] } });
  if (reason) filters.push({ reason: { operator: "=", values: [reason] } });
  if (project) filters.push({ project: { operator: "=", values: [project] } });
  return filters;
}

export function registerNotificationTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "list_notifications",
    {
      title: "List notifications",
      description:
        "Your in-app notification feed, newest first. Each row carries the work package it concerns, so you can triage without a second lookup.",
      inputSchema: {
        unreadOnly: z.boolean().optional().describe("Only notifications you have not read yet."),
        reason: z.enum(REASONS).optional().describe("Why the notification exists."),
        project: z.string().optional().describe("Numeric project id. Use list_projects to find it."),
        limit: z.number().int().positive().optional().describe("Maximum notifications. Defaults to 50."),
      },
    },
    handler(async (args: FeedArgs) => {
      const { total, elements } = await client.collection("/notifications", {
        filters: feedFilters(args),
        pageSize: args.limit ?? 50,
      });
      return { total, notifications: elements.map((item) => flattenNotification(item, config.url)) };
    }),
  );

  server.registerTool(
    "mark_notifications_read",
    {
      title: "Mark notifications as read",
      description:
        "Mark specific notifications read by id, or every notification matching a filter with all: true. Use this after triaging so the feed stays meaningful.",
      inputSchema: {
        ids: z.array(z.number().int()).optional().describe("Notification ids to mark read."),
        all: z.boolean().optional().describe("Mark the whole collection read, narrowed by the filters below."),
        reason: z.enum(REASONS).optional().describe("With all: only this reason."),
        project: z.string().optional().describe("With all: only this numeric project id."),
      },
    },
    handler(async ({ ids, all, reason, project }: { ids?: number[]; all?: boolean } & FeedArgs) => {
      if (!ids?.length && !all) throw new Error("Nothing selected. Pass ids, or all: true to mark the whole feed.");

      if (ids?.length) {
        for (const id of ids) await client.request("POST", `/notifications/${id}/read_ian`);
        return { marked: ids.length };
      }

      const filters = feedFilters({ reason, project });
      await client.request("POST", "/notifications/read_ian", {
        query: { filters: filters.length ? JSON.stringify(filters) : undefined },
      });
      return { marked: "all matching" };
    }),
  );

  server.registerTool(
    "watch_work_package",
    {
      title: "Watch or unwatch a work package",
      description: "Control whether you get notified about a work package's future activity.",
      inputSchema: {
        id: z.number().int().describe("Work package id."),
        watching: z.boolean().describe("True to start watching, false to stop."),
      },
    },
    handler(async ({ id, watching }: { id: number; watching: boolean }) => {
      const me = await client.me();
      if (watching) {
        await client.request("POST", `/work_packages/${id}/watchers`, { body: { user: { href: `/api/v3/users/${me.id}` } } });
      } else {
        await client.request("DELETE", `/work_packages/${id}/watchers/${me.id}`);
      }
      return { id, watching };
    }),
  );
}
