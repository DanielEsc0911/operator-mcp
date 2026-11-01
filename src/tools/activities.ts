import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenProjectClient } from "../client.js";
import { flattenActivity } from "../hal.js";
import { handler, type ToolContext } from "./shared.js";

const MAX_ENTRIES = 100;
const COMMENT_CHARS = 500;

// The activities endpoint ignores pageSize and sortBy and returns oldest first,
// so the whole history is fetched and ordered here.
async function newestFirst(client: OpenProjectClient, id: number) {
  const { elements } = await client.collection(`/work_packages/${id}/activities`);
  return elements.map(flattenActivity).reverse();
}

function cappedComment(comment: unknown): string {
  return String(comment).slice(0, COMMENT_CHARS);
}

export async function latestComments(client: OpenProjectClient, id: number, count: number) {
  const entries = await newestFirst(client, id);
  return entries
    .filter((entry) => entry.comment)
    .slice(0, count)
    .map(({ user, comment, createdAt }) => ({ user, comment: cappedComment(comment), createdAt }));
}

export function registerActivityTools(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    "list_activities",
    {
      title: "List work package activity",
      annotations: { readOnlyHint: true },
      description: `Comments and field changes for one work package, newest first, as { total, activities }. Comments are cut at ${COMMENT_CHARS} characters.`,
      inputSchema: {
        id: z.number().int().describe("Work package id."),
        limit: z.number().int().positive().max(MAX_ENTRIES).optional().describe("Maximum entries, at most 100. Defaults to 10."),
      },
    },
    handler(async ({ id, limit }: { id: number; limit?: number }) => {
      const entries = await newestFirst(client, id);
      const activities = entries
        .slice(0, limit ?? 10)
        .map((entry) => (entry.comment ? { ...entry, comment: cappedComment(entry.comment) } : entry));
      return { total: entries.length, activities };
    }),
  );
}
