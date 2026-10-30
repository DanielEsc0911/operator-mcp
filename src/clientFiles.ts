import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function backup(path: string): void {
  if (!existsSync(path)) return;
  copyFileSync(path, `${path}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`);
}

export function writeMerged(path: string, text: string): void {
  backup(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { mode: 0o600 });
}

export function editJson(path: string, edit: (document: Record<string, any>) => void): void {
  let document: Record<string, any> = {};
  if (existsSync(path)) {
    try {
      const text = readFileSync(path, "utf8");
      if (text.trim()) document = JSON.parse(text);
    } catch {
      throw new Error(`${path} is not valid JSON — fix or move it, then run: npx operator-mcp install`);
    }
  }
  edit(document);
  writeMerged(path, `${JSON.stringify(document, null, 2)}\n`);
}

export function tomlKey(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
}

export function upsertTomlTable(text: string, header: string, body: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(header);
  if (start === -1) return `${text.trimEnd()}\n\n${header}\n${body}\n`.replace(/^\n+/, "");

  const after = lines.findIndex((line, index) => index > start && line.trimStart().startsWith("["));
  const end = after === -1 ? lines.length : after;
  lines.splice(start, end - start, header, ...body.split("\n"), "");
  return lines.join("\n");
}

export type Spawn = { command?: string | string[]; args?: string[] };

export function readJson(path: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function commandLine(spawn: Spawn | undefined): string[] | null {
  return spawn?.command ? [...[spawn.command].flat(), ...(spawn.args ?? [])] : null;
}

export function tomlEntry(path: string, header: string): string[] | null {
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  const start = lines.indexOf(header);
  if (start === -1) return null;
  const value = (key: string) => lines.slice(start + 1).find((line) => line.startsWith(`${key} = `))?.slice(key.length + 3);
  try {
    return commandLine({ command: JSON.parse(value("command") ?? "null"), args: JSON.parse(value("args") ?? "[]") });
  } catch {
    return null;
  }
}
