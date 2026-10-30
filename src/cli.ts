import { runDoctor } from "./doctor.js";
import { humanMessage } from "./errors.js";
import { runInstall } from "./install.js";
import { serve } from "./serve.js";
import { version } from "./server.js";
import { runSetup } from "./setup.js";

export type Output = NodeJS.WritableStream;
export type Streams = { stdin: NodeJS.ReadStream; stdout: Output; stderr: Output };

const MIN_NODE_MAJOR = 22;
const VALUE_FLAGS = ["--profile", "--url"];

const USAGE = `operator-mcp ${version} — an MCP server for OpenProject

Usage:
  operator-mcp                   Start the MCP server on stdio (what your agent runs)
  operator-mcp setup             Store credentials for a profile and register your agents
  operator-mcp install           Register OPerator with the agents found on this machine
  operator-mcp doctor            Check the profile, the connection and agent registrations
  operator-mcp --help, -h        Show this message
  operator-mcp --version, -v     Print the version

Options:
  --profile <name>               Credential profile to use (default: "default")
  --non-interactive              setup: no prompts; key from OPENPROJECT_API_KEY
  --url <url>                    setup: the OpenProject instance URL
  --yes                          install: register every detected agent without asking

Environment:
  OPENPROJECT_URL, OPENPROJECT_API_KEY, OPENPROJECT_PROFILE, OPENPROJECT_DEFAULT_PROJECT,
  OPENPROJECT_CONVENTIONS_PATH, OPENPROJECT_READ_ONLY=1, OPENPROJECT_ALLOW_DELETE=1,
  OPENPROJECT_ALLOW_INSECURE_HTTP=1

Docs: https://github.com/DanielEsc0911/operator-mcp#readme
`;

function firstPositional(argv: string[]): string | undefined {
  return argv.find((arg, index) => !arg.startsWith("-") && !VALUE_FLAGS.includes(argv[index - 1]));
}

async function route(argv: string[], streams: Streams): Promise<number | null> {
  if (argv[0] === "--version" || argv[0] === "-v") return (streams.stdout.write(`${version}\n`), 0);
  if (argv[0] === "--help" || argv[0] === "-h") return (streams.stdout.write(USAGE), 0);

  const command = firstPositional(argv);
  if (command === "setup") return runSetup(argv, streams);
  if (command === "install") return runInstall(argv, streams);
  if (command === "doctor") return runDoctor(argv, streams);
  if (command !== undefined) {
    streams.stderr.write(`operator-mcp: unknown command "${command}". Try: operator-mcp --help\n`);
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
  if (Number(nodeVersion.split(".")[0]) < MIN_NODE_MAJOR) {
    streams.stderr.write(`operator-mcp needs Node ${MIN_NODE_MAJOR} or newer; this is Node ${nodeVersion}. Upgrade Node and retry.\n`);
    return 1;
  }
  try {
    return await route(argv, streams);
  } catch (error) {
    streams.stderr.write(`operator-mcp: ${humanMessage(error)}\n`);
    return 1;
  }
}
