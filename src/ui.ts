import { OP_CELLS } from "./brandCells.js";

export type Output = NodeJS.WritableStream & { isTTY?: boolean; columns?: number };
type Paint = (text: string) => string;
export type Style = { fancy: boolean; bold: Paint; accent: Paint; patch: Paint; muted: Paint; alarm: Paint };

const LABEL_WIDTH = 12;
const STATUS_WIDTH = 5;

const SLOT = { accent: 172, patch: 30, muted: 243, alarm: 167 };

export function style(out: Output, env: NodeJS.ProcessEnv = process.env): Style {
  const fancy = out.isTTY === true && !env.NO_COLOR && env.TERM !== "dumb";
  const paint = (open: string): Paint => (text) => (fancy ? `\x1b[${open}m${text}\x1b[0m` : text);
  return {
    fancy,
    bold: paint("1"),
    accent: paint(`38;5;${SLOT.accent}`),
    patch: paint(`38;5;${SLOT.patch}`),
    muted: paint(`38;5;${SLOT.muted}`),
    alarm: paint(`38;5;${SLOT.alarm}`),
  };
}

const pad = (text: string, width: number) => text + " ".repeat(Math.max(0, width - [...text].length));

function cellColour(role: string | undefined): string {
  if (role === "a") return `38;5;${SLOT.accent}`;
  if (role === "t") return `38;5;${SLOT.patch}`;
  return role === "b" ? "39" : "";
}

export function markLines(cells: string[] = OP_CELLS): string[] {
  const lines: string[] = [];
  for (let row = 0; row < cells.length; row += 2) {
    let line = "";
    for (let column = 0; column < 16; column++) {
      const top = cellColour(cells[row][column]);
      const bottom = cellColour(cells[row + 1]?.[column]);
      const background = (colour: string) => `4${colour.slice(1)}`;
      if (!top && !bottom) line += " ";
      else if (!bottom) line += `\x1b[${top}m▀\x1b[0m`;
      else if (!top) line += `\x1b[${bottom}m▄\x1b[0m`;
      else if (top === bottom) line += `\x1b[${top}m█\x1b[0m`;
      else if (top === "39") line += `\x1b[${top};${background(bottom)}m▀\x1b[0m`;
      else line += `\x1b[${bottom};${background(top)}m▄\x1b[0m`;
    }
    lines.push(line);
  }
  return lines;
}

export function greet(out: Output, s: Style, title: string, facts: [string, string][]): void {
  const lines = [
    `${s.bold(s.accent("OPerator"))}  ${s.muted(title)}`,
    s.muted("─".repeat(21)),
    ...facts.map(([label, value]) => `${s.bold(s.accent(pad(label, 11)))}${value}`),
  ];
  const withMark = s.fancy && (out.columns ?? 80) >= 60;
  const marked = markLines().map((mark, row) => `${mark}    ${lines[row - 1] ?? ""}`).filter((row) => row.trim());
  const rows = withMark ? marked : lines;
  out.write(`\n${rows.map((row) => `  ${row}`.trimEnd()).join("\n")}\n\n`);
}

export function step(out: Output, s: Style, label: string, status: string, detail: string): void {
  const shown = status === "fail" ? s.alarm(pad(status, STATUS_WIDTH)) : s.patch(pad(status, STATUS_WIDTH));
  out.write(`${s.fancy ? "\r\x1b[K" : ""}  ${s.bold(pad(label, LABEL_WIDTH))} ${shown}  ${detail}\n`);
}

function lamps(s: Style, frame: number): string {
  return [0, 1, 2].map((lamp) => (lamp === frame % 3 ? s.accent("●") : s.muted("○"))).join(" ");
}

export async function lamp<T>(out: Output, s: Style, label: string, detail: string, work: Promise<T>): Promise<T> {
  if (!s.fancy) return work;
  let frame = 0;
  const draw = () => out.write(`\r  ${s.bold(pad(label, LABEL_WIDTH))} ${lamps(s, frame++)}  ${detail}\x1b[K`);
  out.write("\x1b[?25l");
  draw();
  const timer = setInterval(draw, 120);
  try {
    return await work;
  } finally {
    clearInterval(timer);
    out.write("\r\x1b[K\x1b[?25h");
  }
}

export function checkLine(out: Output, s: Style, ok: boolean, line: string, next?: string): void {
  out.write(`  ${ok ? s.patch("✓") : s.alarm("✗")} ${line}\n`);
  if (next) out.write(`    ${s.muted("→")} ${next}\n`);
}

const visible = (text: string) => [...text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")].length;

export function card(out: Output, s: Style, lines: string[]): void {
  const width = Math.max(...lines.map(visible)) + 4;
  const edge = (left: string, right: string) => `  ${s.muted(`${left}${"─".repeat(width)}${right}`)}\n`;
  out.write(edge("╭", "╮"));
  for (const line of ["", ...lines, ""]) {
    out.write(`  ${s.muted("│")}  ${line}${" ".repeat(width - 2 - visible(line))}${s.muted("│")}\n`);
  }
  out.write(edge("╰", "╯"));
}

export function tilde(path: string, home: string): string {
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
