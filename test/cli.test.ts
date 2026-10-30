import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runCli, type Streams } from "../src/cli.js";

const setup = vi.hoisted(() => vi.fn(async () => 0));
const doctor = vi.hoisted(() => vi.fn(async () => 0));
const install = vi.hoisted(() => vi.fn(async () => 0));
const serve = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../src/setup.js", () => ({ runSetup: setup }));
vi.mock("../src/doctor.js", () => ({ runDoctor: doctor }));
vi.mock("../src/install.js", () => ({ runInstall: install }));
vi.mock("../src/serve.js", () => ({ serve }));

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

let out = "";
let err = "";
let streams: Streams;

beforeEach(() => {
  out = "";
  err = "";
  vi.clearAllMocks();
  streams = {
    stdin: process.stdin,
    stdout: { write: (chunk: string) => ((out += chunk), true) } as any,
    stderr: { write: (chunk: string) => ((err += chunk), true) } as any,
  };
});

describe("runCli", () => {
  it("prints the version for --version and -v", async () => {
    expect(await runCli(["--version"], streams)).toBe(0);
    expect(await runCli(["-v"], streams)).toBe(0);
    expect(out).toBe(`${version}\n${version}\n`);
  });

  it("prints usage naming every command for --help", async () => {
    expect(await runCli(["--help"], streams)).toBe(0);
    for (const command of ["setup", "install", "doctor", "--non-interactive"]) expect(out).toContain(command);
  });

  it("routes setup, install and doctor by the first positional", async () => {
    await runCli(["setup", "--profile", "acme"], streams);
    await runCli(["--profile", "acme", "doctor"], streams);
    await runCli(["install"], streams);
    expect(setup).toHaveBeenCalledWith(["setup", "--profile", "acme"], streams);
    expect(doctor).toHaveBeenCalledOnce();
    expect(install).toHaveBeenCalledOnce();
  });

  it("starts the server when a profile is merely named setup", async () => {
    expect(await runCli(["--profile", "setup"], streams)).toBeNull();
    expect(setup).not.toHaveBeenCalled();
    expect(serve).toHaveBeenCalledWith(["--profile", "setup"]);
  });

  it("rejects an unknown command with a pointer to --help", async () => {
    expect(await runCli(["frobnicate"], streams)).toBe(2);
    expect(err).toContain("--help");
    expect(serve).not.toHaveBeenCalled();
  });

  it("turns a thrown error into one stderr line and exit 1", async () => {
    doctor.mockRejectedValueOnce(new Error("boom"));
    expect(await runCli(["doctor"], streams)).toBe(1);
    expect(err).toBe("operator-mcp: boom\n");
  });

  it("refuses to run on a Node older than 22", async () => {
    expect(await runCli(["doctor"], streams, "20.11.0")).toBe(1);
    expect(err).toContain("Node 22");
    expect(doctor).not.toHaveBeenCalled();
  });
});
