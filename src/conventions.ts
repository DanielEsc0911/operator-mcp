import { chmodSync, copyFileSync, existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { bulletText, cleanRule, cleanSection, findSection, parse, topLevelBullets } from "./manualText.js";


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

const NEXT_SESSION = "Takes effect next session; `conventions` shows the current text.";

function writeAtomically(path: string, text: string): void {
  const target = existsSync(path) ? realpathSync(path) : path;
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, text, { mode: 0o600 });
  if (existsSync(target)) chmodSync(temporary, statSync(target).mode & 0o7777);
  renameSync(temporary, target);
}

function sizeWarning(text: string): { warning?: string } {
  const bytes = Buffer.byteLength(text);
  return bytes > MANUAL_WARNING_BYTES ? { warning: `The manual is ${bytes} bytes and is sent on every session. Consider trimming it.` } : {};
}

export function readConventions(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch (error) {
    process.stderr.write(`operator-mcp: cannot read ${path}: ${error instanceof Error ? error.message : String(error)}\n`);
    return null;
  }
}

function parseForEdit(text: string) {
  const doc = parse(text);
  if (doc.unclosedFence !== null) {
    throw new Error(`The manual has a code fence opened on line ${doc.unclosedFence} that is never closed. Ask the user to fix it before rules are changed.`);
  }
  return doc;
}

export function addRule(path: string, rawSection: string, rawRule: string) {
  const section = cleanSection(rawSection);
  const rule = cleanRule(rawRule);
  if (!section || !rule) throw new Error("Both section and rule need visible text. Pass a short heading and a one-line rule.");
  const text = readConventions(path) ?? "";
  const doc = parseForEdit(text);
  const found = findSection(doc, section);
  const done = (written: string, added: boolean) =>
    ({ section, rule, path, added, note: added ? NEXT_SESSION : "Already in the manual; nothing changed.", ...sizeWarning(written) });

  if (!found) {
    const body = text.trimEnd();
    const written = `${body ? `${body}${doc.eol}${doc.eol}` : ""}## ${section}${doc.eol}${doc.eol}- ${rule}${doc.eol}`;
    writeAtomically(path, written);
    return done(written, true);
  }
  if (topLevelBullets(doc, found).some((entry) => bulletText(doc, entry) === rule)) return done(text, false);

  let insertAt = found.end;
  while (insertAt > found.start + 1 && doc.lines[insertAt - 1].trim() === "") insertAt--;
  doc.lines.splice(insertAt, 0, `- ${rule}`);
  const written = doc.lines.join(doc.eol);
  writeAtomically(path, written);
  return done(written, true);
}

export function removeRule(path: string, rawSection: string, rawRule: string) {
  const text = readConventions(path);
  if (text === null) return { removed: false, bullets: [] };
  const doc = parseForEdit(text);
  const found = findSection(doc, cleanSection(rawSection));
  if (!found) return { removed: false, bullets: [] };

  const entries = topLevelBullets(doc, found);
  const bullets = entries.map((entry) => bulletText(doc, entry));
  const target = cleanRule(rawRule);
  const match = entries.find((_, position) => bullets[position] === target);
  if (!match) return { removed: false, bullets };

  const backupPath = `${path}.bak`;
  copyFileSync(path, backupPath);
  doc.lines.splice(match.index, match.last - match.index + 1);
  const written = doc.lines.join(doc.eol);
  writeAtomically(path, written);
  return { removed: true, backupPath, bullets, note: NEXT_SESSION, ...sizeWarning(written) };
}
