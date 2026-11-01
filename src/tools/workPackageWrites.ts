import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { segment, type OpenProjectClient } from "../client.js";
import { OpenProjectError } from "../errors.js";
import { flattenWorkPackage, linkId } from "../hal.js";
import { handler, projectOrDefault, type ToolContext } from "./shared.js";
import { WRITE_SCHEMA, buildPayload, type WriteArgs } from "./workPackageFields.js";

const RELATION_TYPES = ["relates", "duplicates", "blocks", "precedes", "includes", "requires"] as const;

const DESCRIPTION_CONFLICT =
  "Someone else changed this work package while you were editing it. Re-read it with get_work_package, compare their description with yours, and ask the user before retrying.";

async function patchWorkPackage(client: OpenProjectClient, id: number, body: Record<string, unknown>) {
  try {
    return await client.request("PATCH", `/work_packages/${id}`, { body });
  } catch (error) {
    if (error instanceof OpenProjectError && error.status === 409 && "description" in body) {
      throw new OpenProjectError(409, DESCRIPTION_CONFLICT);
    }
    throw error;
  }
}

export function registerWorkPackageWriteTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "create_work_package",
    {
      title: "Create a work package",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: "Create a work package in a project. Type and subject are required; everything else is optional. Category, accountable, estimates and custom fields are not supported here: use api_request.",
      inputSchema: {
        ...WRITE_SCHEMA,
        project: z.string().optional().describe("Project identifier, name or id. Defaults to the configured default project."),
        type: z.string().min(1).describe('Type name or id, for example "Bug". Use list_metadata to see the valid names.'),
        subject: z.string().min(1).describe("Title of the work package."),
        assignee: z.string().min(1).optional().describe('Assignee name, email, numeric id, or "me".'),
        parent: z.number().int().optional().describe("Id of the parent work package."),
      },
    },
    handler(async ({ project, ...args }: WriteArgs & { project?: string }) => {
      const target = await projectOrDefault(client, project);
      if (!target) throw new Error("No project given and no default project configured. Pass `project`, or set one with the setup wizard.");

      const { fields, links } = await buildPayload(client, args, target);
      const created = await client.request("POST", `/projects/${segment(target)}/work_packages`, {
        body: { ...fields, _links: links },
      });
      return flattenWorkPackage(created, config.url, { detail: true });
    }),
  );

  server.registerTool(
    "update_work_package",
    {
      title: "Update a work package",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      description:
        "Change any subset of a work package's fields. Changing the description requires lockVersion from get_work_package, so you never overwrite someone else's edit; other fields handle the lock for you. Pass null for assignee or parent to clear it. Category, accountable, estimates and custom fields are not supported here: use api_request.",
      inputSchema: {
        ...WRITE_SCHEMA,
        id: z.number().int().describe("Work package id."),
        lockVersion: z.number().int().optional().describe("The lockVersion you read from get_work_package. Required when description is set; optional otherwise (the current one is read for you)."),
        assignee: z.string().min(1).nullable().optional().describe('Assignee name, email, numeric id, "me", or null to clear.'),
        parent: z.number().int().nullable().optional().describe("Parent work package id, or null to detach."),
      },
    },
    handler(async ({ id, lockVersion, ...args }: WriteArgs & { id: number; lockVersion?: number }) => {
      if (args.description !== undefined && lockVersion === undefined) {
        throw new Error("Changing the description needs lockVersion. Call get_work_package first, then pass its lockVersion, so a colleague's edit is not overwritten.");
      }
      if (Object.values(args).every((value) => value === undefined)) {
        throw new Error("Nothing to update. Supply at least one field.");
      }
      const needsProject = args.type !== undefined || args.version !== undefined || typeof args.assignee === "string";
      const current = lockVersion === undefined || needsProject
        ? await client.request("GET", `/work_packages/${id}`)
        : undefined;
      const project = current ? String(linkId(current, "project") ?? "") : config.defaultProject;
      const { fields, links } = await buildPayload(client, args, project || undefined);

      // OpenProject uses optimistic locking: a PATCH without the resource's
      // current lockVersion is rejected, and a stale one returns 409.
      const body: Record<string, unknown> = { lockVersion: lockVersion ?? current?.lockVersion, ...fields };
      if (Object.keys(links).length) body._links = links;

      const updated = await patchWorkPackage(client, id, body);
      return flattenWorkPackage(updated, config.url, { detail: true });
    }),
  );

  server.registerTool(
    "comment_work_package",
    {
      title: "Comment on a work package",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: "Add a markdown comment. Everyone watching the work package gets a notification.",
      inputSchema: {
        id: z.number().int().describe("Work package id."),
        comment: z.string().min(1).describe("Markdown comment body."),
      },
    },
    handler(async ({ id, comment }: { id: number; comment: string }) => {
      const created = await client.request("POST", `/work_packages/${id}/activities`, {
        body: { comment: { raw: comment } },
      });
      return { id: created.id, createdAt: created.createdAt, url: `${config.url}/work_packages/${id}` };
    }),
  );

  server.registerTool(
    "link_work_packages",
    {
      title: "Link two work packages",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: "Create a relation between two work packages, such as one blocking another.",
      inputSchema: {
        from: z.number().int().describe("Work package the relation starts from."),
        to: z.number().int().describe("Work package the relation points to."),
        type: z.enum(RELATION_TYPES).describe("Relation type."),
      },
    },
    handler(async ({ from, to, type }: { from: number; to: number; type: string }) => {
      const relation = await client.request("POST", `/work_packages/${from}/relations`, {
        body: { type, _links: { to: { href: `/api/v3/work_packages/${to}` } } },
      });
      return { id: relation.id, type: relation.type, from, to };
    }),
  );
}
