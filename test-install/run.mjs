import { execFileSync, spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const BUN = "bun@1.4.4";
const ASSET = "operator-mcp-linux-x64";
const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const BROKEN = "0.0.0";

function buildRelease(dir) {
  const binary = process.env.OPERATOR_TEST_BINARY ?? join(dir, ASSET);
  if (!process.env.OPERATOR_TEST_BINARY) {
    execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
    execFileSync("npx", ["-y", BUN, "build", "--compile", "dist/index.js", "--outfile", binary], { cwd: ROOT, stdio: "inherit" });
  }
  const packed = join(dir, `${ASSET}.gz`);
  writeFileSync(packed, gzipSync(readFileSync(binary), { level: 9 }));
  const hash = createHash("sha256").update(readFileSync(packed)).digest("hex");
  const release = (tag, sums) => {
    mkdirSync(join(dir, "download", tag), { recursive: true });
    writeFileSync(join(dir, "download", tag, "SHA256SUMS"), sums);
  };
  release(`v${version}`, `${hash}  ${ASSET}.gz\n`);
  release(`v${BROKEN}`, `${"0".repeat(64)}  ${ASSET}.gz\n`);
  return { files: { [`v${version}`]: packed, [`v${BROKEN}`]: packed } };
}

function serve(dir, binaries, port) {
  const server = createServer((request, response) => {
    const path = request.url.split("?")[0];
    if (path === "/install.sh") return send(response, join(ROOT, "install/install.sh"));
    if (path === "/releases/latest") {
      response.writeHead(302, { location: `/releases/tag/v${version}` });
      return response.end();
    }
    if (path.startsWith("/releases/tag/")) return response.end("release page");
    const [, , , tag, name] = path.split("/");
    if (name === `${ASSET}.gz` && binaries[tag]) return send(response, binaries[tag]);
    send(response, join(dir, path.replace(/^\/releases\//, "")));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function send(response, file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    return response.end("not found");
  }
  response.writeHead(200, { "content-length": statSync(file).size });
  if (response.req.method === "HEAD") return response.end();
  createReadStream(file).pipe(response);
}

function container(image, script, { env = {}, tty = false } = {}) {
  const flags = Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  const args = ["run", "--rm", "--network", "host", ...(tty ? ["-t"] : []), ...flags, image, "sh", "-c", script];
  return run("podman", args);
}

function run(command, args) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return new Promise((resolve) => child.on("close", (code) => resolve({ code, output })));
}

const results = [];
function check(name, ok, output) {
  results.push(ok);
  process.stdout.write(`${ok ? "pass" : "FAIL"}  ${name}\n`);
  if (!ok) process.stdout.write(`${output.replace(/^/gm, "      ")}\n`);
}

const serveOnly = process.argv.includes("--serve");
const work = mkdtempSync(join(tmpdir(), "operator-release-"));
const server = await serve(work, buildRelease(work).files, serveOnly ? 8780 : 0);
const origin = `http://127.0.0.1:${server.address().port}`;
const env = { OPERATOR_BASE: `${origin}/releases` };
const install = `curl -fsSL ${origin}/install.sh | sh`;

if (serveOnly) {
  process.stdout.write(`\nServing a fake ${version} release. Ctrl-C stops it.\n  OPERATOR_BASE=${env.OPERATOR_BASE} sh install/install.sh\n`);
  process.on("SIGINT", () => {
    rmSync(work, { recursive: true, force: true });
    process.exit(0);
  });
  await new Promise(() => {});
}

try {
  for (const image of ["registry.fedoraproject.org/fedora:latest", "docker.io/library/buildpack-deps:stable-curl"]) {
    const result = await container(image, `${install} && ~/.local/bin/operator-mcp --version`, { env });
    check(`${image}: installs and runs --version`, result.code === 0 && result.output.trim().endsWith(version), result.output);
  }

  const corrupt = await container("registry.fedoraproject.org/fedora:latest", `${install}; echo "exit=$?"; ls ~/.local/bin/operator-mcp`, {
    env: { ...env, OPERATOR_VERSION: BROKEN },
  });
  check(
    "bad checksum refuses and installs nothing",
    /does not match its SHA-256/.test(corrupt.output) && /exit=1/.test(corrupt.output) && /No such file/.test(corrupt.output),
    corrupt.output,
  );

  const tty = { ...env, TERM: "xterm-256color", LANG: "C.UTF-8" };
  const plain = await container("registry.fedoraproject.org/fedora:latest", `${install} -s -- --no-setup`, { env: { ...tty, NO_COLOR: "1" }, tty: true });
  check("NO_COLOR output has no escape byte", plain.code === 0 && !plain.output.includes("\x1b"), plain.output);
  const fancy = await container("registry.fedoraproject.org/fedora:latest", `${install} -s -- --no-setup`, { env: tty, tty: true });
  check("a colour terminal gets colour (control)", fancy.code === 0 && fancy.output.includes("\x1b[38;5;172m"), fancy.output);

  const narrow = await container("registry.fedoraproject.org/fedora:latest", `stty cols 40; ${install} -s -- --no-setup`, { env: tty, tty: true });
  const strip = (text) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  const redrawn = narrow.output.split("\n").filter((line) => line.includes("\x1b[K"));
  const frames = strip(narrow.output).split("\n");
  check(
    "40 columns: every redrawn frame fits and each step leaves one line",
    narrow.code === 0 &&
      redrawn.length >= 4 &&
      redrawn.every((line) => strip(line).split("\r").every((frame) => [...frame].length <= 39)) &&
      frames.filter((line) => line.includes("Dialing")).length === 1,
    narrow.output,
  );

  const spanish = await container("registry.fedoraproject.org/fedora:latest", `${install} -s -- --no-setup`, {
    env: { ...tty, LANG: "es_ES.UTF-8" },
    tty: true,
  });
  check("LANG=es speaks Spanish", spanish.code === 0 && /Marcando/.test(spanish.output) && /Cuando quieras/.test(spanish.output), spanish.output);

  const upgrade = await container(
    "registry.fedoraproject.org/fedora:latest",
    `printf '{"mcpServers":{"openproject":{"command":"npx","args":["-y","operator-mcp"]}}}' > ~/.claude.json; ${install} -s -- --no-setup`,
    { env },
  );
  check("a 1.2.0 npx install is reported as an upgrade", upgrade.code === 0 && upgrade.output.includes(`Upgrading     from npx → ${version}`), upgrade.output);

  const alpine = await container("docker.io/library/alpine:latest", `wget -qO- ${origin}/install.sh | sh; echo "exit=$?"`, { env });
  check("Alpine gets the musl refusal and the npx line", /uses musl/.test(alpine.output) && /npx -y operator-mcp setup/.test(alpine.output) && /exit=1/.test(alpine.output), alpine.output);

  const lint = await run("podman", ["run", "--rm", "-v", `${join(ROOT, "install")}:/mnt:Z`, "docker.io/koalaman/shellcheck:stable", "/mnt/install.sh"]);
  check("shellcheck install.sh", lint.code === 0, lint.output);
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;
process.stdout.write(`\n${results.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
