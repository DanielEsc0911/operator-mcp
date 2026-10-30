import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createInterface } from "node:readline/promises";
import { SetupAborted, ask, choose, confirmList, readHidden } from "../src/prompts.js";
import { style } from "../src/ui.js";

function fakeTty() {
  const stdin = new PassThrough() as any;
  stdin.isTTY = true;
  stdin.isRaw = false;
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

  it("rejects with SetupAborted on ctrl-c after restoring the terminal", async () => {
    const { stdin, stdout } = fakeTty();
    const answer = readHidden("Key: ", stdin, stdout);
    stdin.write("\u0003");
    await expect(answer).rejects.toBeInstanceOf(SetupAborted);
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
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
