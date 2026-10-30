import { homedir, tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { configHome } from "../src/config.js";

describe("test isolation", () => {
  it("points every home a test can reach at a fresh temp dir", () => {
    expect(homedir().startsWith(tmpdir())).toBe(true);
    expect(configHome().startsWith(homedir())).toBe(true);
    for (const name of ["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "APPDATA"]) expect(process.env[name]!.startsWith(homedir())).toBe(true);
  });
});
