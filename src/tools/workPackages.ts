import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { segment, type Filter, type OpenProjectClient } from "../client.js";
import { flattenWorkPackage } from "../hal.js";
import { resolveId } from "../resolve.js";
import { handler, type ToolContext } from "./shared.js";

const MAX_PAGE_SIZE = 100;

export type SearchArgs = {
  project?: string;
  assignee?: string;
  status?: string;
  type?: string;
  priority?: string;
  query?: string;
  updatedSince?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  limit?: number;
};

// OpenProject expresses "any open status" and "any closed status" as filter
// operators with no values, not as status names.
async function statusFilter(client: OpenProjectClient, status: string, project?: string): Promise<Filter> {
  if (status === "open") return { status: { operator: "o", values: [] } };
  if (status === "closed") return { status: { operator: "c", values: [] } };
  return { status: { operator: "=", values: [await resolveId(client, "statuses", status, project)] } };
}

export async function buildSearchFilters(client: OpenProjectClient, args: SearchArgs): Promise<Filter[]> {
  const filters: Filter[] = [];
  if (args.assignee) filters.push({ assignee: { operator: "=", values: [args.assignee] } });
  if (args.status) filters.push(await statusFilter(client, args.status, args.project));
  if (args.type) filters.push({ type: { operator: "=", values: [await resolveId(client, "types", args.type, args.project)] } });
  if (args.priority) filters.push({ priority: { operator: "=", values: [await resolveId(client, "priorities", args.priority)] } });
  if (args.query) filters.push({ search: { operator: "**", values: [args.query] } });
  if (args.updatedSince) filters.push({ updatedAt: { operator: ">d", values: [args.updatedSince] } });
  return filters;
}

function collectionPath(project?: string): string {
  return project ? `/projects/${segment(project)}/work_packages` : "/work_packages";
}

export function registerWorkPackageTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "get_work_package",
    {
      title: "Get a work package",
      description: "Full detail for one work package, including its description and the lockVersion an update needs.",
      inputSchema: { id: z.number().int().describe("Work package id.") },
    },
    handler(async ({ id }: { id: number }) => {
      const wp = await client.request("GET", `/work_packages/${id}`);
      return flattenWorkPackage(wp, config.url, { includeDescription: true });
    }),
  );

  server.registerTool(
    "search_work_packages",
    {
      title: "Search work packages",
      description:
        "Find work packages by project, assignee, status, type, priority, text, or recency. Descriptions are omitted; use get_work_package for one item's full detail.",
      inputSchema: {
        project: z.string().optional().describe("Project identifier or id. Defaults to the configured default project."),
        assignee: z.string().optional().describe('Assignee. Use "me" for yourself, otherwise a numeric user id.'),
        status: z
          .string()
          .optional()
          .describe('"open" or "closed" match any status of that kind. Any other value is a status name or id.'),
        type: z.string().optional().describe('Type name or id, for example "Bug".'),
        priority: z.string().optional().describe('Priority name or id, for example "High".'),
        query: z.string().optional().describe("Full text search across subject and description."),
        updatedSince: z.string().optional().describe("ISO date. Returns work packages changed on or after it."),
        sortBy: z.string().optional().describe('Field to sort on, for example "dueDate" or "updatedAt".'),
        sortDirection: z.enum(["asc", "desc"]).optional().describe("Sort direction. Defaults to asc."),
        limit: z.number().int().positive().optional().describe("Maximum results, capped at 100. Defaults to 25."),
      },
    },
    handler(async (args: SearchArgs) => {
      const project = args.project ?? config.defaultProject;
      const { total, elements } = await client.collection(collectionPath(project), {
        filters: await buildSearchFilters(client, { ...args, project }),
        pageSize: Math.min(args.limit ?? 25, MAX_PAGE_SIZE),
        sortBy: args.sortBy ? [[args.sortBy, args.sortDirection ?? "asc"]] : undefined,
      });
      return { total, results: elements.map((wp) => flattenWorkPackage(wp, config.url)) };
    }),
  );

  server.registerTool(
    "my_work",
    {
      title: "My work",
      description: "Work packages assigned to you, soonest due first. The usual starting point for a working session.",
      inputSchema: {
        status: z.enum(["open", "closed"]).optional().describe("Defaults to open."),
        limit: z.number().int().positive().optional().describe("Maximum results, capped at 100. Defaults to 50."),
      },
    },
    handler(async ({ status, limit }: { status?: "open" | "closed"; limit?: number }) => {
      const project = config.defaultProject;
      const { elements } = await client.collection(collectionPath(project), {
        filters: await buildSearchFilters(client, { assignee: "me", status: status ?? "open", project }),
        pageSize: Math.min(limit ?? 50, MAX_PAGE_SIZE),
        sortBy: [["dueDate", "asc"]],
      });
      return elements.map((wp) => flattenWorkPackage(wp, config.url));
    }),
  );
}
