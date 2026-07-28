import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveHref } from "../resolve.js";
import { handler, type ToolContext } from "./shared.js";

// OpenProject stores time entry durations as ISO 8601, so 2.5 hours is PT2H30M.
export function toIsoDuration(hours: number): string {
  const minutes = Math.round(hours * 60);
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!whole && !rest) return "PT0H";
  return `PT${whole ? `${whole}H` : ""}${rest ? `${rest}M` : ""}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type LogArgs = { workPackageId: number; hours: number; date?: string; comment?: string; activity?: string };

export function registerTimeTools(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    "log_time",
    {
      title: "Log time",
      description: "Record time spent on a work package. Hours are given as a decimal number; 2.5 means two and a half.",
      inputSchema: {
        workPackageId: z.number().int().describe("Work package the time was spent on."),
        hours: z.number().positive().describe("Decimal hours, for example 2.5."),
        date: z.string().optional().describe("ISO date the work happened. Defaults to today."),
        comment: z.string().optional().describe("What the time was spent doing."),
        activity: z.string().optional().describe('Activity name or id, for example "Development". See list_metadata.'),
      },
    },
    handler(async ({ workPackageId, hours, date, comment, activity }: LogArgs) => {
      const links: Record<string, { href: string }> = {
        workPackage: { href: `/api/v3/work_packages/${workPackageId}` },
      };
      if (activity) links.activity = { href: await resolveHref(client, "activities", activity) };

      const entry = await client.request("POST", "/time_entries", {
        body: {
          hours: toIsoDuration(hours),
          spentOn: date ?? today(),
          ...(comment ? { comment: { raw: comment } } : {}),
          _links: links,
        },
      });
      return { id: entry.id, hours: entry.hours, spentOn: entry.spentOn, workPackageId };
    }),
  );
}
