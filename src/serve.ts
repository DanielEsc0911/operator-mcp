import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

export async function serve(argv: string[]): Promise<void> {
  const server = await createServer(loadConfig(argv));
  await server.connect(new StdioServerTransport());
}
