import type { Interface } from "node:readline/promises";

export class SetupAborted extends Error {
  constructor() {
    super("Setup cancelled. Nothing was saved.");
  }
}

const ETX = 3;
const CTRL_U = 21;
const ESC = 27;
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
    const restore = () => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      for (const listener of borrowed) stdin.on("data", listener);
      stdout.write("\n");
    };

    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        const code = char.codePointAt(0) ?? 0;
        if (code === ETX) return (restore(), reject(new SetupAborted()));
        if (char === "\n" || char === "\r") return (restore(), resolve(value));
        if (code === ESC) return;
        if (BACKSPACE.includes(code)) value = value.slice(0, -1);
        else if (code === CTRL_U) value = "";
        else if (code >= 32) value += char;
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
