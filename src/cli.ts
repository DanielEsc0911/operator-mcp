import { runDoctor } from "./doctor.js";
import { humanMessage } from "./errors.js";
import { detectLang, t, useLang } from "./i18n/index.js";
import { runInstall } from "./install.js";
import { serve } from "./serve.js";
import { version } from "./server.js";
import { runSetup } from "./setup.js";

export type Output = NodeJS.WritableStream;
export type Streams = { stdin: NodeJS.ReadStream; stdout: Output; stderr: Output };

const MIN_NODE_MAJOR = 22;
const VALUE_FLAGS = ["--profile", "--url", "--lang"];

function firstPositional(argv: string[]): string | undefined {
  return argv.find((arg, index) => !arg.startsWith("-") && !VALUE_FLAGS.includes(argv[index - 1]));
}

async function route(argv: string[], streams: Streams): Promise<number | null> {
  if (argv[0] === "--version" || argv[0] === "-v") return (streams.stdout.write(`${version}\n`), 0);
  if (argv[0] === "--help" || argv[0] === "-h") return (streams.stdout.write(t().usage(version)), 0);

  const command = firstPositional(argv);
  if (command === "setup") return runSetup(argv, streams);
  if (command === "install") return runInstall(argv, streams);
  if (command === "doctor") return runDoctor(argv, streams);
  if (command !== undefined) {
    streams.stderr.write(`operator-mcp: ${t().unknownCommand(command)}\n`);
    return 2;
  }
  await serve(argv);
  return null;
}

export async function runCli(
  argv: string[],
  streams: Streams,
  nodeVersion = process.versions.node,
): Promise<number | null> {
  useLang(detectLang(argv, process.env));
  if (Number(nodeVersion.split(".")[0]) < MIN_NODE_MAJOR) {
    streams.stderr.write(`${t().nodeTooOld(MIN_NODE_MAJOR, nodeVersion)}\n`);
    return 1;
  }
  try {
    return await route(argv, streams);
  } catch (error) {
    streams.stderr.write(`operator-mcp: ${humanMessage(error)}\n`);
    return 1;
  }
}
