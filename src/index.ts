#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { runInstall } from "./install.js";
import { createServer } from "./server.js";
import { runSetup } from "./setup.js";

if (process.argv.includes("setup")) {
  await runSetup(process.argv.slice(2));
} else if (process.argv.includes("install")) {
  await runInstall(process.argv.slice(2));
} else {
  const server = await createServer(loadConfig());
  await server.connect(new StdioServerTransport());
}
