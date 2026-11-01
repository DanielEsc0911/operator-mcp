import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { flattenWorkPackage } from "../hal.js";
import { handler, type ToolContext } from "./shared.js";
import { MAX_PAGE_SIZE, buildSearchFilters, collectionPath } from "./workPackages.js";

export function registerMyWorkTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "my_work",
    {
      title: "My work",
      annotations: { readOnlyHint: true },
      description:
        "Work packages assigned to you, soonest due first, as { total, urlTemplate, results }. Use `page` to read past the first `limit`. Includes items at 100% that your instance still counts as open; for 'what's pending' call briefing.",
      inputSchema: {
        status: z.enum(["open", "closed"]).optional().describe("Defaults to open."),
        limit: z.number().int().positive().optional().describe("Maximum results, capped at 100. Defaults to 20."),
        page: z.number().int().positive().optional().describe("1-based page of `limit` results. Defaults to 1."),
      },
    },
    handler(async ({ status, limit, page }: { status?: "open" | "closed"; limit?: number; page?: number }) => {
      const project = config.defaultProject;
      const { total, elements } = await client.collection(collectionPath(project), {
        filters: await buildSearchFilters(client, { assignee: "me", status: status ?? "open", project }),
        pageSize: Math.min(limit ?? 20, MAX_PAGE_SIZE),
        offset: page,
        sortBy: [["dueDate", "asc"]],
      });
      const results = elements.map((wp) =>
        flattenWorkPackage(wp, config.url, { omit: ["assignee", "url"] }));
      return { total, urlTemplate: `${config.url}/work_packages/{id}`, results };
    }),
  );
}
