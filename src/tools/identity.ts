import { existsSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { segment } from "../client.js";
import { flattenProject } from "../hal.js";
import { handler, projectOrDefault, type ToolContext } from "./shared.js";

export function registerIdentityTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      annotations: { readOnlyHint: true },
      description:
        "Identity and connection state: which user you are acting as, which OpenProject instance you are on, the default project, whether writes are permitted, and whether this workplace has a conventions manual. Use when a call fails with an auth or configuration error.",
      inputSchema: {},
    },
    handler(async () => {
      const identity = await client.me();
      return {
        user: identity.name,
        email: identity.email,
        userId: identity.id,
        instanceUrl: config.url,
        profile: config.profile,
        defaultProject: config.defaultProject,
        readOnly: config.readOnly,
        conventionsLoaded: existsSync(config.conventionsPath),
      };
    }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      annotations: { readOnlyHint: true },
      description: "Projects visible to you, as { total, projects }. Use the `identifier` value wherever a tool asks for a project.",
      inputSchema: {
        query: z.string().optional().describe("Case-insensitive substring matched against the project name."),
      },
    },
    handler(async ({ query }: { query?: string }) => {
      const { total, elements, truncated } = await client.collectAll("/projects");
      const needle = query?.toLowerCase();
      const projects = elements
        .map((project) => flattenProject(project, config.url))
        .filter((project) => !needle || String(project.name).toLowerCase().includes(needle));
      return { total: needle ? projects.length : total, projects, ...(truncated ? { truncated } : {}) };
    }),
  );

  server.registerTool(
    "list_users",
    {
      title: "List users",
      annotations: { readOnlyHint: true },
      description:
        "People you can assign work to, as { total, users, truncated? }. Pass a project to get exactly its assignable members; omit it to use the default project, or everyone visible to you when none is set.",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe("Project identifier, name or numeric id. Falls back to the configured default project."),
        query: z.string().optional().describe("Case-insensitive substring matched against name or email."),
      },
    },
    handler(async ({ project, query }: { project?: string; query?: string }) => {
      const target = await projectOrDefault(client, project);
      const { total, elements, truncated } = target
        ? await client.collectAll(`/projects/${segment(target)}/available_assignees`)
        : await client.collectAll("/principals");
      const users = elements.map((user) => ({ id: user.id, name: user.name, email: user.email }));
      const needle = query?.toLowerCase();
      const matching = users.filter((user) => !needle || `${user.name} ${user.email ?? ""}`.toLowerCase().includes(needle));
      return { total: needle ? matching.length : total, users: matching, ...(truncated ? { truncated } : {}) };
    }),
  );
}
