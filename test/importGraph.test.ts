import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const TERMINAL_ONLY = [
  "cli.ts", "setup.ts", "credentials.ts", "install.ts", "doctor.ts", "prompts.ts", "select.ts", "ui.ts", "outro.ts",
  "i18n/index.ts", "i18n/en.ts", "i18n/es.ts",
];

function localImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specifiers = [...text.matchAll(/^(?:import|export)\b[^;]*?from\s+"(\.[^"]+)"/gms)].map((match) => match[1]);
  return specifiers.map((specifier) => join(dirname(file), specifier.replace(/\.js$/, ".ts")));
}

function reachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    queue.push(...localImports(file));
  }
  return [...seen].map((file) => file.slice(SRC.length + 1).replaceAll("\\", "/"));
}

describe("import graph", () => {
  it("the server never reaches code that writes to the terminal", () => {
    const reached = reachableFrom(join(SRC, "server.ts"));
    expect(reached).toContain("tools/raw.ts");
    expect(reached.filter((file) => TERMINAL_ONLY.includes(file))).toEqual([]);
  });

  it("would catch a terminal module if one were imported", () => {
    expect(reachableFrom(join(SRC, "cli.ts"))).toContain("setup.ts");
  });
});
