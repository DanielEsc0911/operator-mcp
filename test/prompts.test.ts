import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createInterface } from "node:readline/promises";
import { SetupAborted, ask, askHidden, choose, confirmList, interruptible, readHidden } from "../src/prompts.js";
import { style } from "../src/ui.js";

function fakeTty() {
  const stdin = new PassThrough() as any;
  stdin.isTTY = true;
  stdin.isRaw = false;
  vi.spyOn(stdin, "pause");
  stdin.setRawMode = vi.fn((value: boolean) => ((stdin.isRaw = value), stdin));
  const written: string[] = [];
  const stdout = { write: (chunk: string) => (written.push(chunk), true) } as any;
  return { stdin, stdout, written };
}

describe("readHidden", () => {
  it("returns the typed value without echoing it and restores the terminal", async () => {
    const { stdin, stdout, written } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("abc123\n");
    expect(await answer).toBe("abc123");
    expect(written.join("")).not.toContain("abc123");
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
  });

  it("decodes multi-byte characters as characters", async () => {
    const { stdin, stdout } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("clé-ñ\r");
    expect(await answer).toBe("clé-ñ");
  });

  it("applies backspace and ctrl-u", async () => {
    const { stdin, stdout } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("abcd\u007f");
    stdin.write("\u0015zz\n");
    expect(await answer).toBe("zz");
  });

  it("drops an arrow-key escape sequence", async () => {
    const { stdin, stdout } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("ab");
    stdin.write("\u001b[D");
    stdin.write("c\n");
    expect(await answer).toBe("abc");
  });

  it("keeps a key pasted in bracketed-paste mode", async () => {
    const { stdin, stdout } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("\u001b[200~secret-key\u001b[201~\n");
    expect(await answer).toBe("secret-key");
  });

  it("ignores a lone ESC before the newline", async () => {
    const { stdin, stdout } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("ab\u001b\n");
    expect(await answer).toBe("ab");
  });

  it("drops an escape sequence split across chunks", async () => {
    const { stdin, stdout } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("ab\u001b[20");
    stdin.write("0~cd\u001b");
    stdin.write("[Ae\n");
    expect(await answer).toBe("abcde");
  });

  it("drops SS3 and Alt+key sequences", async () => {
    const { stdin, stdout } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("a\u001bOPb\u001bxc\n");
    expect(await answer).toBe("abc");
  });

  it("rejects with SetupAborted on ctrl-c after restoring the terminal", async () => {
    const { stdin, stdout } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("\u0003");
    await expect(answer).rejects.toBeInstanceOf(SetupAborted);
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
  });
});

describe("under a live terminal readline", () => {
  function terminal() {
    const { stdin, stdout, written } = fakeTty();
    const rl = createInterface({ input: stdin, output: new PassThrough(), terminal: true });
    return { stdin, stdout, rl, written };
  }

  it("answers the next ask after a hidden read", async () => {
    const { stdin, stdout, rl } = terminal();
    const key = askHidden(rl, "Key: ", stdin, stdout);
    stdin.write("secret\n");
    expect(await key).toBe("secret");
    const next = ask(rl, "Next: ");
    stdin.write("hello\n");
    expect(await Promise.race([next, new Promise((r) => setTimeout(() => r("hung"), 500))])).toBe("hello");
    rl.close();
  });

  it("still sees ctrl-c in interruptible after a hidden read", async () => {
    const { stdin, stdout, rl } = terminal();
    const key = askHidden(rl, "Key: ", stdin, stdout);
    stdin.write("secret\n");
    await key;
    const pending = interruptible(rl, new Promise(() => {}));
    stdin.write("\x03");
    await expect(pending).rejects.toBeInstanceOf(SetupAborted);
    rl.close();
  });
});

describe("ask", () => {
  it("trims the answer", async () => {
    const input = new PassThrough();
    const rl = createInterface({ input, output: new PassThrough() });
    const answer = ask(rl, "URL: ");
    input.write("  https://op.example.com  \n");
    expect(await answer).toBe("https://op.example.com");
    rl.close();
  });

  it("turns ctrl-c into SetupAborted", async () => {
    const rl = createInterface({ input: new PassThrough(), output: new PassThrough() });
    const answer = ask(rl, "URL: ");
    rl.emit("SIGINT");
    await expect(answer).rejects.toBeInstanceOf(SetupAborted);
    rl.close();
  });
});

function scripted(...answers: string[]) {
  const input = new PassThrough();
  let shown = "";
  const output = new PassThrough();
  const rl = createInterface({ input, output });
  output.on("data", (chunk: Buffer) => {
    shown += chunk;
    if (String(chunk).endsWith("› ") && answers.length) setImmediate(() => input.write(`${answers.shift()}\n`));
  });
  return { rl, out: output as any, s: style(output as any, {}), shown: () => shown };
}

describe("choose", () => {
  const options: [string, string][] = [["Acme Platform", "acme"], ["Billing", "billing"]];

  it("numbers the options and returns the picked value", async () => {
    const { rl, out, s, shown } = scripted("2");
    expect(await choose(rl, out, s, "Pick", options)).toBe("billing");
    expect(shown()).toMatch(/1\s+Acme Platform/);
    rl.close();
  });

  it("returns an empty string for Enter or 0", async () => {
    const first = scripted("");
    expect(await choose(first.rl, first.out, first.s, "Pick", options)).toBe("");
    const second = scripted("0");
    expect(await choose(second.rl, second.out, second.s, "Pick", options)).toBe("");
  });

  it("asks again when a number is out of range", async () => {
    const { rl, out, s, shown } = scripted("7", "2");
    expect(await choose(rl, out, s, "Pick", options)).toBe("billing");
    expect(shown()).toContain("Pick a number from 1 to 2");
    rl.close();
  });

  it("asks again for numeric input that is not an in-range integer", async () => {
    const { rl, out, s } = scripted("-1", "1.5", "9", "1");
    expect(await choose(rl, out, s, "Pick", options)).toBe("acme");
    rl.close();
  });

  it("takes any other text as a free identifier", async () => {
    const { rl, out, s } = scripted("ops-team");
    expect(await choose(rl, out, s, "Pick", options)).toBe("ops-team");
  });
});

describe("confirmList", () => {
  const items = ["Claude Code", "Codex CLI", "Cursor"];

  it("pre-selects everything and Enter accepts", async () => {
    const { rl, out, s, shown } = scripted("");
    expect(await confirmList(rl, out, s, "Agents", items)).toEqual([0, 1, 2]);
    expect(shown()).toContain("[x] 1  Claude Code");
  });

  it("returns indexes in numeric order, not text order", async () => {
    const many = Array.from({ length: 12 }, (_, index) => `Agent ${index + 1}`);
    const { rl, out, s } = scripted("");
    expect(await confirmList(rl, out, s, "Agents", many)).toEqual([...many.keys()]);
    rl.close();
  });

  it("toggles the numbers typed, then accepts on Enter", async () => {
    const { rl, out, s, shown } = scripted("2 3", "3", "");
    expect(await confirmList(rl, out, s, "Agents", items)).toEqual([0, 2]);
    expect(shown()).toContain("[ ] 2  Codex CLI");
  });

  it("understands none and all", async () => {
    const none = scripted("none", "");
    expect(await confirmList(none.rl, none.out, none.s, "Agents", items)).toEqual([]);
    const all = scripted("none", "all", "");
    expect(await confirmList(all.rl, all.out, all.s, "Agents", items)).toEqual([0, 1, 2]);
  });
});

describe("interruptible", () => {
  it("rejects with SetupAborted when ctrl-c arrives during the work, and removes its listener", async () => {
    const rl = createInterface({ input: new PassThrough(), output: new PassThrough() });
    const pending = interruptible(rl, new Promise(() => {}));
    rl.emit("SIGINT");
    await expect(pending).rejects.toBeInstanceOf(SetupAborted);
    expect(rl.listenerCount("SIGINT")).toBe(0);
    rl.close();
  });

  it("returns the work's result otherwise", async () => {
    const rl = createInterface({ input: new PassThrough(), output: new PassThrough() });
    expect(await interruptible(rl, Promise.resolve(5))).toBe(5);
    rl.close();
  });
});
