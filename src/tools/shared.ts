import type { OpenProjectClient } from "../client.js";
import { ReadOnlyError, humanMessage } from "../errors.js";

export type ToolContext = { client: OpenProjectClient };

export function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
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

export function requireConfirm(confirm: boolean | undefined, readOnly: boolean, action: string): void {
  if (readOnly) throw new ReadOnlyError();
  if (!confirm) {
    throw new Error(
      `${action} needs confirm: true. Show the user exactly what will happen and ask first; set confirm only when they explicitly agree.`,
    );
  }
}
