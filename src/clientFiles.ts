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
      if (text.trim()) document = JSON.parse(text);
    } catch {
      throw new Error(`${path} is not valid JSON — fix or move it, then run: npx operator-mcp install`);
    }
  }
  edit(document);
  writeMerged(path, `${JSON.stringify(document, null, 2)}\n`);
}

const withoutTrailingCommas = (text: string) =>
  text.replace(/"(?:[^"\\]|\\.)*"|,(\s*[}\]])/g, (match, close) => close ?? match);

export function readJson(path: string): Record<string, any> {
  try {
    return JSON.parse(withoutTrailingCommas(stripJsonComments(readFileSync(path, "utf8"))));
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

const spelledKey = (name: string) => [name, quote(name), `'${name}'`].map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

function findTable(lines: string[], name: string): { start: number; end: number } | null {
  const header = new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*(?:${spelledKey(name)})\\s*\\]\\s*(?:#.*)?$`);
  const start = lines.findIndex((line) => header.test(line));
  if (start === -1) return null;
  const after = lines.findIndex((line, index) => index > start && line.trimStart().startsWith("["));
  return { start, end: after === -1 ? lines.length : after };
}

function definedElsewhere(lines: string[], name: string): boolean {
  const form = new RegExp(`^\\s*(?:mcp_servers\\s*\\.\\s*)?(?:${spelledKey(name)})\\s*[=.]`);
  return lines.some((line) => form.test(line));
}

// A multi-line value runs to the line that starts with its closing bracket; a `]` inside a string does not end it.
function valueEnd(lines: string[], start: number): number {
  const value = lines[start].replace(/^[^=]*=\s*/, "").trim();
  if (!value.startsWith("[") || value.endsWith("]")) return start;
  const close = lines.findIndex((line, index) => index > start && line.trim().startsWith("]"));
  return close === -1 ? lines.length - 1 : close;
}

export function upsertTomlServer(text: string, name: string, command: string, args: string[]): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = tomlLines(text);
  const table = findTable(lines, name);
  const body = [`command = ${quote(command)}`, `args = [${args.map((arg) => quote(arg)).join(", ")}]`];
  if (!table) {
    if (definedElsewhere(lines, name)) throw new Error(`\`${name}\` is already defined in config.toml in a form this installer will not rewrite`);
    const block = [`[mcp_servers.${tomlKey(name)}]`, ...body, ""].join(eol);
    return text.trim() === "" ? block : `${text.trimEnd()}${eol}${eol}${block}`;
  }
  const kept: string[] = [];
  const existing = lines.slice(table.start + 1, table.end);
  for (let i = 0; i < existing.length; i++) {
    if (/^\s*args\s*=/.test(existing[i])) i = valueEnd(existing, i);
    else if (!/^\s*command\s*=/.test(existing[i])) kept.push(existing[i]);
  }
  lines.splice(table.start + 1, table.end - table.start - 1, ...body, ...kept);
  return lines.join(eol);
}

export function tomlEntry(path: string, name: string): string[] | null {
  const lines = existsSync(path) ? tomlLines(readFileSync(path, "utf8")) : [];
  const table = findTable(lines, name);
  if (!table) return null;
  const section = lines.slice(table.start + 1, table.end);
  const value = (key: string) => {
    const start = section.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
    if (start === -1) return undefined;
    const text = section.slice(start, valueEnd(section, start) + 1).join("\n");
    return withoutTrailingCommas(text.replace(/^[^=]*=\s*/, ""));
  };
  try {
    return commandLine({ command: JSON.parse(value("command") ?? "null"), args: JSON.parse(value("args") ?? "[]") });
  } catch {
    return null;
  }
}
