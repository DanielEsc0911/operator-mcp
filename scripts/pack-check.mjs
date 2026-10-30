import { execSync } from "node:child_process";

const REQUIRED = ["package.json", "README.md", "LICENSE", "dist/index.js", "dist/cli.js"];
const FORBIDDEN = [/^src\//, /^test/, /^docs\//, /^scripts\//, /^\.github\//, /^\.claude\//, /^\.codegraph\//, /\.env/, /\.tgz$/];

const [{ files }] = JSON.parse(
  execSync("npm pack --dry-run --json --ignore-scripts", { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }),
);
const paths = files.map((file) => file.path);

const missing = REQUIRED.filter((name) => !paths.includes(name));
const leaked = paths.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)));

for (const name of missing) console.error(`missing from the tarball: ${name}`);
for (const path of leaked) console.error(`must not be published: ${path}`);

if (missing.length > 0 || leaked.length > 0) process.exit(1);
console.log(`tarball contents ok — ${paths.length} files`);
