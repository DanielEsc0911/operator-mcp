import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenProjectClient, type Identity } from "./client.js";
import type { Config } from "./config.js";
import { readConventions } from "./conventions.js";
import { registerConventionTools } from "./tools/conventions.js";
import { registerIdentityTools } from "./tools/identity.js";
import { registerMetaTools } from "./tools/meta.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerRawTools } from "./tools/raw.js";
import { registerTimeTools } from "./tools/time.js";
import { registerWorkPackageTools } from "./tools/workPackages.js";
import { registerWorkPackageWriteTools } from "./tools/workPackageWrites.js";

const MANUAL_WARNING_BYTES = 10_000;
export const version = "1.1.2";

export function buildInstructions(config: Config, identity: Identity | null, manual: string | null): string {
  const lines = [
    identity
      ? `You are ${identity.name} (${identity.email}) on ${config.url}, profile "${config.profile}".`
      : `OpenProject server, profile "${config.profile}". Identity is unresolved — call whoami to find out why.`,
  ];
  if (config.defaultProject) lines.push(`Default project: ${config.defaultProject}.`);
  if (config.readOnly) lines.push("This server is read-only. No changes can be made.");
  if (manual?.trim()) lines.push("", "Follow these conventions in all OpenProject work:", "", manual.trim());
  return lines.join("\n");
}

export async function createServer(config: Config): Promise<McpServer> {
  const client = new OpenProjectClient(config);
  const identity = await client.me().catch(() => null);
  const manual = readConventions(config.conventionsPath);

  const bytes = manual ? Buffer.byteLength(manual) : 0;
  if (bytes > MANUAL_WARNING_BYTES) {
    process.stderr.write(`operator-mcp: conventions manual is ${bytes} bytes and is sent on every session.\n`);
  }

  const server = new McpServer(
    { name: "openproject", version },
    { instructions: buildInstructions(config, identity, manual) },
  );

  registerIdentityTools(server, { client });
  registerMetaTools(server, { client });
  registerWorkPackageTools(server, { client });
  registerWorkPackageWriteTools(server, { client });
  registerNotificationTools(server, { client });
  registerTimeTools(server, { client });
  registerConventionTools(server, { client });
  registerRawTools(server, { client });
  return server;
}
