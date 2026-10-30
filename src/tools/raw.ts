import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handler, type ToolContext } from "./shared.js";

type RawArgs = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

export function registerRawTools(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    "api_request",
    {
      title: "Raw OpenProject APIv3 request",
      description:
        "Escape hatch for anything the other tools do not cover. DELETE is refused unless the user set OPENPROJECT_ALLOW_DELETE=1. Returns the raw HAL+JSON response, unflattened. Prefer a dedicated tool when one exists — this one requires you to know APIv3 request shapes, and its responses are large.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PATCH", "DELETE"]).describe("HTTP method. DELETE works only when the user enabled it with OPENPROJECT_ALLOW_DELETE=1."),
        path: z
          .string()
          .describe("Path relative to /api/v3. Example: /work_packages/1234/watchers"),
        query: z
          .record(z.string(), z.string())
          .optional()
          .describe("Query parameters. Encode `filters` and `sortBy` yourself, as JSON strings."),
        body: z.record(z.string(), z.unknown()).optional().describe("JSON request body."),
      },
    },
    handler(async ({ method, path, query, body }: RawArgs) => {
      if (method === "DELETE" && !client.config.allowDelete) {
        throw new Error(
          "DELETE is disabled on this server. Tell the user what you wanted to delete; they can delete it in OpenProject, or set OPENPROJECT_ALLOW_DELETE=1 in this server's environment to allow it here.",
        );
      }
      const result = await client.request(method, path.startsWith("/") ? path : `/${path}`, { query, body });
      return result ?? { ok: true };
    }),
  );
}
