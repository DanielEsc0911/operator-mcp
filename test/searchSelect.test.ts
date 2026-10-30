import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { useLang } from "../src/i18n/index.js";
import { SetupAborted } from "../src/prompts.js";
import { searchSelect, type Page } from "../src/searchSelect.js";
import { displayWidth, style } from "../src/ui.js";

const UP = "\x1b[A";
const DOWN = "\x1b[B";
const ESC = "\x1b";
const BACKSPACE = "\x7f";

function terminal(columns = 80) {
  const stdin = new PassThrough() as any;
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = vi.fn((value: boolean) => ((stdin.isRaw = value), stdin));
  let text = "";
  const out = { isTTY: true, columns, rows: 24, write: (chunk: string) => ((text += chunk), true) } as any;
  const press = (...keys: string[]) => keys.forEach((key) => stdin.write(key));
  return { stdin, out, s: style(out, {}), press, text: () => text };
}

const plain = (text: string) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));
const row = (label: string) => ({ label, hint: label.toLowerCase() });
const FIRST: Page = { total: 23, rows: ["Acme", "Billing", "Mobile"].map(row) };

function picker(search = vi.fn(async (query: string): Promise<Page> => ({ total: 1, rows: [row(`Found ${query}`)] })), columns = 80) {
  const term = terminal(columns);
  const answer = searchSelect(term.stdin, term.out, term.s, "Default project", "None", search, FIRST);
  return { ...term, answer, search };
}

describe("searchSelect", () => {
  it("opens on None, lists the first page and says how many more exist", async () => {
    const { press, answer, text } = picker();
    press("\r");
    expect(await answer).toBeUndefined();
    const screen = plain(text());
    expect(screen).toContain("› None");
    expect(screen).toContain("Billing  billing");
    expect(screen).toContain("type to search");
    expect(screen).toContain("3/23 · ↑↓ move");
    expect(screen).toContain("Default project  None");
  });

  it("moves with the arrows and returns the row under the cursor", async () => {
    const { press, answer } = picker();
    press(DOWN, DOWN, DOWN, UP, "\r");
    expect(await answer).toEqual(row("Billing"));
  });

  it("searches once per pause in typing, shows that it is looking, then picks a result", async () => {
    const { press, answer, search, text } = picker();
    press("a", "c", "m");
    await new Promise((resolve) => setImmediate(resolve));
    expect(plain(text())).toContain("searching…");
    await settle();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("acm");
    press(DOWN, "\r");
    expect(await answer).toEqual(row("Found acm"));
  });

  it("says when nothing matches", async () => {
    const { press, answer, text } = picker(vi.fn(async () => ({ total: 0, rows: [] })));
    press("z", "z");
    await settle();
    expect(plain(text())).toContain("no matches");
    press("\r");
    expect(await answer).toBeUndefined();
  });

  it("backspace to an empty query goes back to the first page without asking the server", async () => {
    const { press, answer, search } = picker();
    press("x", BACKSPACE);
    await settle();
    expect(search).not.toHaveBeenCalled();
    press(DOWN, "\r");
    expect(await answer).toEqual(row("Acme"));
  });

  it("Esc clears the query", async () => {
    const { press, answer, text } = picker();
    press("y", "z", ESC);
    await new Promise((resolve) => setTimeout(resolve, 700));
    press(DOWN, "\r");
    expect(await answer).toEqual(row("Acme"));
    const screen = plain(text());
    expect(screen.slice(screen.lastIndexOf("yz▏"))).toContain("type a name or identifier");
  });

  it("restores the terminal and aborts on ctrl-c", async () => {
    const { stdin, press, answer, text } = picker();
    press("a", "\x03");
    await expect(answer).rejects.toBeInstanceOf(SetupAborted);
    expect(stdin.isRaw).toBe(false);
    expect(text()).toContain("\x1b[?25h");
  });

  it("never draws a line wider than a narrow terminal", async () => {
    const { press, answer, text } = picker(undefined, 30);
    press("\r");
    await answer;
    const frames = plain(text().slice(0, text().lastIndexOf("\x1b[?25h")));
    expect(Math.max(...frames.split(/\n|\r/).map(displayWidth))).toBeLessThanOrEqual(29);
  });

  it("keeps \"type to search\" in a 40-column Spanish hint", async () => {
    useLang("es");
    const { press, answer, text } = picker(undefined, 40);
    press("\r");
    await answer;
    useLang("en");
    expect(plain(text())).toContain("escribe para buscar · Enter elegir");
  });

  it("speaks Spanish when asked", async () => {
    useLang("es");
    const { press, answer, text } = picker();
    press("\r");
    await answer;
    useLang("en");
    expect(plain(text())).toContain("escribe para buscar · Enter elegir");
  });
});
