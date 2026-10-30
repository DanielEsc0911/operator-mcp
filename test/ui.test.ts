import { describe, expect, it } from "vitest";
import { findClient } from "../src/clients.js";
import { listed, outro } from "../src/outro.js";
import { card, greet, lamp, markLines, step, style, tilde } from "../src/ui.js";

function sink(isTTY: boolean) {
  let text = "";
  return { out: { isTTY, columns: 80, write: (chunk: string) => ((text += chunk), true) } as any, text: () => text };
}

describe("style", () => {
  it("paints only on a TTY without NO_COLOR or TERM=dumb", () => {
    expect(style(sink(true).out, {}).fancy).toBe(true);
    expect(style(sink(true).out, { NO_COLOR: "1" }).fancy).toBe(false);
    expect(style(sink(true).out, { TERM: "dumb" }).fancy).toBe(false);
    expect(style(sink(false).out, {}).fancy).toBe(false);
  });
});

describe("plain output", () => {
  it("writes no escape byte for the greeting, steps, spinner and card", async () => {
    const { out, text } = sink(false);
    const s = style(out, {});
    greet(out, s, "setup", [["Profile", "default"]]);
    step(out, s, "Saved", "done", "~/.config");
    expect(await lamp(out, s, "Line check", "op.example.com", Promise.resolve(7))).toBe(7);
    outro(out, s, [findClient("cursor")!], true);
    expect(text()).not.toContain("\x1b");
    expect(text()).toContain("  Saved        done   ~/.config");
    expect(text()).toContain("Restart Cursor, then ask:");
    expect(text()).toContain("#1284  Bug   In progress  Fix login redirect loop");
  });

  it("draws a card whose rows are all the same width", () => {
    const { out, text } = sink(false);
    card(out, style(out, {}), ["short", "a much longer line"]);
    const widths = new Set(text().trimEnd().split("\n").map((line) => [...line].length));
    expect(widths.size).toBe(1);
  });
});

describe("helpers", () => {
  it("renders the 16-row mark as 8 text rows", () => {
    expect(markLines()).toHaveLength(8);
  });

  it("shortens paths under home", () => {
    expect(tilde("/home/ada/.cursor/mcp.json", "/home/ada")).toBe("~/.cursor/mcp.json");
    expect(tilde("/etc/x", "/home/ada")).toBe("/etc/x");
  });

  it("lists names the way a person would", () => {
    expect(listed(["Cursor"])).toBe("Cursor");
    expect(listed(["A", "B", "C"])).toBe("A, B and C");
  });
});
