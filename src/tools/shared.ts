import type { OpenProjectClient } from "../client.js";
import { humanMessage } from "../errors.js";

export type ToolContext = { client: OpenProjectClient };

export function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function handler<Args>(run: (args: Args) => Promise<unknown>) {
  return async (args: Args) => {
    try {
      const value = await run(args);
      return typeof value === "string" ? { content: [{ type: "text" as const, text: value }] } : jsonResult(value);
    } catch (error) {
      return errorResult(humanMessage(error));
    }
  };
}
