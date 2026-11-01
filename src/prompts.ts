import type { Interface } from "node:readline/promises";
import { t } from "./i18n/index.js";
import { pad, type Output, type Style } from "./ui.js";

export class SetupAborted extends Error {
  constructor() {
    super(t().aborted);
  }
}

const ETX = 3;
const CTRL_U = 21;
const ESCAPE_SEQUENCE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|O[@-~]|[^[O\r\n])/g;
const INCOMPLETE_ESCAPE = /\x1b(?:\[[0-?]*[ -/]*|O)?$/;
const BACKSPACE = [8, 127];

type RawInput = NodeJS.ReadStream & { isRaw?: boolean };

export async function ask(rl: Interface, question: string): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  rl.once("SIGINT", abort);
  try {
    return (await rl.question(question, { signal: controller.signal })).trim();
  } catch (error) {
    throw controller.signal.aborted ? new SetupAborted() : error;
  } finally {
    rl.off("SIGINT", abort);
  }
}

// readline offers no masked input: it renders every keystroke through an
// internal refresh path that cannot be muted, so the key is read straight from
// a raw stdin with the interface's own listeners detached for the duration.
export function readHidden(question: string, stdin: RawInput, stdout: NodeJS.WritableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const borrowed = stdin.listeners("data") as ((chunk: Buffer) => void)[];
    const wasRaw = stdin.isRaw === true;
    stdin.removeAllListeners("data");
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();

    let value = "";
    let pending = "";
    const restore = () => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      for (const listener of borrowed) stdin.on("data", listener);
      stdout.write("\n");
    };

    const onData = (chunk: Buffer) => {
      const text = pending + chunk.toString("utf8");
      pending = INCOMPLETE_ESCAPE.exec(text)?.[0] ?? "";
      for (const char of text.slice(0, text.length - pending.length).replace(ESCAPE_SEQUENCE, "")) {
        const code = char.codePointAt(0) ?? 0;
        if (code === ETX) return (restore(), reject(new SetupAborted()));
        if (char === "\n" || char === "\r") return (restore(), resolve(value));
        if (BACKSPACE.includes(code)) {
          if (value) stdout.write("\b \b");
          value = [...value].slice(0, -1).join("");
        } else if (code === CTRL_U) {
          stdout.write("\b \b".repeat([...value].length));
          value = "";
        } else if (code >= 32) {
          value += char;
          stdout.write("•");
        }
      }
    };

    stdin.on("data", onData);
  });
}

export async function askHidden(
  rl: Interface,
  question: string,
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WritableStream,
): Promise<string> {
  if (!stdin.isTTY) return ask(rl, question);
  return (await readHidden(question, stdin, stdout)).trim();
}

const PROMPT = "  › ";

export async function choose(
  rl: Interface,
  out: Output,
  s: Style,
  question: string,
  options: [label: string, value: string][],
): Promise<string> {
  out.write(`  ${s.bold(question)}\n`);
  const width = Math.max(...options.map(([label]) => [...label].length));
  options.forEach(([label, value], index) => out.write(`    ${s.accent(String(index + 1))}  ${pad(label, width)}  ${s.muted(value)}\n`));
  out.write(`    ${s.accent("0")}  ${s.muted(t().noneOption)}\n`);
  for (;;) {
    const answer = await ask(rl, PROMPT);
    if (answer === "" || answer === "0") return "";
    if (!/^[-+]?[\d.]+$/.test(answer)) return answer;
    const picked = /^\d+$/.test(answer) ? options[Number(answer) - 1] : undefined;
    if (picked) return picked[1];
    out.write(`  ${s.muted(t().outOfRange(options.length))}\n`);
  }
}

export function interruptible<T>(rl: Interface, work: Promise<T>): Promise<T> {
  let interrupt: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    interrupt = () => reject(new SetupAborted());
    rl.once("SIGINT", interrupt);
  });
  return Promise.race([work, interrupted]).finally(() => rl.off("SIGINT", interrupt));
}

export async function confirmList(rl: Interface, out: Output, s: Style, question: string, items: string[]): Promise<number[]> {
  const chosen = new Set(items.keys());
  out.write(`  ${s.bold(question)}\n  ${s.muted(t().typedHint)}\n`);
  for (;;) {
    items.forEach((item, index) =>
      out.write(`    ${chosen.has(index) ? s.patch("[x]") : s.muted("[ ]")} ${index + 1}  ${item}\n`),
    );
    const answer = (await ask(rl, PROMPT)).toLowerCase();
    if (answer === "") return [...chosen].sort((a, b) => a - b);
    if (t().typedNone.test(answer)) chosen.clear();
    if (t().typedAll.test(answer)) items.forEach((_, index) => chosen.add(index));
    for (const token of answer.split(/[\s,]+/)) {
      const index = Number(token) - 1;
      if (!(index in items)) continue;
      if (chosen.has(index)) chosen.delete(index);
      else chosen.add(index);
    }
  }
}
