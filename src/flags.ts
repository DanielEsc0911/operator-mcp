const VALUE_FLAGS = ["--profile", "--url", "--lang"];
const SWITCHES = ["--read-only", "--yes", "--non-interactive", "--help", "-h", "--version", "-v"];

const COMMON = ["--lang", "--help", "-h", "--version", "-v"];
const COMMAND_FLAGS: Record<string, string[]> = {
  serve: ["--profile"],
  setup: ["--profile", "--url", "--read-only", "--yes", "--non-interactive"],
  install: ["--profile", "--yes"],
  doctor: ["--profile"],
};

const nameOf = (arg: string) => arg.split("=")[0];

export function flagValue(argv: string[], flag: string): string | undefined {
  for (const [index, arg] of argv.entries()) {
    if (arg === flag) return argv[index + 1];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

const optionsEnd = (argv: string[]) => (argv.includes("--") ? argv.indexOf("--") : argv.length);

export function firstPositional(argv: string[]): string | undefined {
  const end = optionsEnd(argv);
  return argv.slice(0, end).find((arg, index) => !arg.startsWith("-") && !VALUE_FLAGS.includes(argv[index - 1])) ?? argv[end + 1];
}

export function hasFlag(argv: string[], ...names: string[]): boolean {
  return argv.slice(0, optionsEnd(argv)).some((arg) => names.includes(arg));
}

function distance(a: string, b: string): number {
  let row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

export type FlagProblem = { flag: string; near?: string; missingValue?: true };

export function flagProblem(argv: string[]): FlagProblem | null {
  const command = firstPositional(argv) ?? "serve";
  const accepted = COMMAND_FLAGS[command] && [...COMMON, ...COMMAND_FLAGS[command]];
  for (const [index, arg] of argv.slice(0, optionsEnd(argv)).entries()) {
    if (!arg.startsWith("-") || VALUE_FLAGS.includes(argv[index - 1])) continue;
    const name = nameOf(arg);
    if (VALUE_FLAGS.includes(name) && accepted && !accepted.includes(name)) return { flag: name };
    if (VALUE_FLAGS.includes(name)) {
      const value = name === arg ? argv[index + 1] : arg.slice(name.length + 1);
      if (!value || (name === arg && value.startsWith("-"))) return { flag: name, missingValue: true };
    } else if (!SWITCHES.includes(name) || (accepted && !accepted.includes(name))) {
      const near = [...VALUE_FLAGS, ...SWITCHES].find((known) => distance(known, name) <= 2);
      return { flag: name, near };
    }
  }
  return null;
}
