import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import type { Config } from "../../src/config.js";

export const testConfig: Config = {
  profile: "test",
  url: "https://op.acme.com",
  apiKey: "secret",
  conventionsPath: "/nonexistent/conventions.md",
  readOnly: false,
};

export async function connect(config: Config = testConfig): Promise<Client> {
  const server = await createServer(config);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
  return {
    isError: result.isError === true,
    text,
    json: () => JSON.parse(text) as any,
  };
}
