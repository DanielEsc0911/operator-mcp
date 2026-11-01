import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const argument = process.argv[2];
if (!argument) {
  console.error("usage: node scripts/binary-smoke.mjs <path-to-binary>");
  process.exit(2);
}
const binary = resolve(argument);
const expectedVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const stub = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ _type: "User", id: 7, name: "Smoke Tester", email: "smoke@example.test", login: "smoke" }));
});
await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${stub.address().port}`;
const home = mkdtempSync(join(tmpdir(), "operator-smoke-"));
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  OPENPROJECT_URL: url,
  OPENPROJECT_API_KEY: "smoke-key",
  OPENPROJECT_ALLOW_INSECURE_HTTP: "1",
  OPERATOR_LANG: "en",
};

function check(name, condition, detail = "") {
  if (!condition) throw new Error(`${name} failed. ${detail}`);
  console.log(`ok  ${name}`);
}

const run = (args) =>
  new Promise((resolve) =>
    execFile(binary, args, { env, encoding: "utf8" }, (error, stdout, stderr) => resolve({ status: error ? (error.code ?? 1) : 0, stdout, stderr })),
  );

async function version() {
  const result = await run(["--version"]);
  check("--version", result.status === 0 && result.stdout.includes(expectedVersion), `expected ${expectedVersion}, got ${JSON.stringify(result.stdout)} ${result.stderr}`);
}

async function mcpSession() {
  const child = spawn(binary, [], { env, stdio: ["pipe", "pipe", "inherit"] });
  const pending = new Map();
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
      const message = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      pending.get(message.id)?.(message);
    }
  });
  const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  const call = (id, method, params) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 20_000);
      pending.set(id, (message) => (clearTimeout(timer), resolve(message)));
      send({ id, method, params });
    });

  try {
    const init = await call(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
    check("initialize", init.result.serverInfo.version === expectedVersion, JSON.stringify(init));
    send({ method: "notifications/initialized" });

    const tools = await call(2, "tools/list", {});
    check("tools/list", tools.result.tools.some((tool) => tool.name === "whoami"));

    const whoami = await call(3, "tools/call", { name: "whoami", arguments: {} });
    check("tools/call whoami", !whoami.result.isError && whoami.result.content[0].text.includes("Smoke Tester"), JSON.stringify(whoami));
  } finally {
    child.kill();
  }
}

async function setup() {
  mkdirSync(join(home, ".cursor"));
  const result = await run(["setup", "--non-interactive", "--url", url]);
  const stored = [join(home, ".config", "operator-mcp"), join(home, ".operator-mcp")].some(existsSync);
  check("setup --non-interactive", result.status === 0 && stored, `exit ${result.status}\n${result.stdout}\n${result.stderr}`);
  await run(["install", "--yes"]);
  const cursor = join(home, ".cursor", "mcp.json");
  const registered = existsSync(cursor) ? readFileSync(cursor, "utf8") : "";
  check("install --yes registers the binary itself", registered.includes(JSON.stringify(binary).slice(1, -1)), registered || result.stdout);
}

try {
  await version();
  await mcpSession();
  await setup();
} finally {
  stub.close();
  rmSync(home, { recursive: true, force: true });
}
