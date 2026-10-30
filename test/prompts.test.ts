import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { SetupAborted, readHidden } from "../src/prompts.js";

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
