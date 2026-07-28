import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listMetadata, type MetaKind } from "../resolve.js";
import { handler, type ToolContext } from "./shared.js";

export function registerMetaTools(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    "list_metadata",
    {
      title: "List metadata",
      description:
        "Ids and names for work package types, statuses, priorities, or time entry activities. Call this when a write is rejected for an unknown value, or when you need the exact wording this instance uses.",
      inputSchema: {
        kind: z
          .enum(["types", "statuses", "priorities", "activities"])
          .describe("Which list to fetch. `activities` means time entry activities."),
        project: z
          .string()
          .optional()
          .describe("Restrict types to one project. Ignored for the other kinds."),
      },
    },
    handler(({ kind, project }: { kind: MetaKind; project?: string }) =>
      listMetadata(client, kind, project ?? client.config.defaultProject),
    ),
  );
}
