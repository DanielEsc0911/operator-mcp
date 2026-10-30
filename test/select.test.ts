import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { useLang } from "../src/i18n/index.js";
import { SetupAborted } from "../src/prompts.js";
import { multiSelect, select } from "../src/select.js";
import { displayWidth, style } from "../src/ui.js";

const UP = "\x1b[A";
const DOWN = "\x1b[B";

function terminal(columns = 80, rows = 24) {
  const stdin = new PassThrough() as any;
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = vi.fn((value: boolean) => ((stdin.isRaw = value), stdin));
  let text = "";
  const out = { isTTY: true, columns, rows, write: (chunk: string) => ((text += chunk), true) } as any;
  const press = (...keys: string[]) => keys.forEach((key) => stdin.write(key));
  return { stdin, out, s: style(out, {}), press, text: () => text };
}

const plain = (text: string) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const AGENTS = ["Claude Code", "Codex CLI", "Cursor"].map((label) => ({ label }));

describe("select", () => {
  it("moves with arrows and j/k and returns the row under the cursor", async () => {
    const { stdin, out, s, press } = terminal();
    const answer = select(stdin, out, s, "Project", [{ label: "Acme", hint: "acme" }, { label: "Billing" }, { label: "None" }]);
    press(DOWN, DOWN, DOWN, UP, "k", "j", "\r");
    expect(await answer).toBe(2);
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
  });

  it("restores the terminal and aborts on ctrl-c", async () => {
    const { stdin, out, s, press, text } = terminal();
    const answer = select(stdin, out, s, "Project", AGENTS);
    press("\x03");
    await expect(answer).rejects.toBeInstanceOf(SetupAborted);
    expect(stdin.isRaw).toBe(false);
    expect(text()).toContain("\x1b[?25h");
  });

  it("hands the keyboard back to listeners it borrowed", async () => {
    const { stdin, out, s, press } = terminal();
    const before = vi.fn();
    stdin.on("keypress", before);
    const answer = select(stdin, out, s, "Project", AGENTS);
    press("\r");
    await answer;
    expect(before).not.toHaveBeenCalled();
    press("x");
    expect(before).toHaveBeenCalled();
  });
});

describe("multiSelect", () => {
  it("starts with everything marked and Enter confirms", async () => {
    const { stdin, out, s, press, text } = terminal();
    const answer = multiSelect(stdin, out, s, "Agents", AGENTS);
    press("\r");
    expect(await answer).toEqual([0, 1, 2]);
    expect(plain(text())).toContain("[x] Claude Code");
    expect(plain(text())).toContain("Confirm");
  });

  it("toggles with Space, clears with n, fills with a, and confirms from the Confirm row", async () => {
    const { stdin, out, s, press } = terminal();
    const answer = multiSelect(stdin, out, s, "Agents", AGENTS);
    press("n", DOWN, " ", DOWN, DOWN, " ");
    expect(await answer).toEqual([1]);
    const again = terminal();
    const all = multiSelect(again.stdin, again.out, again.s, "Agents", AGENTS);
    again.press("n", "a", "\r");
    expect(await all).toEqual([0, 1, 2]);
  });

  it("windows a long list and never draws a line wider than the terminal", async () => {
    const { stdin, out, s, press, text } = terminal(30, 8);
    const many = Array.from({ length: 14 }, (_, index) => ({ label: `Agent number ${index + 1} with a long name` }));
    const answer = multiSelect(stdin, out, s, "Which agents should OPerator patch into?", many);
    press(...Array(12).fill(DOWN), "\r");
    await answer;
    const lines = plain(text()).split(/\n|\r/);
    expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(29);
    expect(plain(text())).toContain("Agent number 13");
    expect(plain(text())).not.toContain("Agent number 13 with a long name");
  });

  it("speaks Spanish when asked", async () => {
    useLang("es");
    const { stdin, out, s, press, text } = terminal();
    const answer = multiSelect(stdin, out, s, "Agentes", AGENTS);
    press("\r");
    await answer;
    useLang("en");
    expect(plain(text())).toContain("Confirmar");
    expect(plain(text())).toContain("Espacio marcar");
  });
});
