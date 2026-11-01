const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const BULLET = /^\s*[-*+]\s+/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

const SECTION_MAX = 80;
const RULE_MAX = 500;

export type Doc = { lines: string[]; live: boolean[]; eol: string; unclosedFence: number | null };
export type Section = { start: number; end: number };
export type Entry = { index: number; last: number };

function oneLine(text: string, max: number, marker: RegExp): string {
  return text.replace(/\s+/g, " ").trim().replace(marker, "").slice(0, max).trim();
}

export const cleanRule = (text: string) => oneLine(text, RULE_MAX, /^[-*+](\s+|$)/);
export const cleanSection = (text: string) => oneLine(text, SECTION_MAX, /^(?:#{1,6}\s+|[-*+]\s+)+/);

function closesFence(line: string, fence: string): boolean {
  const marker = FENCE.exec(line)?.[1];
  return marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length && !/[^`~\s]/.test(line);
}

export function parse(text: string): Doc {
  const lines = text.split(/\r?\n/);
  const live: boolean[] = [];
  let fence: string | null = null;
  let fenceLine = 0;
  lines.forEach((line, index) => {
    if (fence === null) {
      const opening = FENCE.exec(line)?.[1];
      if (opening) {
        fence = opening;
        fenceLine = index;
      }
      live.push(!opening);
    } else {
      if (closesFence(line, fence)) fence = null;
      live.push(false);
    }
  });
  return { lines, live, eol: text.includes("\r\n") ? "\r\n" : "\n", unclosedFence: fence === null ? null : fenceLine + 1 };
}

export function findSection({ lines, live }: Doc, name: string): Section | null {
  const wanted = name.trim().toLowerCase();
  const headings = lines.flatMap((line, index) => (live[index] && HEADING.test(line) ? [index] : []));
  const start = headings.find((index) => HEADING.exec(lines[index])![2].trim().toLowerCase() === wanted);
  if (start === undefined) return null;
  return { start, end: headings.find((index) => index > start) ?? lines.length };
}

const indentOf = (line: string) => line.length - line.trimStart().length;

function lastLineOf({ lines }: Doc, index: number, end: number): number {
  let last = index;
  for (let next = index + 1; next < end; next++) {
    const line = lines[next];
    if (!line.trim()) continue;
    const nested = indentOf(line) > indentOf(lines[index]);
    const lazy = last === next - 1 && !BULLET.test(line) && !HEADING.test(line) && !FENCE.test(line);
    if (!nested && !lazy) break;
    last = next;
  }
  return last;
}

export function topLevelBullets(doc: Doc, { start, end }: Section): Entry[] {
  const entries: Entry[] = [];
  for (let index = start + 1; index < end; index++) {
    if (!doc.live[index] || !BULLET.test(doc.lines[index])) continue;
    const last = lastLineOf(doc, index, end);
    entries.push({ index, last });
    index = last;
  }
  return entries;
}

export function bulletText({ lines }: Doc, { index, last }: Entry): string {
  const own = [lines[index].replace(BULLET, "")];
  for (let next = index + 1; next <= last && lines[next].trim() && !BULLET.test(lines[next]); next++) own.push(lines[next]);
  return own.join(" ").replace(/\s+/g, " ").trim();
}
