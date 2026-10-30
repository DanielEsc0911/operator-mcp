import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { segment } from "../client.js";
import { readConventions } from "../conventions.js";
import { flattenProject } from "../hal.js";
import { handler, type ToolContext } from "./shared.js";

export function registerIdentityTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Identity and connection state. Call this first: it tells you which user you are acting as, which OpenProject instance you are on, the default project, whether writes are permitted, and whether this workplace has a conventions manual.",
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
        conventionsLoaded: readConventions(config.conventionsPath) !== null,
      };
    }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Projects visible to you. Use the `identifier` value wherever a tool asks for a project.",
      inputSchema: {
        query: z.string().optional().describe("Case-insensitive substring matched against the project name."),
      },
    },
    handler(async ({ query }: { query?: string }) => {
      const { elements } = await client.collection("/projects", { pageSize: 200 });
      const projects = elements.map((project) => flattenProject(project, config.url));
      if (!query) return projects;
      const needle = query.toLowerCase();
      return projects.filter((project) => String(project.name).toLowerCase().includes(needle));
    }),
  );

  server.registerTool(
    "list_users",
    {
      title: "List users",
      description:
        "People you can assign work to. Pass a project to get exactly its assignable members; omit it to search everyone visible to you.",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe("Project identifier or numeric id. Falls back to the configured default project."),
        query: z.string().optional().describe("Case-insensitive substring matched against name or email."),
      },
    },
    handler(async ({ project, query }: { project?: string; query?: string }) => {
      const target = project ?? config.defaultProject;
      const { elements } = target
        ? await client.collection(`/projects/${segment(target)}/available_assignees`, { pageSize: 200 })
        : await client.collection("/principals", { pageSize: 200 });
      const users = elements.map((user) => ({ id: user.id, name: user.name, email: user.email }));
      if (!query) return users;
      const needle = query.toLowerCase();
      return users.filter((user) => `${user.name} ${user.email ?? ""}`.toLowerCase().includes(needle));
    }),
  );
}
