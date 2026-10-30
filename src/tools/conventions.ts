import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addRule, readConventions, removeRule } from "../conventions.js";
import { ReadOnlyError } from "../errors.js";
import { handler, type ToolContext } from "./shared.js";

export function registerConventionTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;
  const missing = `No conventions manual for this workplace. Create one at ${config.conventionsPath}, or add the first rule with add_convention.`;

  server.registerTool(
    "conventions",
    {
      title: "Workplace conventions",
      description:
        "The rules this workplace expects you to follow in OpenProject: branch and commit naming, workflow states, required fields. These are also delivered in the server instructions; re-read them here whenever you are unsure.",
      inputSchema: {},
    },
    handler(async () => readConventions(config.conventionsPath) ?? missing),
  );

  server.registerTool(
    "add_convention",
    {
      title: "Record a convention",
      description:
        "Append a rule to the workplace manual so it survives this session. Use it when the user states a working rule you would otherwise forget. Appending never removes anything.",
      inputSchema: {
        section: z.string().describe('Heading to file the rule under, for example "Git / GitLab". Created if absent. One line, at most 80 characters.'),
        rule: z.string().describe("The rule, as one sentence. Line breaks are collapsed and it is cut at 500 characters."),
      },
    },
    handler(async ({ section, rule }: { section: string; rule: string }) => {
      if (config.readOnly) throw new ReadOnlyError();
      return addRule(config.conventionsPath, section, rule);
    }),
  );

  server.registerTool(
    "remove_convention",
    {
      title: "Remove a convention",
      description:
        "Delete a rule from the workplace manual. Set confirm only when the user has explicitly asked you, in this conversation, to remove that rule — never on your own initiative. The file is backed up before any change.",
      inputSchema: {
        section: z.string().describe("Heading the rule lives under."),
        rule: z.string().describe("Exact text of the rule, without its bullet marker."),
        confirm: z.boolean().optional().describe("Must be true. Only set it on the user's explicit instruction."),
      },
    },
    handler(async ({ section, rule, confirm }: { section: string; rule: string; confirm?: boolean }) => {
      if (config.readOnly) throw new ReadOnlyError();
      if (!confirm) {
        throw new Error(
          "Removing a convention needs confirm: true, and the user must have explicitly asked for this removal. Ask them first.",
        );
      }
      return removeRule(config.conventionsPath, section, rule);
    }),
  );

  server.registerResource(
    "conventions",
    "openproject://conventions",
    { title: "Workplace conventions", description: "This workplace's OpenProject rules.", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: readConventions(config.conventionsPath) ?? missing }],
    }),
  );
}
