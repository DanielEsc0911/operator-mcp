import { emitKeypressEvents } from "node:readline";
import { t } from "./i18n/index.js";
import { SetupAborted } from "./prompts.js";
import { displayWidth, fit, pad, type Output, type Style } from "./ui.js";

type Input = NodeJS.ReadStream & { isRaw?: boolean };
type Key = { name?: string; ctrl?: boolean };
type Listener = (text: string, key: Key) => void;
export type Option = { label: string; hint?: string };

type Menu = { question: string; options: Option[]; marked?: Set<number> };

export const canSelect = ({ stdin, stdout }: { stdin: Input; stdout: Output }) => stdin.isTTY && stdout.isTTY === true;

function visibleRange(cursor: number, total: number, out: Output): [number, number] {
  const room = Math.max(3, (out.rows || 24) - 4);
  const start = Math.min(Math.max(0, cursor - Math.floor(room / 2)), Math.max(0, total - room));
  return [start, Math.min(total, start + room)];
}

function frame({ question, options, marked }: Menu, cursor: number, out: Output, s: Style): string[] {
  const rows: Option[] = marked ? [...options, { label: s.bold(t().confirm) }] : options;
  const width = Math.max(...options.map(({ label }) => displayWidth(label)));
  const [start, end] = visibleRange(cursor, rows.length, out);
  const lines = [`  ${s.bold(question)}`];
  for (let index = start; index < end; index++) {
    const { label, hint } = rows[index];
    const pointer = index === cursor ? s.accent("›") : " ";
    const box = marked && index < options.length ? `${marked.has(index) ? s.patch("[x]") : s.muted("[ ]")} ` : "";
    lines.push(`  ${pointer} ${box}${hint ? `${pad(label, width)}  ${s.muted(hint)}` : label}`);
  }
  const range = end - start < rows.length ? [`${start + 1}–${end}/${rows.length}`] : [];
  lines.push(`    ${s.muted(hint([...(marked ? t().multiHint : t().selectHint).split(" · "), ...range], out))}`);
  return lines.map((line) => fit(line, out));
}

function hint(parts: string[], out: Output): string {
  const room = (out.columns || 80) - 5;
  while (parts.length > 2 && displayWidth(parts.join(" · ")) > room) parts.shift();
  return parts.join(" · ");
}

function listen<T>(input: Input, out: Output, draw: () => string[], onKey: (key: Key, text: string) => T | undefined): Promise<T> {
  return new Promise((resolve, reject) => {
    emitKeypressEvents(input);
    const borrowed = input.listeners("keypress") as Listener[];
    const wasRaw = input.isRaw === true;
    input.removeAllListeners("keypress");
    input.setRawMode(true);
    input.resume();

    let height = 0;
    const paint = () => {
      const lines = draw();
      const up = height > 1 ? `\x1b[${height - 1}A` : "";
      out.write(`${height ? `\r${up}\x1b[J` : "\x1b[?25l"}${lines.join("\n")}`);
      height = lines.length;
    };
    const finish = (settle: () => void) => {
      input.off("keypress", onKeypress);
      input.setRawMode(wasRaw);
      for (const listener of borrowed) input.on("keypress", listener);
      out.write(`\r${height > 1 ? `\x1b[${height - 1}A` : ""}\x1b[J\x1b[?25h`);
      settle();
    };
    const onKeypress: Listener = (text, key = {}) => {
      if (key.ctrl && key.name === "c") return finish(() => reject(new SetupAborted()));
      const result = onKey(key, text);
      if (result === undefined) return paint();
      finish(() => resolve(result));
    };
    input.on("keypress", onKeypress);
    paint();
  });
}

function move(cursor: number, key: Key, total: number): number {
  if (key.name === "up" || key.name === "k") return (cursor - 1 + total) % total;
  if (key.name === "down" || key.name === "j") return (cursor + 1) % total;
  return cursor;
}

function summary(out: Output, s: Style, question: string, answer: string): void {
  out.write(`  ${s.bold(question)}  ${s.accent(answer)}\n`);
}

export async function select(input: Input, out: Output, s: Style, question: string, options: Option[]): Promise<number> {
  let cursor = 0;
  const menu = { question, options };
  const chosen = await listen(input, out, () => frame(menu, cursor, out, s), (key) => {
    if (key.name === "return" || key.name === "enter") return cursor;
    cursor = move(cursor, key, options.length);
  });
  summary(out, s, question, options[chosen].label);
  return chosen;
}

export async function multiSelect(input: Input, out: Output, s: Style, question: string, options: Option[]): Promise<number[]> {
  let cursor = 0;
  const marked = new Set(options.keys());
  const menu = { question, options, marked };
  const confirmed = () => [...marked].sort((a, b) => a - b);
  const chosen = await listen(input, out, () => frame(menu, cursor, out, s), (key) => {
    if (key.name === "return" || key.name === "enter") return confirmed();
    if (key.name === "space" && cursor === options.length) return confirmed();
    if (key.name === "space") marked[marked.has(cursor) ? "delete" : "add"](cursor);
    if (key.name === "a") options.forEach((_, index) => marked.add(index));
    if (key.name === "n") marked.clear();
    cursor = move(cursor, key, options.length + 1);
  });
  summary(out, s, question, chosen.map((index) => options[index].label).join(", ") || "—");
  return chosen;
}
