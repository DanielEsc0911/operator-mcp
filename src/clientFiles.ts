import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function backup(path: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
}

export function writeMerged(path: string, text: string): void {
  backup(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { mode: 0o600 });
}

function stripJsonComments(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (text[i] === '"') {
      const end = /"(?:[^"\\]|\\.)*"/y;
      end.lastIndex = i;
      const quoted = end.exec(text)?.[0] ?? '"';
      out += quoted;
      i += quoted.length - 1;
    } else if (pair === "//") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (pair === "/*") {
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? text.length : close + 1;
    } else {
      out += text[i];
    }
  }
  return out;
}

export function editJson(path: string, edit: (document: Record<string, any>) => void): void {
  let document: Record<string, any> = {};
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8");
    if (stripJsonComments(text) !== text) throw new Error(`${path} has comments that rewriting it would erase`);
    try {
      document = JSON.parse(text);
    } catch {
      throw new Error(`${path} is not valid JSON — fix or move it, then run: npx operator-mcp install`);
    }
  }
  edit(document);
  writeMerged(path, `${JSON.stringify(document, null, 2)}\n`);
}

export function readJson(path: string): Record<string, any> {
  try {
    return JSON.parse(stripJsonComments(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

export type Spawn = { command?: string | string[]; args?: string[] };

export function commandLine(spawn: Spawn | undefined): string[] | null {
  return spawn?.command ? [...[spawn.command].flat(), ...(spawn.args ?? [])] : null;
}

export function tomlKey(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
}

const quote = JSON.stringify;
const tomlLines = (text: string) => text.split(/\r?\n/);

function findTable(lines: string[], name: string): { start: number; end: number } | null {
  const keys = [name, quote(name)].map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const header = new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*(?:${keys})\\s*\\]\\s*(?:#.*)?$`);
  const start = lines.findIndex((line) => header.test(line));
  if (start === -1) return null;
  const after = lines.findIndex((line, index) => index > start && line.trimStart().startsWith("["));
  return { start, end: after === -1 ? lines.length : after };
}

export function upsertTomlServer(text: string, name: string, command: string, args: string[]): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = tomlLines(text);
  const table = findTable(lines, name);
  const body = [`command = ${quote(command)}`, `args = [${args.map((arg) => quote(arg)).join(", ")}]`];
  if (!table) {
    const block = [`[mcp_servers.${tomlKey(name)}]`, ...body, ""].join(eol);
    return text.trim() === "" ? block : `${text.trimEnd()}${eol}${eol}${block}`;
  }
  const kept: string[] = [];
  let inArgs = false;
  for (const line of lines.slice(table.start + 1, table.end)) {
    if (inArgs) inArgs = !line.includes("]");
    else if (/^\s*args\s*=/.test(line)) inArgs = !line.includes("]");
    else if (!/^\s*command\s*=/.test(line)) kept.push(line);
  }
  lines.splice(table.start + 1, table.end - table.start - 1, ...body, ...kept);
  return lines.join(eol);
}

export function tomlEntry(path: string, name: string): string[] | null {
  const lines = existsSync(path) ? tomlLines(readFileSync(path, "utf8")) : [];
  const table = findTable(lines, name);
  if (!table) return null;
  const value = (key: string) =>
    lines.slice(table.start + 1, table.end).find((line) => line.startsWith(`${key} = `))?.slice(key.length + 3);
  try {
    return commandLine({ command: JSON.parse(value("command") ?? "null"), args: JSON.parse(value("args") ?? "[]") });
  } catch {
    return null;
  }
}
