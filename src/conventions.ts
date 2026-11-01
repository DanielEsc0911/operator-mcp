import { copyFileSync, existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";

export const STARTER_MANUAL = `# <Workplace> — OpenProject conventions

Replace <Workplace> with your organization and edit the rules below. Everything
in this file is sent to the agent at the start of every session, so keep it under
roughly 200 lines and delete anything that no longer applies.

## Git / GitLab
- Branch: \`{type}/{wp-id}-{slug}\`  →  \`bug/1234-fix-login-redirect\`
- Commit subject: \`[#1234] <imperative summary>\`
- MR title must contain \`#1234\` so GitLab links back to the work package.

## Workflow
- Move to \`In progress\` only once a branch exists.
- Never close a work package yourself — set \`Developed\`, QA closes it.

## Fields
- \`Version\` is required on every Bug.
- Log time the same day, in hours.

## Etiquette
- Comment on the work package when you push. Don't just push.
`;

export const MANUAL_WARNING_BYTES = 10_000;

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const BULLET = /^\s*[-*+]\s+/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const NEXT_SESSION = "Takes effect next session; `conventions` shows the current text.";

const SECTION_MAX = 80;
const RULE_MAX = 500;

type Doc = { lines: string[]; live: boolean[] };
type Section = { start: number; end: number };

function oneLine(text: string, max: number, marker: RegExp): string {
  return text.replace(/\s+/g, " ").trim().replace(marker, "").slice(0, max).trim();
}

const cleanRule = (text: string) => oneLine(text, RULE_MAX, /^[-*+](\s+|$)/);
const cleanSection = (text: string) => oneLine(text, SECTION_MAX, /^(?:#{1,6}\s+|[-*+]\s+)+/);

function parse(text: string): Doc {
  const lines = text.split("\n");
  let fence: string | null = null;
  const live = lines.map((line) => {
    const opening = FENCE.exec(line)?.[1];
    if (!fence) return opening ? ((fence = opening), false) : true;
    if (opening && opening[0] === fence[0] && opening.length >= fence.length && !/[^`~\s]/.test(line)) fence = null;
    return false;
  });
  return { lines, live };
}

function findSection({ lines, live }: Doc, name: string): Section | null {
  const wanted = name.trim().toLowerCase();
  const headings = lines.flatMap((line, index) => (live[index] && HEADING.test(line) ? [index] : []));
  const start = headings.find((index) => HEADING.exec(lines[index])![2].trim().toLowerCase() === wanted);
  if (start === undefined) return null;
  return { start, end: headings.find((index) => index > start) ?? lines.length };
}

const indentOf = (line: string) => line.length - line.trimStart().length;

function bulletsIn({ lines, live }: Doc, { start, end }: Section): number[] {
  return Array.from({ length: end - start - 1 }, (_, offset) => start + 1 + offset).filter((i) => live[i] && BULLET.test(lines[i]));
}

function lastLineOf({ lines }: Doc, index: number, end: number): number {
  let last = index;
  for (let next = index + 1; next < end; next++) {
    if (!lines[next].trim()) continue;
    if (indentOf(lines[next]) <= indentOf(lines[index])) break;
    last = next;
  }
  return last;
}

function bulletText({ lines }: Doc, index: number, last: number): string {
  const own = [lines[index].replace(BULLET, "")];
  for (let next = index + 1; next <= last && lines[next].trim() && !BULLET.test(lines[next]); next++) own.push(lines[next]);
  return own.join(" ").replace(/\s+/g, " ").trim();
}

function writeAtomically(path: string, text: string): void {
  const target = existsSync(path) ? realpathSync(path) : path;
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, text, { mode: 0o600 });
  renameSync(temporary, target);
}

function sizeWarning(text: string): { warning?: string } {
  const bytes = Buffer.byteLength(text);
  return bytes > MANUAL_WARNING_BYTES ? { warning: `The manual is ${bytes} bytes and is sent on every session. Consider trimming it.` } : {};
}

export function readConventions(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function addRule(path: string, rawSection: string, rawRule: string) {
  const section = cleanSection(rawSection);
  const rule = cleanRule(rawRule);
  if (!section || !rule) throw new Error("Both section and rule need visible text. Pass a short heading and a one-line rule.");
  const text = readConventions(path) ?? "";
  const doc = parse(text);
  const found = findSection(doc, section);
  const done = (written: string, added: boolean) =>
    ({ section, rule, path, added, note: added ? NEXT_SESSION : "Already in the manual; nothing changed.", ...sizeWarning(written) });

  if (!found) {
    const written = `${text.trimEnd() ? `${text.trimEnd()}\n\n` : ""}## ${section}\n\n- ${rule}\n`;
    writeAtomically(path, written);
    return done(written, true);
  }
  if (bulletsIn(doc, found).some((index) => bulletText(doc, index, lastLineOf(doc, index, found.end)) === rule)) return done(text, false);

  let insertAt = found.end;
  while (insertAt > found.start + 1 && doc.lines[insertAt - 1].trim() === "") insertAt--;
  doc.lines.splice(insertAt, 0, `- ${rule}`);
  const written = doc.lines.join("\n");
  writeAtomically(path, written);
  return done(written, true);
}

export function removeRule(path: string, rawSection: string, rawRule: string) {
  const text = readConventions(path);
  if (text === null) return { removed: false, bullets: [] };
  const doc = parse(text);
  const found = findSection(doc, cleanSection(rawSection));
  if (!found) return { removed: false, bullets: [] };

  const entries = bulletsIn(doc, found).map((index) => ({ index, last: lastLineOf(doc, index, found.end) }));
  const bullets = entries.map(({ index, last }) => bulletText(doc, index, last));
  const target = cleanRule(rawRule);
  const match = entries.find((_, position) => bullets[position] === target);
  if (!match) return { removed: false, bullets };

  const backupPath = `${path}.bak`;
  copyFileSync(path, backupPath);
  doc.lines.splice(match.index, match.last - match.index + 1);
  const written = doc.lines.join("\n");
  writeAtomically(path, written);
  return { removed: true, backupPath, bullets, note: NEXT_SESSION, ...sizeWarning(written) };
}
