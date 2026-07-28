import { z } from "zod";
import { resolveHref, resolveUserHref } from "../resolve.js";
import type { ToolContext } from "./shared.js";

export type Links = Record<string, { href: string | null }>;

export type WriteArgs = {
  subject?: string;
  description?: string;
  type?: string;
  status?: string;
  priority?: string;
  assignee?: string | null;
  parent?: number | null;
  startDate?: string;
  dueDate?: string;
  percentageDone?: number;
};

export const WRITE_SCHEMA = {
  subject: z.string().optional().describe("Title of the work package."),
  description: z.string().optional().describe("Markdown body."),
  type: z.string().optional().describe('Type name or id, for example "Bug".'),
  status: z.string().optional().describe('Status name or id, for example "In progress".'),
  priority: z.string().optional().describe('Priority name or id, for example "High".'),
  startDate: z.string().optional().describe("ISO date."),
  dueDate: z.string().optional().describe("ISO date."),
  percentageDone: z.number().int().min(0).max(100).optional().describe("Completion percentage."),
};

export async function buildPayload(
  client: ToolContext["client"],
  args: WriteArgs,
  project: string | undefined,
): Promise<{ fields: Record<string, unknown>; links: Links }> {
  const fields: Record<string, unknown> = {};
  if (args.subject !== undefined) fields.subject = args.subject;
  if (args.description !== undefined) fields.description = { raw: args.description };
  if (args.startDate !== undefined) fields.startDate = args.startDate;
  if (args.dueDate !== undefined) fields.dueDate = args.dueDate;
  if (args.percentageDone !== undefined) fields.percentageDone = args.percentageDone;

  const links: Links = {};
  if (args.type) links.type = { href: await resolveHref(client, "types", args.type, project) };
  if (args.status) links.status = { href: await resolveHref(client, "statuses", args.status, project) };
  if (args.priority) links.priority = { href: await resolveHref(client, "priorities", args.priority) };
  if (args.assignee !== undefined) {
    links.assignee = { href: args.assignee === null ? null : await resolveUserHref(client, args.assignee, project) };
  }
  if (args.parent !== undefined) {
    links.parent = { href: args.parent === null ? null : `/api/v3/work_packages/${args.parent}` };
  }
  return { fields, links };
}
