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
  version?: string;
  startDate?: string | null;
  dueDate?: string | null;
  percentageDone?: number;
};

export const WRITE_SCHEMA = {
  subject: z.string().min(1).optional().describe("Title of the work package."),
  description: z.string().optional().describe("Markdown body."),
  type: z.string().min(1).optional().describe('Type name or id, for example "Bug".'),
  status: z.string().min(1).optional().describe('Status name or id, for example "In progress".'),
  priority: z.string().min(1).optional().describe('Priority name or id, for example "High".'),
  version: z.string().min(1).optional().describe("Version name or id, looked up in the work package's project. See list_metadata with kind `versions`. Other fields (category, accountable, estimates, custom fields) go through api_request."),
  startDate: z.string().nullable().optional().describe("ISO date, or null to clear."),
  dueDate: z.string().nullable().optional().describe("ISO date, or null to clear."),
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
  if (args.type !== undefined) links.type = { href: await resolveHref(client, "types", args.type, project) };
  if (args.status !== undefined) links.status = { href: await resolveHref(client, "statuses", args.status, project) };
  if (args.priority !== undefined) links.priority = { href: await resolveHref(client, "priorities", args.priority) };
  if (args.version !== undefined) links.version = { href: await resolveHref(client, "versions", args.version, project) };
  if (args.assignee !== undefined) {
    links.assignee = { href: args.assignee === null ? null : await resolveUserHref(client, args.assignee, project) };
  }
  if (args.parent !== undefined) {
    links.parent = { href: args.parent === null ? null : `/api/v3/work_packages/${args.parent}` };
  }
  return { fields, links };
}
