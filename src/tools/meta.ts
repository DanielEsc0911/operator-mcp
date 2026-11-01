import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listMetadata, type MetaKind } from "../resolve.js";
import { handler, projectOrDefault, type ToolContext } from "./shared.js";

export function registerMetaTools(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    "list_metadata",
    {
      title: "List metadata",
      annotations: { readOnlyHint: true },
      description:
        "Ids and names for work package types, statuses, priorities, versions, or time entry activities. Call this when a write is rejected for an unknown value, or when you need the exact wording this instance uses.",
      inputSchema: {
        kind: z
          .enum(["types", "statuses", "priorities", "activities", "versions"])
          .describe("Which list to fetch. `activities` means time entry activities; `versions` are the project's versions."),
        project: z
          .string()
          .optional()
          .describe("Project identifier, name or id. Restricts types or versions to one project. Ignored for the other kinds."),
        workPackageId: z
          .number()
          .int()
          .optional()
          .describe("Work package id. Required for `activities`, whose allowed values depend on the work package; ignored for the other kinds."),
      },
    },
    handler(async ({ kind, project, workPackageId }: { kind: MetaKind; project?: string; workPackageId?: number }) =>
      listMetadata(client, kind, await projectOrDefault(client, project), { workPackage: workPackageId }),
    ),
  );
}
