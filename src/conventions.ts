import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TEMPLATE_PATH = fileURLToPath(new URL("../templates/conventions.md", import.meta.url));

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const BULLET = /^\s*[-*]\s+/;

type Section = { start: number; end: number };

function findSection(lines: string[], name: string): Section | null {
  const wanted = name.trim().toLowerCase();
  for (let index = 0; index < lines.length; index++) {
    const heading = HEADING.exec(lines[index]);
    if (!heading || heading[2].trim().toLowerCase() !== wanted) continue;
    const next = lines.findIndex((line, offset) => offset > index && HEADING.test(line));
    return { start: index, end: next === -1 ? lines.length : next };
  }
  return null;
}

function bulletText(line: string): string {
  return line.replace(BULLET, "").trim();
}

export function readConventions(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function addRule(path: string, section: string, rule: string): { section: string; rule: string; path: string } {
  const text = readConventions(path) ?? "";
  const bullet = `- ${rule.trim()}`;
  const lines = text.split("\n");
  const found = findSection(lines, section);

  if (!found) {
    const head = text.trimEnd();
    writeFileSync(path, `${head ? `${head}\n\n` : ""}## ${section}\n\n${bullet}\n`, { mode: 0o600 });
    return { section, rule, path };
  }

  let insertAt = found.end;
  while (insertAt > found.start + 1 && lines[insertAt - 1].trim() === "") insertAt--;
  lines.splice(insertAt, 0, bullet);
  writeFileSync(path, lines.join("\n"), { mode: 0o600 });
  return { section, rule, path };
}

export function removeRule(
  path: string,
  section: string,
  rule: string,
): { removed: boolean; backupPath?: string; bullets: string[] } {
  const text = readConventions(path);
  if (text === null) return { removed: false, bullets: [] };

  const lines = text.split("\n");
  const found = findSection(lines, section);
  if (!found) return { removed: false, bullets: [] };

  const bullets = lines.slice(found.start + 1, found.end).filter((line) => BULLET.test(line)).map(bulletText);
  const target = rule.trim();
  const index = lines.findIndex(
    (line, offset) => offset > found.start && offset < found.end && BULLET.test(line) && bulletText(line) === target,
  );
  if (index === -1) return { removed: false, bullets };

  const backupPath = `${path}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  copyFileSync(path, backupPath);
  lines.splice(index, 1);
  writeFileSync(path, lines.join("\n"), { mode: 0o600 });
  return { removed: true, backupPath, bullets };
}
