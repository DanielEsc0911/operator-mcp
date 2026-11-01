import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Filter, OpenProjectClient } from "../client.js";
import { flattenNotification } from "../hal.js";
import { resolveProjectId } from "../resolve.js";
import { handler, requireConfirm, type ToolContext } from "./shared.js";

const REASONS = [
  "assigned", "mentioned", "commented", "created", "dateAlert", "prioritized",
  "processed", "responsible", "subscribed", "scheduled", "watched",
] as const;

type FeedArgs = { unreadOnly?: boolean; reason?: string; project?: string; limit?: number };

export async function feedFilters(client: OpenProjectClient, { unreadOnly, reason, project }: FeedArgs): Promise<Filter[]> {
  const filters: Filter[] = [];
  // OpenProject encodes boolean filter values as the strings "t" and "f".
  if (unreadOnly) filters.push({ readIAN: { operator: "=", values: ["f"] } });
  if (reason) filters.push({ reason: { operator: "=", values: [reason] } });
  if (project) filters.push({ project: { operator: "=", values: [await resolveProjectId(client, project)] } });
  return filters;
}

export function registerNotificationTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "list_notifications",
    {
      title: "List notifications",
      annotations: { readOnlyHint: true },
      description:
        "Your in-app notification feed, newest first. Each row carries the work package it concerns, so you can triage without a second lookup; build its link from `urlTemplate`.",
      inputSchema: {
        unreadOnly: z.boolean().optional().describe("Only notifications you have not read yet."),
        reason: z.enum(REASONS).optional().describe("Why the notification exists."),
        project: z.string().optional().describe("Project identifier, name or numeric id."),
        limit: z.number().int().positive().max(100).optional().describe("Maximum notifications, at most 100. Defaults to 20."),
      },
    },
    handler(async (args: FeedArgs) => {
      const { total, elements } = await client.collection("/notifications", {
        filters: await feedFilters(client, args),
        pageSize: args.limit ?? 20,
        sortBy: [["id", "desc"]],
      });
      return {
        total,
        urlTemplate: `${config.url}/work_packages/{id}`,
        notifications: elements.map(flattenNotification),
      };
    }),
  );

  server.registerTool(
    "mark_notifications_read",
    {
      title: "Mark notifications as read",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      description:
        "Mark specific notifications read by id (those that exist and are yours), or every notification matching a filter with all: true. Use this after triaging so the feed stays meaningful.",
      inputSchema: {
        ids: z.array(z.number().int().positive()).max(100).optional().describe("Notification ids to mark read, at most 100. Unknown or foreign ids are skipped by the server."),
        all: z.boolean().optional().describe("Mark the whole collection read, narrowed by the filters below. Needs confirm: true."),
        confirm: z.boolean().optional().describe("Required with all: true. Only set it after the user explicitly agreed to mark that many notifications read."),
        reason: z.enum(REASONS).optional().describe("With all: only this reason."),
        project: z.string().optional().describe("With all: only this project (identifier, name or numeric id)."),
      },
    },
    handler(async ({ ids, all, reason, project, confirm }: { ids?: number[]; all?: boolean; confirm?: boolean } & FeedArgs) => {
      if (!ids?.length && !all) throw new Error("Nothing selected. Pass ids, or all: true to mark the whole feed.");

      if (ids?.length) {
        const filters: Filter[] = [{ id: { operator: "=", values: ids.map(String) } }];
        await client.request("POST", "/notifications/read_ian", { query: { filters: JSON.stringify(filters) } });
        return { requested: ids.length };
      }

      requireConfirm(confirm, config.readOnly, "Marking the whole feed read");
      const filters = await feedFilters(client, { reason, project });
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
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
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
