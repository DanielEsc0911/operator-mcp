# OPerator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `openproject-mcp` (brand: OPerator), a stdio MCP server giving agents 20 tools over an OpenProject instance plus a per-workplace conventions manual delivered automatically at connection.

**Architecture:** One npm package. `config.ts` resolves a profile directory and merges environment over stored settings. `OpenProjectClient` is the single choke point for HTTP, authentication, filter encoding, and the read-only guard. `hal.ts` flattens OpenProject's verbose HAL+JSON into small plain objects. Tool modules under `src/tools/` register Zod-described tools against an `McpServer`, which injects the workplace conventions manual into its `instructions` at initialize time.

**Tech Stack:** TypeScript 5, Node 20+, `@modelcontextprotocol/sdk`, `zod`, Vitest. Native `fetch` and `node:readline` — nothing else.

**Spec:** `docs/superpowers/specs/2026-07-28-operator-openproject-mcp-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- Node 20 or newer. `AbortSignal.timeout` and global `fetch` are assumed available.
- Exactly two runtime dependencies: `@modelcontextprotocol/sdk` and `zod`. Adding a third requires an explicit decision from the user. Never add axios, commander, inquirer, dotenv, or a logging library.
- `"type": "module"` with `moduleResolution: Node16`. **Every relative import must carry a `.js` extension**, even when importing a `.ts` file: `import { loadConfig } from "./config.js";`
- No file exceeds ~150 lines. `OpenProjectClient` is the only class in the codebase.
- Self-explanatory names over comments. A comment is written only where code cannot express the reason. In this codebase that is exactly five places: `lockVersion` optimistic locking, `offset` meaning a page number, ISO 8601 duration conversion, the `o`/`c` status operators, and the readline echo-muting workaround.
- Tool inputs are declared as Zod raw shapes. The `.describe()` text on each field is what the agent reads — write it for an agent, not for a compiler.
- Never write a `delete_*` tool. Deletion is reachable only through `api_request`.
- Every mutating operation must be blocked when `config.readOnly` is true.
- Tests never contact a real OpenProject instance. `test/` mocks `fetch`; the live smoke suite lives in `test-live/` and is excluded from the default Vitest run.
- Author commits with `git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me"` — this repository has no committer identity configured.

## File Structure

| File | Responsibility |
|---|---|
| `src/index.ts` | Bin entry. `setup` argument routes to the wizard, anything else starts the server. |
| `src/config.ts` | Profile resolution, environment precedence, URL normalization, save/load. |
| `src/errors.ts` | `ConfigError`, `ReadOnlyError`, `OpenProjectError`, status-to-message mapping. |
| `src/client.ts` | `OpenProjectClient`: auth header, timeouts, filter encoding, pagination, identity cache, read-only guard. |
| `src/hal.ts` | Pure HAL flattening helpers. No I/O. |
| `src/conventions.ts` | Read, append, and remove rules in the manual. Backups. |
| `src/resolve.ts` | Turn a name-or-id reference into an APIv3 href. Cached metadata lookups. |
| `src/server.ts` | `McpServer` construction, `instructions` assembly, tool and resource registration. |
| `src/setup.ts` | Interactive wizard. |
| `src/tools/shared.ts` | `ToolContext`, `jsonResult`, `errorResult`, `handler` wrapper. |
| `src/tools/identity.ts` | `whoami`, `list_projects`, `list_users` |
| `src/tools/raw.ts` | `api_request` |
| `src/tools/meta.ts` | `list_metadata` |
| `src/tools/workPackages.ts` | `get_work_package`, `search_work_packages`, `my_work`, and the filter builder |
| `src/tools/workPackageWrites.ts` | `create_work_package`, `update_work_package`, `comment_work_package`, `list_activities`, `link_work_packages` |
| `src/tools/notifications.ts` | `list_notifications`, `mark_notifications_read`, `watch_work_package` |
| `src/tools/time.ts` | `log_time` |
| `src/tools/conventions.ts` | `conventions`, `add_convention`, `remove_convention` |
| `templates/conventions.md` | Starter manual written by the wizard. |

Two files exist here that the spec's layout did not name. `src/resolve.ts` earns its place with three callers (`search_work_packages`, `create_work_package`, `update_work_package`). `src/tools/shared.ts` earns its place with twenty callers. Both satisfy the spec's "no abstraction without a second caller" rule.

Work package reads and writes are split across two modules from the start. Together they carry eight tools and would push a single file well past the 150-line guidance.

## Deviation from the spec, resolved here

The spec says identity resolves lazily on the first tool call, and separately that `instructions` names the current user. Those cannot both hold, because `instructions` is assembled before any tool runs. **Resolution:** `src/server.ts` attempts `GET /users/me` once at startup. On success the identity appears in `instructions` and is already cached for the first tool call. On failure — offline, bad key, unconfigured — the server still starts, `instructions` omits the identity line and keeps the manual, and tools report the real error when called. A server that exits during startup shows up in MCP clients as an unexplained crash.

---

## Task 1: Scaffolding, CLAUDE.md, and configuration

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `CLAUDE.md`
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Config = { profile: string; url: string; apiKey: string; defaultProject?: string; conventionsPath: string; readOnly: boolean }`
  - `normalizeUrl(raw: string): string`
  - `profileDir(profile: string): string`
  - `resolveProfile(argv: string[], env: NodeJS.ProcessEnv): string`
  - `loadConfig(argv?: string[], env?: NodeJS.ProcessEnv): Config`
  - `saveConfig(profile: string, data: { url: string; apiKey: string; defaultProject?: string }): string`

- [ ] **Step 1: Initialize the package and install dependencies**

```bash
cd /home/analista/Documents/Proyects/OPerator
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install --save-dev typescript vitest @types/node
npm ls zod
```

The `npm ls zod` output must show a single resolved version. The MCP SDK pins a major version of zod; if npm reports a conflict, install the version the SDK requires rather than the newest.

- [ ] **Step 2: Replace `package.json` with the real one**

Keep the `dependencies` and `devDependencies` blocks npm just wrote. Replace everything else:

```json
{
  "name": "openproject-mcp",
  "version": "0.1.0",
  "description": "OPerator — MCP server for OpenProject",
  "type": "module",
  "bin": { "openproject-mcp": "dist/index.js" },
  "files": ["dist", "templates"],
  "engines": { "node": ">=20" },
  "license": "MIT",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:live": "vitest run --dir test-live",
    "prepublishOnly": "npm run build"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json` and `vitest.config.ts`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 4: Write `CLAUDE.md`**

````markdown
# OPerator

MCP server exposing an OpenProject instance to agents. Published as `openproject-mcp`.

## Run it

```bash
npm install          # once
npm test             # vitest, mocked fetch, never touches a real instance
npm run build        # tsc → dist/
node dist/index.js setup    # credential wizard
node dist/index.js          # stdio MCP server
```

## Rules

**Two runtime dependencies.** `@modelcontextprotocol/sdk` and `zod`. Nothing else ships.
Native `fetch` replaces axios, `node:readline` replaces inquirer, `process.env`
replaces dotenv. A third dependency needs a reason and the user's agreement.

**Relative imports end in `.js`.** This is an ESM package under `moduleResolution:
Node16`. `import { loadConfig } from "./config.js"` — even though the file is `.ts`.

**Files stay under ~150 lines, one responsibility each.** When a file outgrows that,
split it by responsibility. `OpenProjectClient` is the only class.

**Comments are rare and earn their place.** Names carry the meaning. A comment
explains something the code cannot: an external constraint, a counterintuitive
API contract, a workaround. There are exactly five in this codebase — OpenProject's
`lockVersion` locking, `offset` being a page number, ISO 8601 durations, the `o`/`c`
status operators, and readline's echo muting. Do not add a sixth without a reason
of the same kind. Never write a comment restating what the line does.

**Zod descriptions are agent-facing documentation.** `.describe()` on every field.
Write what an agent needs to choose correctly, not what a type checker needs.

**No `delete_*` tools, ever.** Destruction goes through `api_request`, where it
cannot happen by misreading a vague instruction.

**Every write checks `config.readOnly`.** HTTP writes are guarded inside
`OpenProjectClient.request`. Filesystem writes — the conventions manual — are
guarded in their own tool.

**stdout belongs to the transport.** The stdio server speaks JSON-RPC on stdout;
a stray `console.log` anywhere the server can reach corrupts the stream and the
client disconnects. Diagnostics use `process.stderr.write`. Only `src/setup.ts`
may write to stdout, because the wizard runs with no transport attached.

**Tests mock `fetch`.** `test/` never reaches the network. Live smoke tests live in
`test-live/` and run only when `OPENPROJECT_URL` and `OPENPROJECT_API_KEY` are set.

## Layout

| Path | Does |
|---|---|
| `src/config.ts` | Profiles, env precedence, URL normalization |
| `src/errors.ts` | Typed errors and their human messages |
| `src/client.ts` | All HTTP. Auth, timeouts, filters, pagination, read-only guard |
| `src/hal.ts` | HAL+JSON → flat objects. Pure |
| `src/conventions.ts` | The workplace manual: read, append, remove, back up |
| `src/resolve.ts` | Name-or-id → APIv3 href |
| `src/server.ts` | McpServer, `instructions`, registration |
| `src/setup.ts` | Wizard |
| `src/tools/` | One module per domain |

## OpenProject APIv3 traps

- Auth is `Authorization: Basic base64("apikey:" + <apiKey>)`.
  (Corrected 2026-08-19: originally `Bearer <apiKey>` — OAuth2-only, 401s for a personal API key.)
- `filters` is a URL-encoded JSON array: `[{"assignee":{"operator":"=","values":["me"]}}]`
- Open and closed are *operators*, not values: `{"status":{"operator":"o","values":[]}}`
- `offset` is a 1-based **page number**, not a record offset. `pageSize` is items per page.
- `PATCH` requires the current `lockVersion`. Read the resource first. A stale value returns 409.
- Time entry hours are ISO 8601 durations. 2.5 hours is `PT2H30M`.
- Comments are `POST /work_packages/{id}/activities` with `{"comment":{"raw":"..."}}`.
- Assignable people come from `/projects/{id}/available_assignees`. `/users` needs admin.
- Collections put members in `_embedded.elements`, with `total` and `count` at the root.
````

- [ ] **Step 5: Write the failing test**

`test/config.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeUrl, profileDir, resolveProfile, loadConfig, saveConfig } from "../src/config.js";

let home: string;
const originalHome = process.env.HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "operator-"));
  process.env.HOME = home;
});

afterEach(() => {
  process.env.HOME = originalHome;
});

describe("normalizeUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeUrl("https://op.acme.com/")).toBe("https://op.acme.com");
  });

  it("strips a pasted api path", () => {
    expect(normalizeUrl("https://op.acme.com/api/v3/")).toBe("https://op.acme.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  https://op.acme.com  ")).toBe("https://op.acme.com");
  });
});

describe("resolveProfile", () => {
  it("prefers the --profile argument", () => {
    expect(resolveProfile(["--profile", "acme"], { OPENPROJECT_PROFILE: "other" })).toBe("acme");
  });

  it("falls back to the environment", () => {
    expect(resolveProfile([], { OPENPROJECT_PROFILE: "acme" })).toBe("acme");
  });

  it("defaults to 'default'", () => {
    expect(resolveProfile([], {})).toBe("default");
  });
});

describe("loadConfig", () => {
  it("reads a stored profile", () => {
    saveConfig("acme", { url: "https://op.acme.com", apiKey: "stored-key", defaultProject: "website" });
    const config = loadConfig(["--profile", "acme"], {});
    expect(config.url).toBe("https://op.acme.com");
    expect(config.apiKey).toBe("stored-key");
    expect(config.defaultProject).toBe("website");
    expect(config.conventionsPath).toBe(join(profileDir("acme"), "conventions.md"));
  });

  it("lets the environment override the file", () => {
    saveConfig("acme", { url: "https://op.acme.com", apiKey: "stored-key" });
    const config = loadConfig(["--profile", "acme"], { OPENPROJECT_API_KEY: "env-key" });
    expect(config.apiKey).toBe("env-key");
    expect(config.url).toBe("https://op.acme.com");
  });

  it("normalizes a url coming from the environment", () => {
    const config = loadConfig([], { OPENPROJECT_URL: "https://op.acme.com/api/v3" });
    expect(config.url).toBe("https://op.acme.com");
  });

  it("honours an explicit conventions path", () => {
    const config = loadConfig([], { OPENPROJECT_CONVENTIONS_PATH: "/repo/conventions.md" });
    expect(config.conventionsPath).toBe("/repo/conventions.md");
  });

  it("reads read-only mode", () => {
    expect(loadConfig([], { OPENPROJECT_READ_ONLY: "1" }).readOnly).toBe(true);
    expect(loadConfig([], { OPENPROJECT_READ_ONLY: "true" }).readOnly).toBe(true);
    expect(loadConfig([], {}).readOnly).toBe(false);
  });

  it("returns empty credentials rather than throwing when unconfigured", () => {
    const config = loadConfig([], {});
    expect(config.url).toBe("");
    expect(config.apiKey).toBe("");
  });

  it("ignores an unreadable config file", () => {
    mkdirSync(profileDir("broken"), { recursive: true });
    writeFileSync(join(profileDir("broken"), "config.json"), "{ not json");
    expect(loadConfig(["--profile", "broken"], {}).url).toBe("");
  });
});

describe("saveConfig", () => {
  it("writes owner-only permissions", () => {
    const path = saveConfig("acme", { url: "https://op.acme.com", apiKey: "secret" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(profileDir("acme")).mode & 0o777).toBe(0o700);
    expect(JSON.parse(readFileSync(path, "utf8")).apiKey).toBe("secret");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL — `Failed to resolve import "../src/config.js"`.

- [ ] **Step 7: Implement `src/config.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Config = {
  profile: string;
  url: string;
  apiKey: string;
  defaultProject?: string;
  conventionsPath: string;
  readOnly: boolean;
};

type StoredConfig = {
  url?: string;
  apiKey?: string;
  defaultProject?: string;
};

export function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/api\/v3$/, "");
}

export function profileDir(profile: string): string {
  return join(homedir(), ".config", "openproject-mcp", profile);
}

export function resolveProfile(argv: string[], env: NodeJS.ProcessEnv): string {
  const flag = argv.indexOf("--profile");
  if (flag !== -1 && argv[flag + 1]) return argv[flag + 1];
  return env.OPENPROJECT_PROFILE || "default";
}

function readStored(profile: string): StoredConfig {
  const path = join(profileDir(profile), "config.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

export function loadConfig(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): Config {
  const profile = resolveProfile(argv, env);
  const stored = readStored(profile);
  const readOnly = env.OPENPROJECT_READ_ONLY;
  return {
    profile,
    url: normalizeUrl(env.OPENPROJECT_URL ?? stored.url ?? ""),
    apiKey: env.OPENPROJECT_API_KEY ?? stored.apiKey ?? "",
    defaultProject: env.OPENPROJECT_DEFAULT_PROJECT ?? stored.defaultProject,
    conventionsPath: env.OPENPROJECT_CONVENTIONS_PATH ?? join(profileDir(profile), "conventions.md"),
    readOnly: readOnly === "1" || readOnly === "true",
  };
}

export function saveConfig(profile: string, data: StoredConfig): string {
  const dir = profileDir(profile);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "config.json");
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  return path;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run test/config.test.ts`
Expected: PASS, 15 tests.

If the directory permission assertion fails, `mkdirSync`'s `mode` is being reduced by the process umask. Add an explicit `chmodSync(dir, 0o700)` after `mkdirSync` and re-run.

- [ ] **Step 9: Verify the build**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: scaffolding, CLAUDE.md, and profile configuration"
```

---

## Task 2: HAL flattening

**Files:**
- Create: `src/hal.ts`
- Test: `test/hal.test.ts`, `test/fixtures/workPackage.json`, `test/fixtures/notification.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type HalResource = { _links?: Record<string, { href?: string; title?: string }>; [key: string]: unknown }`
  - `linkTitle(hal: HalResource, rel: string): string | undefined`
  - `linkId(hal: HalResource, rel: string): number | undefined`
  - `flattenWorkPackage(wp: HalResource, baseUrl: string, options?: { includeDescription?: boolean }): Record<string, unknown>`
  - `flattenProject(project: HalResource, baseUrl: string): Record<string, unknown>`
  - `flattenNotification(notification: HalResource, baseUrl: string): Record<string, unknown>`
  - `flattenActivity(activity: HalResource): Record<string, unknown>`
  - `flattenNamed(resource: HalResource): { id: number; name: string }`

- [ ] **Step 1: Write the fixtures**

`test/fixtures/workPackage.json` — a trimmed but structurally faithful APIv3 response:

```json
{
  "_type": "WorkPackage",
  "id": 1234,
  "lockVersion": 7,
  "subject": "Fix login redirect",
  "description": { "format": "markdown", "raw": "Users land on /dashboard instead of the requested page." },
  "startDate": "2026-07-28",
  "dueDate": "2026-08-03",
  "percentageDone": 40,
  "createdAt": "2026-07-20T08:00:00Z",
  "updatedAt": "2026-07-28T09:14:02Z",
  "_links": {
    "self": { "href": "/api/v3/work_packages/1234", "title": "Fix login redirect" },
    "type": { "href": "/api/v3/types/7", "title": "Bug" },
    "status": { "href": "/api/v3/statuses/7", "title": "In progress" },
    "priority": { "href": "/api/v3/priorities/9", "title": "High" },
    "project": { "href": "/api/v3/projects/3", "title": "Website" },
    "assignee": { "href": "/api/v3/users/12", "title": "Daniel Escalona" },
    "author": { "href": "/api/v3/users/5", "title": "Ana Ruiz" },
    "parent": { "href": "/api/v3/work_packages/1200", "title": "Auth overhaul" }
  }
}
```

`test/fixtures/notification.json`:

```json
{
  "_type": "Notification",
  "id": 88,
  "reason": "mentioned",
  "readIAN": false,
  "createdAt": "2026-07-28T09:20:00Z",
  "_links": {
    "self": { "href": "/api/v3/notifications/88" },
    "project": { "href": "/api/v3/projects/3", "title": "Website" },
    "actor": { "href": "/api/v3/users/5", "title": "Ana Ruiz" },
    "resource": { "href": "/api/v3/work_packages/1234", "title": "Fix login redirect" }
  }
}
```

- [ ] **Step 2: Write the failing test**

`test/hal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import workPackage from "./fixtures/workPackage.json" with { type: "json" };
import notification from "./fixtures/notification.json" with { type: "json" };
import {
  linkTitle, linkId, flattenWorkPackage, flattenProject, flattenNotification, flattenNamed,
} from "../src/hal.js";

const BASE = "https://op.acme.com";

describe("link helpers", () => {
  it("reads a link title", () => {
    expect(linkTitle(workPackage, "status")).toBe("In progress");
  });

  it("reads a numeric id out of an href", () => {
    expect(linkId(workPackage, "assignee")).toBe(12);
  });

  it("returns undefined for a missing link", () => {
    expect(linkTitle(workPackage, "responsible")).toBeUndefined();
    expect(linkId(workPackage, "responsible")).toBeUndefined();
  });

  it("returns undefined for a null link, which OpenProject uses for unset references", () => {
    const unassigned = { _links: { assignee: { href: null as unknown as string } } };
    expect(linkId(unassigned, "assignee")).toBeUndefined();
  });
});

describe("flattenWorkPackage", () => {
  const flat = flattenWorkPackage(workPackage, BASE);

  it("lifts link titles to plain fields", () => {
    expect(flat).toMatchObject({
      id: 1234,
      subject: "Fix login redirect",
      type: "Bug",
      status: "In progress",
      priority: "High",
      project: "Website",
      assignee: "Daniel Escalona",
      author: "Ana Ruiz",
      parent: 1200,
      dueDate: "2026-08-03",
      percentageDone: 40,
      lockVersion: 7,
    });
  });

  it("builds a browser url", () => {
    expect(flat.url).toBe("https://op.acme.com/work_packages/1234");
  });

  it("omits description by default so list results stay small", () => {
    expect(flat.description).toBeUndefined();
  });

  it("includes description on request", () => {
    const detailed = flattenWorkPackage(workPackage, BASE, { includeDescription: true });
    expect(detailed.description).toContain("Users land on /dashboard");
  });

  it("emits no _links", () => {
    expect(JSON.stringify(flat)).not.toContain("_links");
  });
});

describe("flattenNotification", () => {
  const flat = flattenNotification(notification, BASE);

  it("flattens to the fields an agent triages on", () => {
    expect(flat).toMatchObject({
      id: 88,
      reason: "mentioned",
      read: false,
      project: "Website",
      actor: "Ana Ruiz",
      workPackageId: 1234,
      workPackageSubject: "Fix login redirect",
      url: "https://op.acme.com/work_packages/1234",
    });
  });

  it("falls back to the notification centre when the resource is not a work package", () => {
    const wiki = { ...notification, _links: { ...notification._links, resource: { href: "/api/v3/wiki_pages/4", title: "Onboarding" } } };
    const flatWiki = flattenNotification(wiki, BASE);
    expect(flatWiki.workPackageId).toBeUndefined();
    expect(flatWiki.url).toBe("https://op.acme.com/notifications");
  });
});

describe("flattenProject and flattenNamed", () => {
  const project = {
    id: 3, name: "Website", identifier: "website", active: true,
    description: { raw: "Public site" }, _links: {},
  };

  it("flattens a project", () => {
    expect(flattenProject(project, BASE)).toMatchObject({
      id: 3, name: "Website", identifier: "website", active: true,
      description: "Public site", url: "https://op.acme.com/projects/website",
    });
  });

  it("reduces metadata resources to id and name", () => {
    expect(flattenNamed({ id: 7, name: "Bug", _links: {} })).toEqual({ id: 7, name: "Bug" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/hal.test.ts`
Expected: FAIL — cannot resolve `../src/hal.js`.

- [ ] **Step 4: Implement `src/hal.ts`**

```ts
export type HalLink = { href?: string | null; title?: string | null };

export type HalResource = {
  _links?: Record<string, HalLink | HalLink[] | undefined>;
  [key: string]: unknown;
};

function link(hal: HalResource, rel: string): HalLink | undefined {
  const value = hal._links?.[rel];
  return Array.isArray(value) ? value[0] : value;
}

export function linkTitle(hal: HalResource, rel: string): string | undefined {
  return link(hal, rel)?.title ?? undefined;
}

export function linkId(hal: HalResource, rel: string): number | undefined {
  const match = /\/(\d+)$/.exec(link(hal, rel)?.href ?? "");
  return match ? Number(match[1]) : undefined;
}

function raw(value: unknown): string | undefined {
  const text = (value as { raw?: string } | undefined)?.raw;
  return text ? text : undefined;
}

export function flattenWorkPackage(
  wp: HalResource,
  baseUrl: string,
  options: { includeDescription?: boolean } = {},
): Record<string, unknown> {
  return {
    id: wp.id,
    subject: wp.subject,
    type: linkTitle(wp, "type"),
    status: linkTitle(wp, "status"),
    priority: linkTitle(wp, "priority"),
    project: linkTitle(wp, "project"),
    assignee: linkTitle(wp, "assignee"),
    author: linkTitle(wp, "author"),
    parent: linkId(wp, "parent"),
    startDate: wp.startDate ?? undefined,
    dueDate: wp.dueDate ?? undefined,
    percentageDone: wp.percentageDone ?? undefined,
    lockVersion: wp.lockVersion,
    createdAt: wp.createdAt,
    updatedAt: wp.updatedAt,
    url: `${baseUrl}/work_packages/${wp.id}`,
    ...(options.includeDescription ? { description: raw(wp.description) ?? "" } : {}),
  };
}

export function flattenProject(project: HalResource, baseUrl: string): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    identifier: project.identifier,
    active: project.active,
    description: raw(project.description),
    url: `${baseUrl}/projects/${project.identifier}`,
  };
}

export function flattenNotification(notification: HalResource, baseUrl: string): Record<string, unknown> {
  const href = link(notification, "resource")?.href ?? "";
  const isWorkPackage = href.includes("/work_packages/");
  return {
    id: notification.id,
    reason: notification.reason,
    read: notification.readIAN,
    project: linkTitle(notification, "project"),
    actor: linkTitle(notification, "actor"),
    workPackageId: isWorkPackage ? linkId(notification, "resource") : undefined,
    workPackageSubject: isWorkPackage ? linkTitle(notification, "resource") : undefined,
    resource: isWorkPackage ? undefined : linkTitle(notification, "resource"),
    createdAt: notification.createdAt,
    url: isWorkPackage
      ? `${baseUrl}/work_packages/${linkId(notification, "resource")}`
      : `${baseUrl}/notifications`,
  };
}

export function flattenActivity(activity: HalResource): Record<string, unknown> {
  return {
    id: activity.id,
    type: activity._type,
    user: linkTitle(activity, "user"),
    comment: raw(activity.comment),
    details: (activity.details as { raw?: string }[] | undefined)?.map((detail) => detail.raw).filter(Boolean),
    createdAt: activity.createdAt,
  };
}

export function flattenNamed(resource: HalResource): { id: number; name: string } {
  return { id: resource.id as number, name: resource.name as string };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/hal.test.ts`
Expected: PASS.

If the JSON import assertion syntax errors, the installed TypeScript predates `with { type: "json" }`. Replace both fixture imports with `JSON.parse(readFileSync(new URL("./fixtures/workPackage.json", import.meta.url), "utf8"))` and re-run.

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: flatten HAL+JSON resources into plain objects"
```

---

## Task 3: Errors and the HTTP client

**Files:**
- Create: `src/errors.ts`, `src/client.ts`
- Test: `test/errors.test.ts`, `test/client.test.ts`

**Interfaces:**
- Consumes: `Config` from `src/config.js`.
- Produces:
  - `class ConfigError extends Error`
  - `class ReadOnlyError extends Error`
  - `class OpenProjectError extends Error { readonly status: number }`
  - `describeHttpError(status: number, baseUrl: string, body: unknown): string`
  - `humanMessage(error: unknown): string`
  - `type Filter = Record<string, { operator: string; values: string[] }>`
  - `type Collection = { total: number; count: number; elements: HalResource[] }`
  - `type Identity = { id: number; name: string; email: string }`
  - `class OpenProjectClient` with:
    - `constructor(config: Config)`
    - `readonly config: Config`
    - `request(method: string, path: string, options?: { query?: Record<string, string | number | undefined>; body?: unknown }): Promise<any>`
    - `collection(path: string, params?: { filters?: Filter[]; pageSize?: number; offset?: number; sortBy?: [string, string][] }): Promise<Collection>`
    - `me(): Promise<Identity>`

- [ ] **Step 1: Write the failing tests**

`test/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ConfigError, ReadOnlyError, OpenProjectError, describeHttpError, humanMessage } from "../src/errors.js";

const BASE = "https://op.acme.com";

describe("describeHttpError", () => {
  it("points 401 at the token page", () => {
    expect(describeHttpError(401, BASE, {})).toBe(
      "API key rejected by https://op.acme.com — regenerate at https://op.acme.com/my/access_token",
    );
  });

  it("passes through OpenProject validation messages verbatim", () => {
    const body = { _embedded: { errors: [{ message: "Subject can't be blank" }, { message: "Type is invalid" }] } };
    expect(describeHttpError(422, BASE, body)).toBe("Subject can't be blank; Type is invalid");
  });

  it("falls back to the top-level message", () => {
    expect(describeHttpError(422, BASE, { message: "Bad request" })).toBe("Bad request");
  });

  it("tells the caller to re-read after a lock conflict", () => {
    expect(describeHttpError(409, BASE, { message: "Version mismatch" })).toBe(
      "Version mismatch. Read the resource again and retry.",
    );
  });

  it("describes 403 and 404 without leaking HAL", () => {
    expect(describeHttpError(403, BASE, {})).toContain("lacks the required permission");
    expect(describeHttpError(404, BASE, {})).toBe("Not found (or not visible to you)");
  });

  it("reports unmapped statuses with their code", () => {
    expect(describeHttpError(503, BASE, {})).toBe("OpenProject returned 503");
  });
});

describe("humanMessage", () => {
  it("renders each typed error", () => {
    expect(humanMessage(new ConfigError())).toBe("Not configured. Run: npx openproject-mcp setup");
    expect(humanMessage(new ReadOnlyError())).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
    expect(humanMessage(new OpenProjectError(404, "Work package 1234 not found"))).toBe("Work package 1234 not found");
  });

  it("renders an unexpected error without a stack trace", () => {
    const message = humanMessage(new TypeError("boom"));
    expect(message).toBe("boom");
    expect(message).not.toContain("at ");
  });

  it("renders a non-error throw", () => {
    expect(humanMessage("something odd")).toBe("something odd");
  });
});
```

`test/client.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OpenProjectClient } from "../src/client.js";
import { ConfigError, ReadOnlyError, OpenProjectError } from "../src/errors.js";
import type { Config } from "../src/config.js";

const config: Config = {
  profile: "acme",
  url: "https://op.acme.com",
  apiKey: "secret",
  conventionsPath: "/tmp/conventions.md",
  readOnly: false,
};

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("sends a bearer token to the versioned api path", async () => {
    fetchMock.mockResolvedValue(respond({ id: 1 }));
    await new OpenProjectClient(config).request("GET", "/users/me");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe("https://op.acme.com/api/v3/users/me");
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(init.method).toBe("GET");
  });

  it("serializes a json body", async () => {
    fetchMock.mockResolvedValue(respond({ id: 1 }));
    await new OpenProjectClient(config).request("POST", "/work_packages", { body: { subject: "Hi" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ subject: "Hi" });
  });

  it("drops undefined query values", async () => {
    fetchMock.mockResolvedValue(respond({}));
    await new OpenProjectClient(config).request("GET", "/projects", { query: { pageSize: 5, offset: undefined } });

    expect(fetchMock.mock.calls[0][0].toString()).toBe("https://op.acme.com/api/v3/projects?pageSize=5");
  });

  it("returns null for 204 responses", async () => {
    fetchMock.mockResolvedValue(respond(null, 204));
    expect(await new OpenProjectClient(config).request("POST", "/notifications/read_ian")).toBeNull();
  });

  it("throws ConfigError when credentials are missing", async () => {
    const client = new OpenProjectClient({ ...config, url: "", apiKey: "" });
    await expect(client.request("GET", "/users/me")).rejects.toBeInstanceOf(ConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks every non-GET method in read-only mode before any request", async () => {
    const client = new OpenProjectClient({ ...config, readOnly: true });
    await expect(client.request("POST", "/work_packages", { body: {} })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(client.request("PATCH", "/work_packages/1", { body: {} })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(client.request("DELETE", "/work_packages/1")).rejects.toBeInstanceOf(ReadOnlyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows GET in read-only mode", async () => {
    fetchMock.mockResolvedValue(respond({ id: 1 }));
    await new OpenProjectClient({ ...config, readOnly: true }).request("GET", "/users/me");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps an error status to an OpenProjectError", async () => {
    fetchMock.mockResolvedValue(respond({ _embedded: { errors: [{ message: "Subject can't be blank" }] } }, 422));
    const error = await new OpenProjectClient(config).request("POST", "/work_packages", { body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(OpenProjectError);
    expect(error.status).toBe(422);
    expect(error.message).toBe("Subject can't be blank");
  });

  it("explains a network failure with the instance url", async () => {
    fetchMock.mockRejectedValue(new TypeError("getaddrinfo ENOTFOUND"));
    await expect(new OpenProjectClient(config).request("GET", "/users/me")).rejects.toThrow(
      "Cannot reach https://op.acme.com: getaddrinfo ENOTFOUND",
    );
  });
});

describe("collection", () => {
  it("encodes filters and sort as json query parameters", async () => {
    fetchMock.mockResolvedValue(respond({ total: 2, count: 2, _embedded: { elements: [{ id: 1 }, { id: 2 }] } }));

    const result = await new OpenProjectClient(config).collection("/work_packages", {
      filters: [{ status: { operator: "o", values: [] } }],
      pageSize: 25,
      sortBy: [["dueDate", "asc"]],
    });

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get("filters")).toBe('[{"status":{"operator":"o","values":[]}}]');
    expect(url.searchParams.get("sortBy")).toBe('[["dueDate","asc"]]');
    expect(url.searchParams.get("pageSize")).toBe("25");
    expect(result).toEqual({ total: 2, count: 2, elements: [{ id: 1 }, { id: 2 }] });
  });

  it("omits the filters parameter when there are none", async () => {
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0, _embedded: { elements: [] } }));
    await new OpenProjectClient(config).collection("/projects", {});
    expect((fetchMock.mock.calls[0][0] as URL).searchParams.has("filters")).toBe(false);
  });

  it("tolerates a collection with no embedded elements", async () => {
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0 }));
    expect((await new OpenProjectClient(config).collection("/projects", {})).elements).toEqual([]);
  });
});

describe("me", () => {
  it("resolves identity once and caches it", async () => {
    fetchMock.mockResolvedValue(respond({ id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" }));
    const client = new OpenProjectClient(config);

    expect(await client.me()).toEqual({ id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" });
    await client.me();

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/errors.test.ts test/client.test.ts`
Expected: FAIL — cannot resolve `../src/errors.js` and `../src/client.js`.

- [ ] **Step 3: Implement `src/errors.ts`**

```ts
export class ConfigError extends Error {
  constructor() {
    super("Not configured. Run: npx openproject-mcp setup");
  }
}

export class ReadOnlyError extends Error {
  constructor() {
    super("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  }
}

export class OpenProjectError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type ErrorBody = {
  message?: string;
  _embedded?: { errors?: { message?: string }[] };
};

function detailOf(body: unknown): string | undefined {
  const parsed = body as ErrorBody | undefined;
  const validations = parsed?._embedded?.errors?.map((error) => error.message).filter(Boolean);
  if (validations?.length) return validations.join("; ");
  return parsed?.message || undefined;
}

export function describeHttpError(status: number, baseUrl: string, body: unknown): string {
  const detail = detailOf(body);
  switch (status) {
    case 401:
      return `API key rejected by ${baseUrl} — regenerate at ${baseUrl}/my/access_token`;
    case 403:
      return detail ?? "Your account lacks the required permission for this action";
    case 404:
      return detail ?? "Not found (or not visible to you)";
    case 409:
      return `${detail ?? "The resource changed while you were editing it"}. Read the resource again and retry.`;
    default:
      return detail ?? `OpenProject returned ${status}`;
  }
}

export function humanMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 4: Implement `src/client.ts`**

```ts
import type { Config } from "./config.js";
import { ConfigError, OpenProjectError, ReadOnlyError, describeHttpError } from "./errors.js";
import type { HalResource } from "./hal.js";

export type Filter = Record<string, { operator: string; values: string[] }>;
export type Collection = { total: number; count: number; elements: HalResource[] };
export type Identity = { id: number; name: string; email: string };

const TIMEOUT_MS = 30_000;

export class OpenProjectClient {
  #identity?: Identity;

  constructor(readonly config: Config) {}

  async request(
    method: string,
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<any> {
    if (!this.config.url || !this.config.apiKey) throw new ConfigError();
    if (this.config.readOnly && method !== "GET") throw new ReadOnlyError();

    const url = new URL(`/api/v3${path}`, this.config.url);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`Cannot reach ${this.config.url}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new OpenProjectError(response.status, describeHttpError(response.status, this.config.url, payload));
    return payload;
  }

  async collection(
    path: string,
    params: { filters?: Filter[]; pageSize?: number; offset?: number; sortBy?: [string, string][] } = {},
  ): Promise<Collection> {
    const body = await this.request("GET", path, {
      query: {
        filters: params.filters?.length ? JSON.stringify(params.filters) : undefined,
        sortBy: params.sortBy?.length ? JSON.stringify(params.sortBy) : undefined,
        pageSize: params.pageSize,
        // OpenProject's `offset` is a 1-based page number, not a record offset.
        offset: params.offset,
      },
    });
    return { total: body?.total ?? 0, count: body?.count ?? 0, elements: body?._embedded?.elements ?? [] };
  }

  async me(): Promise<Identity> {
    if (!this.#identity) {
      const user = await this.request("GET", "/users/me");
      this.#identity = { id: user.id, name: user.name, email: user.email };
    }
    return this.#identity;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/errors.test.ts test/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: typed errors and the OpenProject HTTP client"
```

---

## Task 4: The conventions manual

**Files:**
- Create: `src/conventions.ts`, `templates/conventions.md`
- Test: `test/conventions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `readConventions(path: string): string | null`
  - `addRule(path: string, section: string, rule: string): { section: string; rule: string; path: string }`
  - `removeRule(path: string, section: string, rule: string): { removed: boolean; backupPath?: string; bullets: string[] }`
  - `TEMPLATE_PATH: string` — absolute path to the packaged starter manual.

Section matching is case-insensitive at any heading level. A section runs from its heading to the next heading of the same or shallower level.

- [ ] **Step 1: Write `templates/conventions.md`**

```markdown
# <Workplace> — OpenProject conventions

Replace <Workplace> with your organization and edit the rules below. Everything
in this file is sent to the agent at the start of every session, so keep it under
roughly 200 lines and delete anything that no longer applies.

## Git / GitLab
- Branch: `{type}/{wp-id}-{slug}`  →  `bug/1234-fix-login-redirect`
- Commit subject: `[#1234] <imperative summary>`
- MR title must contain `#1234` so GitLab links back to the work package.

## Workflow
- Move to `In progress` only once a branch exists.
- Never close a work package yourself — set `Developed`, QA closes it.

## Fields
- `Version` is required on every Bug.
- Log time the same day, in hours.

## Etiquette
- Comment on the work package when you push. Don't just push.
```

- [ ] **Step 2: Write the failing test**

`test/conventions.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConventions, addRule, removeRule } from "../src/conventions.js";

let path: string;

const MANUAL = `# ACME — OpenProject conventions

## Git / GitLab
- Branch: \`{type}/{wp-id}-{slug}\`
- Commit subject: \`[#1234] <imperative summary>\`

## Workflow
- Move to \`In progress\` only once a branch exists.

### Bugs
- Reproduce before assigning.

## Etiquette
- Comment on the work package when you push.
`;

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), "operator-manual-")), "conventions.md");
  writeFileSync(path, MANUAL);
});

describe("readConventions", () => {
  it("returns the file verbatim", () => {
    expect(readConventions(path)).toBe(MANUAL);
  });

  it("returns null when there is no manual", () => {
    expect(readConventions(join(tmpdir(), "absent-manual.md"))).toBeNull();
  });
});

describe("addRule", () => {
  it("appends to the end of an existing section", () => {
    addRule(path, "Workflow", "Reassign to QA when the branch merges.");
    const lines = readFileSync(path, "utf8").split("\n");
    const workflow = lines.indexOf("## Workflow");
    expect(lines[workflow + 1]).toBe("- Move to `In progress` only once a branch exists.");
    expect(lines[workflow + 2]).toBe("- Reassign to QA when the branch merges.");
  });

  it("matches a heading case-insensitively", () => {
    addRule(path, "git / gitlab", "Rebase, never merge.");
    expect(readFileSync(path, "utf8")).toContain("- Rebase, never merge.\n\n## Workflow");
  });

  it("stops at a deeper subheading rather than writing past it", () => {
    addRule(path, "Workflow", "Reassign to QA when the branch merges.");
    const text = readFileSync(path, "utf8");
    expect(text.indexOf("- Reassign to QA")).toBeLessThan(text.indexOf("### Bugs"));
  });

  it("appends inside a subheading when named directly", () => {
    addRule(path, "Bugs", "Attach a screenshot.");
    const text = readFileSync(path, "utf8");
    expect(text.indexOf("- Attach a screenshot.")).toBeGreaterThan(text.indexOf("### Bugs"));
    expect(text.indexOf("- Attach a screenshot.")).toBeLessThan(text.indexOf("## Etiquette"));
  });

  it("creates a new section at the end when the heading is absent", () => {
    addRule(path, "Reviews", "Two approvals before merge.");
    expect(readFileSync(path, "utf8")).toMatch(/## Reviews\n\n- Two approvals before merge\.\n$/);
  });

  it("creates the file when no manual exists yet", () => {
    const fresh = join(mkdtempSync(join(tmpdir(), "operator-fresh-")), "conventions.md");
    addRule(fresh, "Git", "Branch from main.");
    expect(readFileSync(fresh, "utf8")).toBe("## Git\n\n- Branch from main.\n");
  });
});

describe("removeRule", () => {
  it("removes an exact bullet and backs the file up first", () => {
    const result = removeRule(path, "Workflow", "Move to `In progress` only once a branch exists.");
    expect(result.removed).toBe(true);
    expect(existsSync(result.backupPath!)).toBe(true);
    expect(readFileSync(result.backupPath!, "utf8")).toBe(MANUAL);
    expect(readFileSync(path, "utf8")).not.toContain("only once a branch exists");
  });

  it("changes nothing and reports the real bullets when the rule does not match", () => {
    const result = removeRule(path, "Workflow", "something that is not there");
    expect(result.removed).toBe(false);
    expect(result.backupPath).toBeUndefined();
    expect(result.bullets).toEqual(["Move to `In progress` only once a branch exists."]);
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });

  it("reports no bullets when the section does not exist", () => {
    const result = removeRule(path, "Nonexistent", "anything");
    expect(result).toEqual({ removed: false, bullets: [] });
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });

  it("will not remove a bullet from a different section", () => {
    const result = removeRule(path, "Etiquette", "Reproduce before assigning.");
    expect(result.removed).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/conventions.test.ts`
Expected: FAIL — cannot resolve `../src/conventions.js`.

- [ ] **Step 4: Implement `src/conventions.ts`**

```ts
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TEMPLATE_PATH = fileURLToPath(new URL("../templates/conventions.md", import.meta.url));

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const BULLET = /^\s*[-*]\s+/;

type Section = { start: number; end: number };

function findSection(lines: string[], name: string): Section | null {
  const wanted = name.trim().toLowerCase();
  for (let index = 0; index < lines.length; index++) {
    const heading = HEADING.exec(lines[index]);
    if (!heading || heading[2].trim().toLowerCase() !== wanted) continue;
    const level = heading[1].length;
    const next = lines.findIndex((line, offset) => {
      if (offset <= index) return false;
      const candidate = HEADING.exec(line);
      return candidate !== null && candidate[1].length <= level;
    });
    return { start: index, end: next === -1 ? lines.length : next };
  }
  return null;
}

function bulletText(line: string): string {
  return line.replace(BULLET, "").trim();
}

export function readConventions(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function addRule(path: string, section: string, rule: string): { section: string; rule: string; path: string } {
  const text = readConventions(path) ?? "";
  const bullet = `- ${rule.trim()}`;
  const lines = text.split("\n");
  const found = findSection(lines, section);

  if (!found) {
    const head = text.trimEnd();
    writeFileSync(path, `${head ? `${head}\n\n` : ""}## ${section}\n\n${bullet}\n`, { mode: 0o600 });
    return { section, rule, path };
  }

  let insertAt = found.end;
  while (insertAt > found.start + 1 && lines[insertAt - 1].trim() === "") insertAt--;
  lines.splice(insertAt, 0, bullet);
  writeFileSync(path, lines.join("\n"), { mode: 0o600 });
  return { section, rule, path };
}

export function removeRule(
  path: string,
  section: string,
  rule: string,
): { removed: boolean; backupPath?: string; bullets: string[] } {
  const text = readConventions(path);
  if (text === null) return { removed: false, bullets: [] };

  const lines = text.split("\n");
  const found = findSection(lines, section);
  if (!found) return { removed: false, bullets: [] };

  const bullets = lines.slice(found.start + 1, found.end).filter((line) => BULLET.test(line)).map(bulletText);
  const target = rule.trim();
  const index = lines.findIndex(
    (line, offset) => offset > found.start && offset < found.end && BULLET.test(line) && bulletText(line) === target,
  );
  if (index === -1) return { removed: false, bullets };

  const backupPath = `${path}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  copyFileSync(path, backupPath);
  lines.splice(index, 1);
  writeFileSync(path, lines.join("\n"), { mode: 0o600 });
  return { removed: true, backupPath, bullets };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/conventions.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: read, append to, and safely prune the conventions manual"
```

---

## Task 5: MCP server, instructions, and identity tools

This task produces the first runnable server. At the end of it you can connect a real MCP client and call `whoami`.

**Files:**
- Create: `src/tools/shared.ts`, `src/tools/identity.ts`, `src/server.ts`, `src/index.ts`
- Create: `test/support/harness.ts`
- Test: `test/server.test.ts`, `test/tools/identity.test.ts`

**Interfaces:**
- Consumes: `Config`, `loadConfig` from `src/config.js`; `OpenProjectClient`, `Identity` from `src/client.js`; `readConventions` from `src/conventions.js`; `flattenProject` from `src/hal.js`.
- Produces:
  - `type ToolContext = { client: OpenProjectClient }`
  - `jsonResult(value: unknown)` and `errorResult(message: string)` — MCP tool result shapes.
  - `handler<Args>(run: (args: Args) => Promise<unknown>)` — wraps a tool body, serializing the return value and converting any throw into an `isError` result.
  - `registerIdentityTools(server: McpServer, context: ToolContext): void`
  - `buildInstructions(config: Config, identity: Identity | null, manual: string | null): string`
  - `createServer(config: Config): Promise<McpServer>`
  - Test harness: `connect(config): Promise<Client>` and `callTool(client, name, args?)`.

Every later task registers its tools by adding one `register*Tools(server, { client })` call inside `createServer` and one module under `src/tools/`.

- [ ] **Step 1: Write `src/tools/shared.ts`**

There is no test-first cycle for this file; it is the vocabulary the tests in this task are written against, and it is exercised by every tool test that follows.

```ts
import type { OpenProjectClient } from "../client.js";
import { humanMessage } from "../errors.js";

export type ToolContext = { client: OpenProjectClient };

export function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function handler<Args>(run: (args: Args) => Promise<unknown>) {
  return async (args: Args) => {
    try {
      return jsonResult(await run(args));
    } catch (error) {
      return errorResult(humanMessage(error));
    }
  };
}
```

- [ ] **Step 2: Write the test harness**

`test/support/harness.ts`:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import type { Config } from "../../src/config.js";

export const testConfig: Config = {
  profile: "test",
  url: "https://op.acme.com",
  apiKey: "secret",
  conventionsPath: "/nonexistent/conventions.md",
  readOnly: false,
};

export async function connect(config: Config = testConfig): Promise<Client> {
  const server = await createServer(config);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
  return {
    isError: result.isError === true,
    text,
    json: () => JSON.parse(text) as any,
  };
}
```

If `InMemoryTransport` is not exported from `@modelcontextprotocol/sdk/inMemory.js` in the installed version, find its path with `ls node_modules/@modelcontextprotocol/sdk/dist/esm/` and correct the import. Do not replace the harness with hand-rolled mocks — calling tools through a real client is what makes every later tool test meaningful.

- [ ] **Step 3: Write the failing tests**

`test/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildInstructions } from "../src/server.js";
import type { Config } from "../src/config.js";

const config: Config = {
  profile: "acme",
  url: "https://op.acme.com",
  apiKey: "secret",
  conventionsPath: "/tmp/conventions.md",
  readOnly: false,
};

const identity = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };

describe("buildInstructions", () => {
  it("names the user, instance and profile", () => {
    expect(buildInstructions(config, identity, null)).toContain(
      'You are Daniel Escalona (daescalona@proton.me) on https://op.acme.com, profile "acme".',
    );
  });

  it("carries the manual verbatim", () => {
    const manual = "## Git\n- Branch: `{type}/{wp-id}-{slug}`";
    const instructions = buildInstructions(config, identity, manual);
    expect(instructions).toContain("Follow these conventions in all OpenProject work:");
    expect(instructions).toContain("- Branch: `{type}/{wp-id}-{slug}`");
  });

  it("never truncates a large manual", () => {
    const manual = `## Rules\n${"- a rule\n".repeat(5000)}`;
    expect(buildInstructions(config, identity, manual)).toContain(manual.trim());
  });

  it("mentions the default project when configured", () => {
    expect(buildInstructions({ ...config, defaultProject: "website" }, identity, null)).toContain(
      "Default project: website.",
    );
  });

  it("announces read-only mode", () => {
    expect(buildInstructions({ ...config, readOnly: true }, identity, null)).toContain("This server is read-only.");
  });

  it("degrades gracefully when identity could not be resolved", () => {
    const instructions = buildInstructions(config, null, "## Git\n- Rebase.");
    expect(instructions).toContain("Identity is unresolved");
    expect(instructions).toContain("- Rebase.");
  });

  it("omits the conventions block when there is no manual", () => {
    expect(buildInstructions(config, identity, null)).not.toContain("Follow these conventions");
    expect(buildInstructions(config, identity, "   ")).not.toContain("Follow these conventions");
  });
});
```

`test/tools/identity.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };

const PROJECTS = {
  total: 2,
  count: 2,
  _embedded: {
    elements: [
      { id: 3, name: "Website", identifier: "website", active: true, _links: {} },
      { id: 4, name: "Intranet", identifier: "intranet", active: true, _links: {} },
    ],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: "no route" }, 404);
  });
}

describe("whoami", () => {
  it("reports identity and connection state", async () => {
    routes({ "/users/me": ME });
    const client = await connect({ ...testConfig, defaultProject: "website" });

    expect((await callTool(client, "whoami")).json()).toEqual({
      user: "Daniel Escalona",
      email: "daescalona@proton.me",
      userId: 12,
      instanceUrl: "https://op.acme.com",
      profile: "test",
      defaultProject: "website",
      readOnly: false,
      conventionsLoaded: false,
    });
  });

  it("reports read-only mode so an agent can plan around it", async () => {
    routes({ "/users/me": ME });
    const client = await connect({ ...testConfig, readOnly: true });
    expect((await callTool(client, "whoami")).json().readOnly).toBe(true);
  });

  it("returns a readable error when the key is rejected", async () => {
    fetchMock.mockResolvedValue(respond({}, 401));
    const client = await connect();
    const result = await callTool(client, "whoami");

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      "API key rejected by https://op.acme.com — regenerate at https://op.acme.com/my/access_token",
    );
  });

  it("returns the setup instruction when unconfigured", async () => {
    const client = await connect({ ...testConfig, url: "", apiKey: "" });
    const result = await callTool(client, "whoami");

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Not configured. Run: npx openproject-mcp setup");
  });
});

describe("list_projects", () => {
  it("flattens every visible project", async () => {
    routes({ "/users/me": ME, "/projects": PROJECTS });
    const client = await connect();

    expect((await callTool(client, "list_projects")).json()).toEqual([
      { id: 3, name: "Website", identifier: "website", active: true, description: undefined, url: "https://op.acme.com/projects/website" },
      { id: 4, name: "Intranet", identifier: "intranet", active: true, description: undefined, url: "https://op.acme.com/projects/intranet" },
    ]);
  });

  it("filters by name, case-insensitively", async () => {
    routes({ "/users/me": ME, "/projects": PROJECTS });
    const client = await connect();
    const found = (await callTool(client, "list_projects", { query: "intra" })).json();

    expect(found).toHaveLength(1);
    expect(found[0].identifier).toBe("intranet");
  });
});

describe("list_users", () => {
  const assignees = {
    total: 1, count: 1,
    _embedded: { elements: [{ id: 12, name: "Daniel Escalona", email: "daescalona@proton.me", _links: {} }] },
  };

  it("uses available_assignees when a project is given", async () => {
    routes({ "/users/me": ME, "/projects/website/available_assignees": assignees });
    const client = await connect();

    expect((await callTool(client, "list_users", { project: "website" })).json()).toEqual([
      { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" },
    ]);
  });

  it("falls back to the default project", async () => {
    routes({ "/users/me": ME, "/projects/website/available_assignees": assignees });
    const client = await connect({ ...testConfig, defaultProject: "website" });

    expect((await callTool(client, "list_users")).json()).toHaveLength(1);
  });

  it("queries principals when no project is in play", async () => {
    routes({ "/users/me": ME, "/principals": assignees });
    const client = await connect();

    expect((await callTool(client, "list_users")).json()).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run test/server.test.ts test/tools/identity.test.ts`
Expected: FAIL — cannot resolve `../src/server.js`.

- [ ] **Step 5: Implement `src/tools/identity.ts`**

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readConventions } from "../conventions.js";
import { flattenProject } from "../hal.js";
import { handler, type ToolContext } from "./shared.js";

export function registerIdentityTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Identity and connection state. Call this first: it tells you which user you are acting as, which OpenProject instance you are on, the default project, whether writes are permitted, and whether this workplace has a conventions manual.",
      inputSchema: {},
    },
    handler(async () => {
      const identity = await client.me();
      return {
        user: identity.name,
        email: identity.email,
        userId: identity.id,
        instanceUrl: config.url,
        profile: config.profile,
        defaultProject: config.defaultProject,
        readOnly: config.readOnly,
        conventionsLoaded: readConventions(config.conventionsPath) !== null,
      };
    }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Projects visible to you. Use the `identifier` value wherever a tool asks for a project.",
      inputSchema: {
        query: z.string().optional().describe("Case-insensitive substring matched against the project name."),
      },
    },
    handler(async ({ query }: { query?: string }) => {
      const { elements } = await client.collection("/projects", { pageSize: 200 });
      const projects = elements.map((project) => flattenProject(project, config.url));
      if (!query) return projects;
      const needle = query.toLowerCase();
      return projects.filter((project) => String(project.name).toLowerCase().includes(needle));
    }),
  );

  server.registerTool(
    "list_users",
    {
      title: "List users",
      description:
        "People you can assign work to. Pass a project to get exactly its assignable members; omit it to search everyone visible to you.",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe("Project identifier or numeric id. Falls back to the configured default project."),
        query: z.string().optional().describe("Case-insensitive substring matched against name or email."),
      },
    },
    handler(async ({ project, query }: { project?: string; query?: string }) => {
      const target = project ?? config.defaultProject;
      const { elements } = target
        ? await client.collection(`/projects/${target}/available_assignees`, { pageSize: 200 })
        : await client.collection("/principals", { pageSize: 200 });
      const users = elements.map((user) => ({ id: user.id, name: user.name, email: user.email }));
      if (!query) return users;
      const needle = query.toLowerCase();
      return users.filter((user) => `${user.name} ${user.email ?? ""}`.toLowerCase().includes(needle));
    }),
  );
}
```

- [ ] **Step 6: Implement `src/server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenProjectClient, type Identity } from "./client.js";
import type { Config } from "./config.js";
import { readConventions } from "./conventions.js";
import { registerIdentityTools } from "./tools/identity.js";

const MANUAL_WARNING_BYTES = 10_000;

export function buildInstructions(config: Config, identity: Identity | null, manual: string | null): string {
  const lines = [
    identity
      ? `You are ${identity.name} (${identity.email}) on ${config.url}, profile "${config.profile}".`
      : `OpenProject server, profile "${config.profile}". Identity is unresolved — call whoami to find out why.`,
  ];
  if (config.defaultProject) lines.push(`Default project: ${config.defaultProject}.`);
  if (config.readOnly) lines.push("This server is read-only. No changes can be made.");
  if (manual?.trim()) lines.push("", "Follow these conventions in all OpenProject work:", "", manual.trim());
  return lines.join("\n");
}

export async function createServer(config: Config): Promise<McpServer> {
  const client = new OpenProjectClient(config);
  const identity = await client.me().catch(() => null);
  const manual = readConventions(config.conventionsPath);

  const bytes = manual ? Buffer.byteLength(manual) : 0;
  if (bytes > MANUAL_WARNING_BYTES) {
    process.stderr.write(`openproject-mcp: conventions manual is ${bytes} bytes and is sent on every session.\n`);
  }

  const server = new McpServer(
    { name: "openproject", version: "0.1.0" },
    { instructions: buildInstructions(config, identity, manual) },
  );

  registerIdentityTools(server, { client });
  return server;
}
```

- [ ] **Step 7: Implement `src/index.ts`**

The `setup` branch is added in Task 13; until then the command prints a placeholder that is replaced, not extended.

```ts
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const server = await createServer(loadConfig());
await server.connect(new StdioServerTransport());
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, all suites.

- [ ] **Step 9: Verify the server actually starts over stdio**

```bash
npx tsc
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  | OPENPROJECT_URL=https://op.invalid OPENPROJECT_API_KEY=x node dist/index.js
```

Expected: a single JSON-RPC response on stdout whose `result.instructions` mentions `Identity is unresolved`. This confirms the deliberate design decision that an unreachable instance still yields a working server rather than a crash.

- [ ] **Step 10: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: MCP server with conventions instructions and identity tools"
```

---

## Task 6: The `api_request` escape hatch

Placed early so that every later milestone has a complete fallback: anything a curated tool cannot yet do is already reachable.

**Files:**
- Create: `src/tools/raw.ts`
- Modify: `src/server.ts` — add the `registerRawTools(server, { client })` call after `registerIdentityTools`, and its import.
- Test: `test/tools/raw.test.ts`

**Interfaces:**
- Consumes: `handler`, `ToolContext` from `src/tools/shared.js`.
- Produces: `registerRawTools(server: McpServer, context: ToolContext): void`

- [ ] **Step 1: Write the failing test**

`test/tools/raw.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";

let fetchMock: ReturnType<typeof vi.fn>;

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(respond({ id: 12, name: "Daniel Escalona", email: "d@e.me" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("api_request", () => {
  it("returns the raw HAL response unflattened", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ _type: "Type", id: 7, _links: { self: { href: "/api/v3/types/7" } } }));

    expect((await callTool(client, "api_request", { method: "GET", path: "/types/7" })).json()).toEqual({
      _type: "Type",
      id: 7,
      _links: { self: { href: "/api/v3/types/7" } },
    });
  });

  it("accepts a path without a leading slash", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ ok: true }));
    await callTool(client, "api_request", { method: "GET", path: "statuses" });

    expect(fetchMock.mock.lastCall![0].toString()).toBe("https://op.acme.com/api/v3/statuses");
  });

  it("passes query parameters through untouched", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0 }));
    await callTool(client, "api_request", {
      method: "GET",
      path: "/work_packages",
      query: { filters: '[{"id":{"operator":"=","values":["1"]}}]' },
    });

    expect((fetchMock.mock.lastCall![0] as URL).searchParams.get("filters")).toBe(
      '[{"id":{"operator":"=","values":["1"]}}]',
    );
  });

  it("sends a body on POST", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ id: 99 }));
    await callTool(client, "api_request", {
      method: "POST",
      path: "/work_packages/1234/watchers",
      body: { user: { href: "/api/v3/users/12" } },
    });

    expect(JSON.parse(fetchMock.mock.lastCall![1].body)).toEqual({ user: { href: "/api/v3/users/12" } });
  });

  it("reports a plain acknowledgement for an empty 204 response", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond(null, 204));

    expect((await callTool(client, "api_request", { method: "DELETE", path: "/work_packages/1234/watchers/12" })).json())
      .toEqual({ ok: true });
  });

  it("is blocked for writes in read-only mode", async () => {
    const client = await connect({ ...testConfig, readOnly: true });
    const result = await callTool(client, "api_request", { method: "DELETE", path: "/work_packages/1234" });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  });

  it("still allows reads in read-only mode", async () => {
    const client = await connect({ ...testConfig, readOnly: true });
    fetchMock.mockResolvedValue(respond({ id: 7 }));

    expect((await callTool(client, "api_request", { method: "GET", path: "/types/7" })).isError).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tools/raw.test.ts`
Expected: FAIL — `Tool api_request not found`.

- [ ] **Step 3: Implement `src/tools/raw.ts`**

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handler, type ToolContext } from "./shared.js";

type RawArgs = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

export function registerRawTools(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    "api_request",
    {
      title: "Raw OpenProject APIv3 request",
      description:
        "Escape hatch for anything the other tools do not cover, including deletion. Returns the raw HAL+JSON response, unflattened. Prefer a dedicated tool when one exists — this one requires you to know APIv3 request shapes, and its responses are large.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PATCH", "DELETE"]).describe("HTTP method."),
        path: z
          .string()
          .describe("Path relative to /api/v3. Example: /work_packages/1234/watchers"),
        query: z
          .record(z.string())
          .optional()
          .describe("Query parameters. Encode `filters` and `sortBy` yourself, as JSON strings."),
        body: z.record(z.unknown()).optional().describe("JSON request body."),
      },
    },
    handler(async ({ method, path, query, body }: RawArgs) => {
      const result = await client.request(method, path.startsWith("/") ? path : `/${path}`, { query, body });
      return result ?? { ok: true };
    }),
  );
}
```

- [ ] **Step 4: Register it in `src/server.ts`**

Add the import beside the existing tool import, and the call beneath `registerIdentityTools`:

```ts
import { registerRawTools } from "./tools/raw.js";
```

```ts
  registerIdentityTools(server, { client });
  registerRawTools(server, { client });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: api_request escape hatch for uncovered APIv3 endpoints"
```

---

## Task 7: Metadata lookup and reference resolution

Every write tool needs to turn `"Bug"` or `"In progress"` into an APIv3 href. This task builds that once.

**Files:**
- Create: `src/resolve.ts`, `src/tools/meta.ts`
- Modify: `src/server.ts` — register the meta tools.
- Test: `test/resolve.test.ts`, `test/tools/meta.test.ts`

**Interfaces:**
- Consumes: `OpenProjectClient` from `src/client.js`.
- Produces:
  - `type MetaKind = "types" | "statuses" | "priorities" | "activities"`
  - `listMetadata(client: OpenProjectClient, kind: MetaKind, project?: string): Promise<{ id: number; name: string }[]>`
  - `resolveHref(client: OpenProjectClient, kind: MetaKind, value: string | number, project?: string): Promise<string>`
  - `resolveId(client: OpenProjectClient, kind: MetaKind, value: string | number, project?: string): Promise<string>`
  - `resolveUserHref(client: OpenProjectClient, value: string | number, project?: string): Promise<string>`
  - `clearMetadataCache(): void` — test seam only.
  - `registerMetaTools(server: McpServer, context: ToolContext): void`

Metadata is cached for the process lifetime, keyed by instance URL and path. It effectively never changes, and every write would otherwise re-fetch it.

- [ ] **Step 1: Write the failing tests**

`test/resolve.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OpenProjectClient } from "../src/client.js";
import { listMetadata, resolveHref, resolveId, resolveUserHref, clearMetadataCache } from "../src/resolve.js";
import type { Config } from "../src/config.js";

const config: Config = {
  profile: "test", url: "https://op.acme.com", apiKey: "secret",
  conventionsPath: "/nonexistent", readOnly: false,
};

const TYPES = { total: 2, count: 2, _embedded: { elements: [{ id: 1, name: "Task" }, { id: 7, name: "Bug" }] } };
const STATUSES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "In progress" }] } };

let fetchMock: ReturnType<typeof vi.fn>;

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function client() {
  return new OpenProjectClient(config);
}

describe("listMetadata", () => {
  it("reduces each resource to id and name", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    expect(await listMetadata(client(), "types")).toEqual([{ id: 1, name: "Task" }, { id: 7, name: "Bug" }]);
  });

  it("maps activities to the time entry endpoint", async () => {
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0, _embedded: { elements: [] } }));
    await listMetadata(client(), "activities");
    expect(fetchMock.mock.lastCall![0].toString()).toBe("https://op.acme.com/api/v3/time_entries/activities");
  });

  it("scopes types to a project when one is given", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    await listMetadata(client(), "types", "website");
    expect(fetchMock.mock.lastCall![0].toString()).toBe("https://op.acme.com/api/v3/projects/website/types");
  });

  it("caches across calls", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    const shared = client();
    await listMetadata(shared, "types");
    await listMetadata(shared, "types");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("resolveHref", () => {
  it("accepts a numeric id without any lookup", async () => {
    expect(await resolveHref(client(), "types", 7)).toBe("/api/v3/types/7");
    expect(await resolveHref(client(), "types", "7")).toBe("/api/v3/types/7");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a name, case-insensitively", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    expect(await resolveHref(client(), "types", "bug")).toBe("/api/v3/types/7");
  });

  it("uses the time entry path for activities", async () => {
    fetchMock.mockResolvedValue(respond({ total: 1, count: 1, _embedded: { elements: [{ id: 3, name: "Development" }] } }));
    expect(await resolveHref(client(), "activities", "Development")).toBe("/api/v3/time_entries/activities/3");
  });

  it("lists the valid options when a name does not match", async () => {
    fetchMock.mockResolvedValue(respond(STATUSES));
    await expect(resolveHref(client(), "statuses", "Doing")).rejects.toThrow(
      'No status named "Doing". Available: In progress',
    );
  });
});

describe("resolveId", () => {
  it("returns the trailing id of the href", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    expect(await resolveId(client(), "types", "Bug")).toBe("7");
  });
});

describe("resolveUserHref", () => {
  it("turns 'me' into the authenticated user", async () => {
    fetchMock.mockResolvedValue(respond({ id: 12, name: "Daniel Escalona", email: "d@e.me" }));
    expect(await resolveUserHref(client(), "me")).toBe("/api/v3/users/12");
  });

  it("accepts a numeric id directly", async () => {
    expect(await resolveUserHref(client(), 12)).toBe("/api/v3/users/12");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks a name up among a project's assignable people", async () => {
    fetchMock.mockResolvedValue(respond({
      total: 1, count: 1,
      _embedded: { elements: [{ id: 5, name: "Ana Ruiz", email: "ana@acme.com" }] },
    }));
    expect(await resolveUserHref(client(), "Ana Ruiz", "website")).toBe("/api/v3/users/5");
    expect(fetchMock.mock.lastCall![0].toString()).toBe(
      "https://op.acme.com/api/v3/projects/website/available_assignees",
    );
  });

  it("matches on email too", async () => {
    fetchMock.mockResolvedValue(respond({
      total: 1, count: 1,
      _embedded: { elements: [{ id: 5, name: "Ana Ruiz", email: "ana@acme.com" }] },
    }));
    expect(await resolveUserHref(client(), "ana@acme.com", "website")).toBe("/api/v3/users/5");
  });

  it("explains when nobody matches", async () => {
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0, _embedded: { elements: [] } }));
    await expect(resolveUserHref(client(), "Nobody", "website")).rejects.toThrow('No user matching "Nobody"');
  });
});
```

`test/tools/meta.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";

let fetchMock: ReturnType<typeof vi.fn>;

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn().mockResolvedValue(respond({ id: 12, name: "Daniel Escalona", email: "d@e.me" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("list_metadata", () => {
  it("returns ids and names", async () => {
    const client = await connect();
    fetchMock.mockResolvedValue(respond({ total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "Bug" }] } }));

    expect((await callTool(client, "list_metadata", { kind: "types" })).json()).toEqual([{ id: 7, name: "Bug" }]);
  });

  it("scopes types to the configured default project", async () => {
    const client = await connect({ ...testConfig, defaultProject: "website" });
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0, _embedded: { elements: [] } }));
    await callTool(client, "list_metadata", { kind: "types" });

    expect(fetchMock.mock.lastCall![0].toString()).toBe("https://op.acme.com/api/v3/projects/website/types");
  });

  it("rejects an unknown kind before making a request", async () => {
    const client = await connect();
    expect((await callTool(client, "list_metadata", { kind: "wombats" })).isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/resolve.test.ts test/tools/meta.test.ts`
Expected: FAIL — cannot resolve `../src/resolve.js`.

- [ ] **Step 3: Implement `src/resolve.ts`**

```ts
import type { OpenProjectClient } from "./client.js";
import { flattenNamed } from "./hal.js";

export type MetaKind = "types" | "statuses" | "priorities" | "activities";

type Named = { id: number; name: string };

const PATHS: Record<MetaKind, string> = {
  types: "/types",
  statuses: "/statuses",
  priorities: "/priorities",
  activities: "/time_entries/activities",
};

const cache = new Map<string, Named[]>();

export function clearMetadataCache(): void {
  cache.clear();
}

function pathFor(kind: MetaKind, project?: string): string {
  return kind === "types" && project ? `/projects/${project}/types` : PATHS[kind];
}

export async function listMetadata(client: OpenProjectClient, kind: MetaKind, project?: string): Promise<Named[]> {
  const path = pathFor(kind, project);
  const key = `${client.config.url}${path}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { elements } = await client.collection(path, { pageSize: 200 });
  const named = elements.map(flattenNamed);
  cache.set(key, named);
  return named;
}

function isNumeric(value: string | number): boolean {
  return /^\d+$/.test(String(value));
}

export async function resolveHref(
  client: OpenProjectClient,
  kind: MetaKind,
  value: string | number,
  project?: string,
): Promise<string> {
  const base = `/api/v3${PATHS[kind]}`;
  if (isNumeric(value)) return `${base}/${value}`;

  const entries = await listMetadata(client, kind, project);
  const needle = String(value).trim().toLowerCase();
  const match = entries.find((entry) => entry.name.toLowerCase() === needle);
  if (!match) {
    const singular = kind === "activities" ? "activity" : kind.replace(/s$/, "");
    throw new Error(`No ${singular} named "${value}". Available: ${entries.map((entry) => entry.name).join(", ")}`);
  }
  return `${base}/${match.id}`;
}

export async function resolveId(
  client: OpenProjectClient,
  kind: MetaKind,
  value: string | number,
  project?: string,
): Promise<string> {
  const href = await resolveHref(client, kind, value, project);
  return href.slice(href.lastIndexOf("/") + 1);
}

export async function resolveUserHref(
  client: OpenProjectClient,
  value: string | number,
  project?: string,
): Promise<string> {
  if (value === "me") return `/api/v3/users/${(await client.me()).id}`;
  if (isNumeric(value)) return `/api/v3/users/${value}`;

  const path = project ? `/projects/${project}/available_assignees` : "/principals";
  const { elements } = await client.collection(path, { pageSize: 200 });
  const needle = String(value).trim().toLowerCase();
  const match = elements.find(
    (user) => String(user.name ?? "").toLowerCase() === needle || String(user.email ?? "").toLowerCase() === needle,
  );
  if (!match) throw new Error(`No user matching "${value}". Use list_users to see who is available.`);
  return `/api/v3/users/${match.id}`;
}
```

- [ ] **Step 4: Implement `src/tools/meta.ts`**

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listMetadata, type MetaKind } from "../resolve.js";
import { handler, type ToolContext } from "./shared.js";

export function registerMetaTools(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    "list_metadata",
    {
      title: "List metadata",
      description:
        "Ids and names for work package types, statuses, priorities, or time entry activities. Call this when a write is rejected for an unknown value, or when you need the exact wording this instance uses.",
      inputSchema: {
        kind: z
          .enum(["types", "statuses", "priorities", "activities"])
          .describe("Which list to fetch. `activities` means time entry activities."),
        project: z
          .string()
          .optional()
          .describe("Restrict types to one project. Ignored for the other kinds."),
      },
    },
    handler(({ kind, project }: { kind: MetaKind; project?: string }) =>
      listMetadata(client, kind, project ?? client.config.defaultProject),
    ),
  );
}
```

- [ ] **Step 5: Register it in `src/server.ts`**

```ts
import { registerMetaTools } from "./tools/meta.js";
```

```ts
  registerMetaTools(server, { client });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: metadata lookup and name-to-href resolution"
```

---

## Task 8: Work package read tools

**Files:**
- Create: `src/tools/workPackages.ts`
- Modify: `src/server.ts` — register the work package tools.
- Test: `test/tools/workPackages.test.ts`

**Interfaces:**
- Consumes: `resolveId` from `src/resolve.js`; `flattenWorkPackage` from `src/hal.js`; `Filter` and `OpenProjectClient` from `src/client.js`.
- Produces:
  - `buildSearchFilters(client: OpenProjectClient, args: SearchArgs): Promise<Filter[]>` — exported because `my_work` and the live smoke suite both build filters through it.
  - `type SearchArgs` — the argument shape shared by `search_work_packages` and `buildSearchFilters`.
  - `registerWorkPackageTools(server: McpServer, context: ToolContext): void` registering `get_work_package`, `search_work_packages`, `my_work`.

- [ ] **Step 1: Write the failing test**

`test/tools/workPackages.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";
import workPackage from "../fixtures/workPackage.json" with { type: "json" };

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };
const TYPES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "Bug" }] } };
const STATUSES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "In progress" }] } };
const RESULTS = { total: 1, count: 1, _embedded: { elements: [workPackage] } };

let fetchMock: ReturnType<typeof vi.fn>;

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: `no route for ${url.pathname}` }, 404);
  });
}

function lastQuery(key: string): string | null {
  return (fetchMock.mock.lastCall![0] as URL).searchParams.get(key);
}

function filtersOf(): any[] {
  return JSON.parse(lastQuery("filters") ?? "[]");
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("get_work_package", () => {
  it("returns a flattened work package including its description", async () => {
    routes({ "/users/me": ME, "/work_packages/1234": workPackage });
    const client = await connect();
    const result = (await callTool(client, "get_work_package", { id: 1234 })).json();

    expect(result).toMatchObject({
      id: 1234, subject: "Fix login redirect", type: "Bug", status: "In progress",
      assignee: "Daniel Escalona", lockVersion: 7, url: "https://op.acme.com/work_packages/1234",
    });
    expect(result.description).toContain("Users land on /dashboard");
  });

  it("explains a missing work package", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    const result = await callTool(client, "get_work_package", { id: 9999 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("no route for /api/v3/work_packages/9999");
  });
});

describe("search_work_packages", () => {
  it("queries the project path rather than a project filter, so identifiers work", async () => {
    routes({ "/users/me": ME, "/projects/website/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { project: "website" });

    expect((fetchMock.mock.lastCall![0] as URL).pathname).toBe("/api/v3/projects/website/work_packages");
  });

  it("uses the operator form for open and closed", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();

    await callTool(client, "search_work_packages", { status: "open" });
    expect(filtersOf()).toContainEqual({ status: { operator: "o", values: [] } });

    await callTool(client, "search_work_packages", { status: "closed" });
    expect(filtersOf()).toContainEqual({ status: { operator: "c", values: [] } });
  });

  it("resolves any other status name to its id", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS, "/statuses": STATUSES });
    const client = await connect();
    await callTool(client, "search_work_packages", { status: "In progress" });

    expect(filtersOf()).toContainEqual({ status: { operator: "=", values: ["7"] } });
  });

  it("passes 'me' through to OpenProject untranslated", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { assignee: "me" });

    expect(filtersOf()).toContainEqual({ assignee: { operator: "=", values: ["me"] } });
  });

  it("resolves a type name to its id", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS, "/types": TYPES });
    const client = await connect();
    await callTool(client, "search_work_packages", { type: "Bug" });

    expect(filtersOf()).toContainEqual({ type: { operator: "=", values: ["7"] } });
  });

  it("builds a full text filter", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { query: "login" });

    expect(filtersOf()).toContainEqual({ search: { operator: "**", values: ["login"] } });
  });

  it("builds an updatedSince filter", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { updatedSince: "2026-07-01" });

    expect(filtersOf()).toContainEqual({ updatedAt: { operator: ">d", values: ["2026-07-01"] } });
  });

  it("sends no filters parameter when nothing was asked for", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", {});

    expect(lastQuery("filters")).toBeNull();
  });

  it("returns the total alongside flattened results without descriptions", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    const result = (await callTool(client, "search_work_packages", {})).json();

    expect(result.total).toBe(1);
    expect(result.results[0].subject).toBe("Fix login redirect");
    expect(result.results[0].description).toBeUndefined();
  });

  it("caps the page size at 100", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { limit: 5000 });

    expect(lastQuery("pageSize")).toBe("100");
  });

  it("sorts on request", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "search_work_packages", { sortBy: "updatedAt", sortDirection: "desc" });

    expect(lastQuery("sortBy")).toBe('[["updatedAt","desc"]]');
  });
});

describe("my_work", () => {
  it("asks for open work assigned to me, soonest due first", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    const result = (await callTool(client, "my_work")).json();

    expect(filtersOf()).toEqual([
      { assignee: { operator: "=", values: ["me"] } },
      { status: { operator: "o", values: [] } },
    ]);
    expect(lastQuery("sortBy")).toBe('[["dueDate","asc"]]');
    expect(result).toHaveLength(1);
  });

  it("can ask for closed work instead", async () => {
    routes({ "/users/me": ME, "/work_packages": RESULTS });
    const client = await connect();
    await callTool(client, "my_work", { status: "closed" });

    expect(filtersOf()).toContainEqual({ status: { operator: "c", values: [] } });
  });

  it("stays within the default project when one is configured", async () => {
    routes({ "/users/me": ME, "/projects/website/work_packages": RESULTS });
    const client = await connect({ ...testConfig, defaultProject: "website" });
    await callTool(client, "my_work");

    expect((fetchMock.mock.lastCall![0] as URL).pathname).toBe("/api/v3/projects/website/work_packages");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tools/workPackages.test.ts`
Expected: FAIL — `Tool get_work_package not found`.

- [ ] **Step 3: Implement `src/tools/workPackages.ts`**

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Filter, OpenProjectClient } from "../client.js";
import { flattenWorkPackage } from "../hal.js";
import { resolveId } from "../resolve.js";
import { handler, type ToolContext } from "./shared.js";

const MAX_PAGE_SIZE = 100;

export type SearchArgs = {
  project?: string;
  assignee?: string;
  status?: string;
  type?: string;
  priority?: string;
  query?: string;
  updatedSince?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  limit?: number;
};

// OpenProject expresses "any open status" and "any closed status" as filter
// operators with no values, not as status names.
async function statusFilter(client: OpenProjectClient, status: string, project?: string): Promise<Filter> {
  if (status === "open") return { status: { operator: "o", values: [] } };
  if (status === "closed") return { status: { operator: "c", values: [] } };
  return { status: { operator: "=", values: [await resolveId(client, "statuses", status, project)] } };
}

export async function buildSearchFilters(client: OpenProjectClient, args: SearchArgs): Promise<Filter[]> {
  const filters: Filter[] = [];
  if (args.assignee) filters.push({ assignee: { operator: "=", values: [args.assignee] } });
  if (args.status) filters.push(await statusFilter(client, args.status, args.project));
  if (args.type) filters.push({ type: { operator: "=", values: [await resolveId(client, "types", args.type, args.project)] } });
  if (args.priority) filters.push({ priority: { operator: "=", values: [await resolveId(client, "priorities", args.priority)] } });
  if (args.query) filters.push({ search: { operator: "**", values: [args.query] } });
  if (args.updatedSince) filters.push({ updatedAt: { operator: ">d", values: [args.updatedSince] } });
  return filters;
}

function collectionPath(project?: string): string {
  return project ? `/projects/${project}/work_packages` : "/work_packages";
}

export function registerWorkPackageTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "get_work_package",
    {
      title: "Get a work package",
      description: "Full detail for one work package, including its description and the lockVersion an update needs.",
      inputSchema: { id: z.number().int().describe("Work package id.") },
    },
    handler(async ({ id }: { id: number }) => {
      const wp = await client.request("GET", `/work_packages/${id}`);
      return flattenWorkPackage(wp, config.url, { includeDescription: true });
    }),
  );

  server.registerTool(
    "search_work_packages",
    {
      title: "Search work packages",
      description:
        "Find work packages by project, assignee, status, type, priority, text, or recency. Descriptions are omitted; use get_work_package for one item's full detail.",
      inputSchema: {
        project: z.string().optional().describe("Project identifier or id. Defaults to the configured default project."),
        assignee: z.string().optional().describe('Assignee. Use "me" for yourself, otherwise a numeric user id.'),
        status: z
          .string()
          .optional()
          .describe('"open" or "closed" match any status of that kind. Any other value is a status name or id.'),
        type: z.string().optional().describe('Type name or id, for example "Bug".'),
        priority: z.string().optional().describe('Priority name or id, for example "High".'),
        query: z.string().optional().describe("Full text search across subject and description."),
        updatedSince: z.string().optional().describe("ISO date. Returns work packages changed on or after it."),
        sortBy: z.string().optional().describe('Field to sort on, for example "dueDate" or "updatedAt".'),
        sortDirection: z.enum(["asc", "desc"]).optional().describe("Sort direction. Defaults to asc."),
        limit: z.number().int().positive().optional().describe("Maximum results, capped at 100. Defaults to 25."),
      },
    },
    handler(async (args: SearchArgs) => {
      const project = args.project ?? config.defaultProject;
      const { total, elements } = await client.collection(collectionPath(project), {
        filters: await buildSearchFilters(client, { ...args, project }),
        pageSize: Math.min(args.limit ?? 25, MAX_PAGE_SIZE),
        sortBy: args.sortBy ? [[args.sortBy, args.sortDirection ?? "asc"]] : undefined,
      });
      return { total, results: elements.map((wp) => flattenWorkPackage(wp, config.url)) };
    }),
  );

  server.registerTool(
    "my_work",
    {
      title: "My work",
      description: "Work packages assigned to you, soonest due first. The usual starting point for a working session.",
      inputSchema: {
        status: z.enum(["open", "closed"]).optional().describe("Defaults to open."),
        limit: z.number().int().positive().optional().describe("Maximum results, capped at 100. Defaults to 50."),
      },
    },
    handler(async ({ status, limit }: { status?: "open" | "closed"; limit?: number }) => {
      const project = config.defaultProject;
      const { elements } = await client.collection(collectionPath(project), {
        filters: await buildSearchFilters(client, { assignee: "me", status: status ?? "open", project }),
        pageSize: Math.min(limit ?? 50, MAX_PAGE_SIZE),
        sortBy: [["dueDate", "asc"]],
      });
      return elements.map((wp) => flattenWorkPackage(wp, config.url));
    }),
  );
}
```

- [ ] **Step 4: Register the tools in `src/server.ts`**

```ts
import { registerWorkPackageTools } from "./tools/workPackages.js";
```

```ts
  registerWorkPackageTools(server, { client });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: work package read tools with plain-argument filtering"
```

---

## Task 9: Work package write tools

Kept in a separate module from the read tools so neither file outgrows the 150-line guidance.

**Files:**
- Create: `src/tools/workPackageWrites.ts`
- Modify: `src/server.ts` — register the write tools.
- Test: `test/tools/workPackageWrites.test.ts`

**Interfaces:**
- Consumes: `resolveHref`, `resolveUserHref` from `src/resolve.js`; `flattenWorkPackage`, `flattenActivity` from `src/hal.js`.
- Produces: `registerWorkPackageWriteTools(server: McpServer, context: ToolContext): void` registering `create_work_package`, `update_work_package`, `comment_work_package`, `list_activities`, `link_work_packages`.

- [ ] **Step 1: Write the failing test**

`test/tools/workPackageWrites.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";
import workPackage from "../fixtures/workPackage.json" with { type: "json" };

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };
const TYPES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "Bug" }] } };
const STATUSES = { total: 1, count: 1, _embedded: { elements: [{ id: 9, name: "In progress" }] } };

let fetchMock: ReturnType<typeof vi.fn>;

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: `no route for ${url.pathname}` }, 404);
  });
}

function callsTo(pathname: string) {
  return fetchMock.mock.calls.filter(([url]) => (url as URL).pathname === `/api/v3${pathname}`);
}

function bodyOf(call: any[]): any {
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("create_work_package", () => {
  it("posts to the project path with resolved links", async () => {
    routes({
      "/users/me": ME, "/types": TYPES, "/statuses": STATUSES,
      "/projects/website/work_packages": workPackage,
      "/projects/website/available_assignees": { total: 1, count: 1, _embedded: { elements: [{ id: 5, name: "Ana Ruiz" }] } },
    });
    const client = await connect();

    const result = (await callTool(client, "create_work_package", {
      project: "website", type: "Bug", subject: "Fix login redirect",
      description: "Users land on /dashboard.", assignee: "Ana Ruiz",
      status: "In progress", dueDate: "2026-08-03",
    })).json();

    const [call] = callsTo("/projects/website/work_packages");
    expect(call[1].method).toBe("POST");
    expect(bodyOf(call)).toEqual({
      subject: "Fix login redirect",
      description: { raw: "Users land on /dashboard." },
      dueDate: "2026-08-03",
      _links: {
        type: { href: "/api/v3/types/7" },
        status: { href: "/api/v3/statuses/9" },
        assignee: { href: "/api/v3/users/5" },
      },
    });
    expect(result.id).toBe(1234);
  });

  it("uses the default project when none is given", async () => {
    routes({ "/users/me": ME, "/types": TYPES, "/projects/website/work_packages": workPackage });
    const client = await connect({ ...testConfig, defaultProject: "website" });
    await callTool(client, "create_work_package", { type: "Bug", subject: "Something" });

    expect(callsTo("/projects/website/work_packages")).toHaveLength(1);
  });

  it("asks for a project when there is no default", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    const result = await callTool(client, "create_work_package", { type: "Bug", subject: "Something" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("No project given and no default project configured");
  });

  it("names the valid types when the type is unknown", async () => {
    routes({ "/users/me": ME, "/types": TYPES });
    const client = await connect();
    const result = await callTool(client, "create_work_package", { project: "website", type: "Epicc", subject: "x" });

    expect(result.isError).toBe(true);
    expect(result.text).toBe('No type named "Epicc". Available: Bug');
  });

  it("is blocked in read-only mode", async () => {
    routes({ "/users/me": ME, "/types": TYPES });
    const client = await connect({ ...testConfig, readOnly: true });
    const result = await callTool(client, "create_work_package", { project: "website", type: "7", subject: "x" });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  });
});

describe("update_work_package", () => {
  it("reads the current lockVersion before patching", async () => {
    routes({ "/users/me": ME, "/statuses": STATUSES, "/work_packages/1234": workPackage });
    const client = await connect();
    await callTool(client, "update_work_package", { id: 1234, status: "In progress", percentageDone: 60 });

    const calls = callsTo("/work_packages/1234");
    expect(calls[0][1].method).toBe("GET");
    expect(calls[1][1].method).toBe("PATCH");
    expect(bodyOf(calls[1])).toEqual({
      lockVersion: 7,
      percentageDone: 60,
      _links: { status: { href: "/api/v3/statuses/9" } },
    });
  });

  it("sends only the fields that were supplied", async () => {
    routes({ "/users/me": ME, "/work_packages/1234": workPackage });
    const client = await connect();
    await callTool(client, "update_work_package", { id: 1234, subject: "New subject" });

    expect(bodyOf(callsTo("/work_packages/1234")[1])).toEqual({ lockVersion: 7, subject: "New subject" });
  });

  it("clears an assignee when passed null", async () => {
    routes({ "/users/me": ME, "/work_packages/1234": workPackage });
    const client = await connect();
    await callTool(client, "update_work_package", { id: 1234, assignee: null });

    expect(bodyOf(callsTo("/work_packages/1234")[1])._links).toEqual({ assignee: { href: null } });
  });

  it("refuses an update with no fields rather than issuing a pointless request", async () => {
    routes({ "/users/me": ME, "/work_packages/1234": workPackage });
    const client = await connect();
    const result = await callTool(client, "update_work_package", { id: 1234 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Nothing to update");
    expect(callsTo("/work_packages/1234")).toHaveLength(0);
  });

  it("tells the agent to re-read after a lock conflict", async () => {
    fetchMock.mockImplementation(async (url: URL, init: RequestInit) => {
      if (url.pathname === "/api/v3/users/me") return respond(ME);
      if (init.method === "GET") return respond(workPackage);
      return respond({ message: "Version mismatch" }, 409);
    });
    const client = await connect();
    const result = await callTool(client, "update_work_package", { id: 1234, subject: "New" });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Version mismatch. Read the resource again and retry.");
  });
});

describe("comment_work_package", () => {
  it("posts a raw markdown comment", async () => {
    routes({
      "/users/me": ME,
      "/work_packages/1234/activities": { id: 55, createdAt: "2026-07-28T10:00:00Z", _links: {} },
    });
    const client = await connect();
    const result = (await callTool(client, "comment_work_package", { id: 1234, comment: "Pushed `bug/1234-fix`." })).json();

    expect(bodyOf(callsTo("/work_packages/1234/activities")[0])).toEqual({ comment: { raw: "Pushed `bug/1234-fix`." } });
    expect(result).toEqual({ id: 55, createdAt: "2026-07-28T10:00:00Z", url: "https://op.acme.com/work_packages/1234" });
  });
});

describe("list_activities", () => {
  it("returns comments and field changes in order", async () => {
    routes({
      "/users/me": ME,
      "/work_packages/1234/activities": {
        total: 2, count: 2,
        _embedded: {
          elements: [
            { id: 1, _type: "Activity", createdAt: "2026-07-20T08:00:00Z", details: [{ raw: "Status set to New" }], _links: { user: { href: "/api/v3/users/5", title: "Ana Ruiz" } } },
            { id: 2, _type: "Activity::Comment", createdAt: "2026-07-28T10:00:00Z", comment: { raw: "Pushed the fix." }, _links: { user: { href: "/api/v3/users/12", title: "Daniel Escalona" } } },
          ],
        },
      },
    });
    const client = await connect();
    const result = (await callTool(client, "list_activities", { id: 1234 })).json();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, user: "Ana Ruiz", details: ["Status set to New"] });
    expect(result[1]).toMatchObject({ id: 2, user: "Daniel Escalona", comment: "Pushed the fix." });
  });
});

describe("link_work_packages", () => {
  it("posts a relation from one work package to another", async () => {
    routes({ "/users/me": ME, "/work_packages/1234/relations": { id: 3, type: "blocks", _links: {} } });
    const client = await connect();
    await callTool(client, "link_work_packages", { from: 1234, to: 1200, type: "blocks" });

    expect(bodyOf(callsTo("/work_packages/1234/relations")[0])).toEqual({
      type: "blocks",
      _links: { to: { href: "/api/v3/work_packages/1200" } },
    });
  });

  it("rejects a relation type OpenProject does not have", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    expect((await callTool(client, "link_work_packages", { from: 1, to: 2, type: "sortof" })).isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tools/workPackageWrites.test.ts`
Expected: FAIL — `Tool create_work_package not found`.

- [ ] **Step 3: Implement `src/tools/workPackageWrites.ts`**

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { flattenActivity, flattenWorkPackage } from "../hal.js";
import { resolveHref, resolveUserHref } from "../resolve.js";
import { handler, type ToolContext } from "./shared.js";

type Links = Record<string, { href: string | null }>;

type WriteArgs = {
  subject?: string;
  description?: string;
  type?: string;
  status?: string;
  priority?: string;
  assignee?: string | null;
  parent?: number | null;
  startDate?: string;
  dueDate?: string;
  percentageDone?: number;
};

const RELATION_TYPES = ["relates", "duplicates", "blocks", "precedes", "includes", "requires"] as const;

const WRITE_SCHEMA = {
  subject: z.string().optional().describe("Title of the work package."),
  description: z.string().optional().describe("Markdown body."),
  type: z.string().optional().describe('Type name or id, for example "Bug".'),
  status: z.string().optional().describe('Status name or id, for example "In progress".'),
  priority: z.string().optional().describe('Priority name or id, for example "High".'),
  startDate: z.string().optional().describe("ISO date."),
  dueDate: z.string().optional().describe("ISO date."),
  percentageDone: z.number().int().min(0).max(100).optional().describe("Completion percentage."),
};

async function buildPayload(
  client: ToolContext["client"],
  args: WriteArgs,
  project: string | undefined,
): Promise<{ fields: Record<string, unknown>; links: Links }> {
  const fields: Record<string, unknown> = {};
  if (args.subject !== undefined) fields.subject = args.subject;
  if (args.description !== undefined) fields.description = { raw: args.description };
  if (args.startDate !== undefined) fields.startDate = args.startDate;
  if (args.dueDate !== undefined) fields.dueDate = args.dueDate;
  if (args.percentageDone !== undefined) fields.percentageDone = args.percentageDone;

  const links: Links = {};
  if (args.type) links.type = { href: await resolveHref(client, "types", args.type, project) };
  if (args.status) links.status = { href: await resolveHref(client, "statuses", args.status, project) };
  if (args.priority) links.priority = { href: await resolveHref(client, "priorities", args.priority) };
  if (args.assignee !== undefined) {
    links.assignee = { href: args.assignee === null ? null : await resolveUserHref(client, args.assignee, project) };
  }
  if (args.parent !== undefined) {
    links.parent = { href: args.parent === null ? null : `/api/v3/work_packages/${args.parent}` };
  }
  return { fields, links };
}

export function registerWorkPackageWriteTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "create_work_package",
    {
      title: "Create a work package",
      description: "Create a work package in a project. Type and subject are required; everything else is optional.",
      inputSchema: {
        ...WRITE_SCHEMA,
        project: z.string().optional().describe("Project identifier or id. Defaults to the configured default project."),
        type: z.string().describe('Type name or id, for example "Bug". Use list_metadata to see the valid names.'),
        subject: z.string().describe("Title of the work package."),
        assignee: z.string().optional().describe('Assignee name, email, numeric id, or "me".'),
        parent: z.number().int().optional().describe("Id of the parent work package."),
      },
    },
    handler(async ({ project, ...args }: WriteArgs & { project?: string }) => {
      const target = project ?? config.defaultProject;
      if (!target) throw new Error("No project given and no default project configured. Pass `project`, or set one with the setup wizard.");

      const { fields, links } = await buildPayload(client, args, target);
      const created = await client.request("POST", `/projects/${target}/work_packages`, {
        body: { ...fields, _links: links },
      });
      return flattenWorkPackage(created, config.url, { includeDescription: true });
    }),
  );

  server.registerTool(
    "update_work_package",
    {
      title: "Update a work package",
      description:
        "Change any subset of a work package's fields. The optimistic lock is handled for you. Pass null for assignee or parent to clear it.",
      inputSchema: {
        ...WRITE_SCHEMA,
        id: z.number().int().describe("Work package id."),
        assignee: z.string().nullable().optional().describe('Assignee name, email, numeric id, "me", or null to clear.'),
        parent: z.number().int().nullable().optional().describe("Parent work package id, or null to detach."),
      },
    },
    handler(async ({ id, ...args }: WriteArgs & { id: number }) => {
      const { fields, links } = await buildPayload(client, args, config.defaultProject);
      if (!Object.keys(fields).length && !Object.keys(links).length) {
        throw new Error("Nothing to update. Supply at least one field.");
      }

      // OpenProject uses optimistic locking: a PATCH without the resource's
      // current lockVersion is rejected, and a stale one returns 409.
      const current = await client.request("GET", `/work_packages/${id}`);
      const body: Record<string, unknown> = { lockVersion: current.lockVersion, ...fields };
      if (Object.keys(links).length) body._links = links;

      const updated = await client.request("PATCH", `/work_packages/${id}`, { body });
      return flattenWorkPackage(updated, config.url, { includeDescription: true });
    }),
  );

  server.registerTool(
    "comment_work_package",
    {
      title: "Comment on a work package",
      description: "Add a markdown comment. Everyone watching the work package gets a notification.",
      inputSchema: {
        id: z.number().int().describe("Work package id."),
        comment: z.string().describe("Markdown comment body."),
      },
    },
    handler(async ({ id, comment }: { id: number; comment: string }) => {
      const created = await client.request("POST", `/work_packages/${id}/activities`, {
        body: { comment: { raw: comment } },
      });
      return { id: created.id, createdAt: created.createdAt, url: `${config.url}/work_packages/${id}` };
    }),
  );

  server.registerTool(
    "list_activities",
    {
      title: "List work package activity",
      description: "Comments and field changes for one work package, oldest first.",
      inputSchema: {
        id: z.number().int().describe("Work package id."),
        limit: z.number().int().positive().optional().describe("Maximum entries. Defaults to 50."),
      },
    },
    handler(async ({ id, limit }: { id: number; limit?: number }) => {
      const { elements } = await client.collection(`/work_packages/${id}/activities`, { pageSize: limit ?? 50 });
      return elements.map(flattenActivity);
    }),
  );

  server.registerTool(
    "link_work_packages",
    {
      title: "Link two work packages",
      description: "Create a relation between two work packages, such as one blocking another.",
      inputSchema: {
        from: z.number().int().describe("Work package the relation starts from."),
        to: z.number().int().describe("Work package the relation points to."),
        type: z.enum(RELATION_TYPES).describe("Relation type."),
      },
    },
    handler(async ({ from, to, type }: { from: number; to: number; type: string }) => {
      const relation = await client.request("POST", `/work_packages/${from}/relations`, {
        body: { type, _links: { to: { href: `/api/v3/work_packages/${to}` } } },
      });
      return { id: relation.id, type: relation.type, from, to };
    }),
  );
}
```

- [ ] **Step 4: Register the tools in `src/server.ts`**

```ts
import { registerWorkPackageWriteTools } from "./tools/workPackageWrites.js";
```

```ts
  registerWorkPackageWriteTools(server, { client });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: work package creation, updates, comments, activity and relations"
```

---

## Task 10: Notifications

**Files:**
- Create: `src/tools/notifications.ts`
- Modify: `src/server.ts` — register the notification tools.
- Test: `test/tools/notifications.test.ts`

**Interfaces:**
- Consumes: `flattenNotification` from `src/hal.js`; `Filter` from `src/client.js`.
- Produces: `registerNotificationTools(server: McpServer, context: ToolContext): void` registering `list_notifications`, `mark_notifications_read`, `watch_work_package`.

OpenProject encodes boolean filter values as the strings `t` and `f`.

- [ ] **Step 1: Write the failing test**

`test/tools/notifications.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import notification from "../fixtures/notification.json" with { type: "json" };

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };
const FEED = { total: 1, count: 1, _embedded: { elements: [notification] } };

let fetchMock: ReturnType<typeof vi.fn>;

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: `no route for ${url.pathname}` }, 404);
  });
}

function filtersOf(): any[] {
  return JSON.parse((fetchMock.mock.lastCall![0] as URL).searchParams.get("filters") ?? "[]");
}

function pathsCalled(): string[] {
  return fetchMock.mock.calls.map(([url]) => (url as URL).pathname);
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("list_notifications", () => {
  it("flattens the feed into triage-ready rows", async () => {
    routes({ "/users/me": ME, "/notifications": FEED });
    const client = await connect();
    const result = (await callTool(client, "list_notifications")).json();

    expect(result.total).toBe(1);
    expect(result.notifications[0]).toMatchObject({
      id: 88, reason: "mentioned", read: false, project: "Website", actor: "Ana Ruiz",
      workPackageId: 1234, workPackageSubject: "Fix login redirect",
      url: "https://op.acme.com/work_packages/1234",
    });
  });

  it("filters to unread using OpenProject's boolean encoding", async () => {
    routes({ "/users/me": ME, "/notifications": FEED });
    const client = await connect();
    await callTool(client, "list_notifications", { unreadOnly: true });

    expect(filtersOf()).toContainEqual({ readIAN: { operator: "=", values: ["f"] } });
  });

  it("filters by reason and project", async () => {
    routes({ "/users/me": ME, "/notifications": FEED });
    const client = await connect();
    await callTool(client, "list_notifications", { reason: "mentioned", project: "3" });

    expect(filtersOf()).toContainEqual({ reason: { operator: "=", values: ["mentioned"] } });
    expect(filtersOf()).toContainEqual({ project: { operator: "=", values: ["3"] } });
  });

  it("rejects a reason OpenProject does not define", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    expect((await callTool(client, "list_notifications", { reason: "shouted-at" })).isError).toBe(true);
  });

  it("sends no filters when nothing was asked for", async () => {
    routes({ "/users/me": ME, "/notifications": FEED });
    const client = await connect();
    await callTool(client, "list_notifications");

    expect((fetchMock.mock.lastCall![0] as URL).searchParams.has("filters")).toBe(false);
  });
});

describe("mark_notifications_read", () => {
  it("marks each id individually", async () => {
    routes({ "/users/me": ME, "/notifications/88/read_ian": null, "/notifications/89/read_ian": null });
    const client = await connect();
    const result = (await callTool(client, "mark_notifications_read", { ids: [88, 89] })).json();

    expect(pathsCalled()).toContain("/api/v3/notifications/88/read_ian");
    expect(pathsCalled()).toContain("/api/v3/notifications/89/read_ian");
    expect(result).toEqual({ marked: 2 });
  });

  it("marks the whole filtered collection when asked for all", async () => {
    routes({ "/users/me": ME, "/notifications/read_ian": null });
    const client = await connect();
    await callTool(client, "mark_notifications_read", { all: true, reason: "mentioned" });

    expect(pathsCalled()).toContain("/api/v3/notifications/read_ian");
    expect(filtersOf()).toContainEqual({ reason: { operator: "=", values: ["mentioned"] } });
  });

  it("refuses when given neither ids nor all", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    const result = await callTool(client, "mark_notifications_read", {});

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Pass ids, or all: true");
  });

  it("is blocked in read-only mode", async () => {
    routes({ "/users/me": ME });
    const client = await connect({ ...testConfig, readOnly: true });
    const result = await callTool(client, "mark_notifications_read", { ids: [88] });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  });
});

describe("watch_work_package", () => {
  it("adds you as a watcher", async () => {
    routes({ "/users/me": ME, "/work_packages/1234/watchers": { id: 12, _links: {} } });
    const client = await connect();
    const result = (await callTool(client, "watch_work_package", { id: 1234, watching: true })).json();

    const call = fetchMock.mock.calls.find(([url]) => (url as URL).pathname === "/api/v3/work_packages/1234/watchers")!;
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({ user: { href: "/api/v3/users/12" } });
    expect(result).toEqual({ id: 1234, watching: true });
  });

  it("removes you by user id when unwatching", async () => {
    routes({ "/users/me": ME, "/work_packages/1234/watchers/12": null });
    const client = await connect();
    const result = (await callTool(client, "watch_work_package", { id: 1234, watching: false })).json();

    const call = fetchMock.mock.calls.find(([url]) => (url as URL).pathname === "/api/v3/work_packages/1234/watchers/12")!;
    expect(call[1].method).toBe("DELETE");
    expect(result).toEqual({ id: 1234, watching: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tools/notifications.test.ts`
Expected: FAIL — `Tool list_notifications not found`.

- [ ] **Step 3: Implement `src/tools/notifications.ts`**

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Filter } from "../client.js";
import { flattenNotification } from "../hal.js";
import { handler, type ToolContext } from "./shared.js";

const REASONS = [
  "assigned", "mentioned", "commented", "created", "dateAlert", "prioritized",
  "processed", "responsible", "subscribed", "scheduled", "watched",
] as const;

type FeedArgs = { unreadOnly?: boolean; reason?: string; project?: string; limit?: number };

function feedFilters({ unreadOnly, reason, project }: FeedArgs): Filter[] {
  const filters: Filter[] = [];
  // OpenProject encodes boolean filter values as the strings "t" and "f".
  if (unreadOnly) filters.push({ readIAN: { operator: "=", values: ["f"] } });
  if (reason) filters.push({ reason: { operator: "=", values: [reason] } });
  if (project) filters.push({ project: { operator: "=", values: [project] } });
  return filters;
}

export function registerNotificationTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;

  server.registerTool(
    "list_notifications",
    {
      title: "List notifications",
      description:
        "Your in-app notification feed, newest first. Each row carries the work package it concerns, so you can triage without a second lookup.",
      inputSchema: {
        unreadOnly: z.boolean().optional().describe("Only notifications you have not read yet."),
        reason: z.enum(REASONS).optional().describe("Why the notification exists."),
        project: z.string().optional().describe("Numeric project id. Use list_projects to find it."),
        limit: z.number().int().positive().optional().describe("Maximum notifications. Defaults to 50."),
      },
    },
    handler(async (args: FeedArgs) => {
      const { total, elements } = await client.collection("/notifications", {
        filters: feedFilters(args),
        pageSize: args.limit ?? 50,
      });
      return { total, notifications: elements.map((item) => flattenNotification(item, config.url)) };
    }),
  );

  server.registerTool(
    "mark_notifications_read",
    {
      title: "Mark notifications as read",
      description:
        "Mark specific notifications read by id, or every notification matching a filter with all: true. Use this after triaging so the feed stays meaningful.",
      inputSchema: {
        ids: z.array(z.number().int()).optional().describe("Notification ids to mark read."),
        all: z.boolean().optional().describe("Mark the whole collection read, narrowed by the filters below."),
        reason: z.enum(REASONS).optional().describe("With all: only this reason."),
        project: z.string().optional().describe("With all: only this numeric project id."),
      },
    },
    handler(async ({ ids, all, reason, project }: { ids?: number[]; all?: boolean } & FeedArgs) => {
      if (!ids?.length && !all) throw new Error("Nothing selected. Pass ids, or all: true to mark the whole feed.");

      if (ids?.length) {
        for (const id of ids) await client.request("POST", `/notifications/${id}/read_ian`);
        return { marked: ids.length };
      }

      const filters = feedFilters({ reason, project });
      await client.request("POST", "/notifications/read_ian", {
        query: { filters: filters.length ? JSON.stringify(filters) : undefined },
      });
      return { marked: "all matching" };
    }),
  );

  server.registerTool(
    "watch_work_package",
    {
      title: "Watch or unwatch a work package",
      description: "Control whether you get notified about a work package's future activity.",
      inputSchema: {
        id: z.number().int().describe("Work package id."),
        watching: z.boolean().describe("True to start watching, false to stop."),
      },
    },
    handler(async ({ id, watching }: { id: number; watching: boolean }) => {
      const me = await client.me();
      if (watching) {
        await client.request("POST", `/work_packages/${id}/watchers`, { body: { user: { href: `/api/v3/users/${me.id}` } } });
      } else {
        await client.request("DELETE", `/work_packages/${id}/watchers/${me.id}`);
      }
      return { id, watching };
    }),
  );
}
```

- [ ] **Step 4: Register the tools in `src/server.ts`**

```ts
import { registerNotificationTools } from "./tools/notifications.js";
```

```ts
  registerNotificationTools(server, { client });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

The `mark_notifications_read` test for `all` asserts on `filtersOf()`, which reads the last call's query string — the `read_ian` POST carries its filters as a query parameter, not a body. Confirm that is what the implementation does.

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: notification triage and watching"
```

---

## Task 11: Time logging

**Files:**
- Create: `src/tools/time.ts`
- Modify: `src/server.ts` — register the time tool.
- Test: `test/tools/time.test.ts`

**Interfaces:**
- Consumes: `resolveHref` from `src/resolve.js`.
- Produces:
  - `toIsoDuration(hours: number): string` — exported for its own tests.
  - `registerTimeTools(server: McpServer, context: ToolContext): void` registering `log_time`.

- [ ] **Step 1: Write the failing test**

`test/tools/time.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { connect, callTool, testConfig } from "../support/harness.js";
import { clearMetadataCache } from "../../src/resolve.js";
import { toIsoDuration } from "../../src/tools/time.js";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };
const ACTIVITIES = { total: 1, count: 1, _embedded: { elements: [{ id: 3, name: "Development" }] } };
const ENTRY = { id: 501, hours: "PT2H30M", spentOn: "2026-07-28", _links: {} };

let fetchMock: ReturnType<typeof vi.fn>;

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: `no route for ${url.pathname}` }, 404);
  });
}

function timeEntryBody(): any {
  const call = fetchMock.mock.calls.find(([url]) => (url as URL).pathname === "/api/v3/time_entries")!;
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("toIsoDuration", () => {
  it("converts whole hours", () => {
    expect(toIsoDuration(4)).toBe("PT4H");
  });

  it("converts fractional hours to hours and minutes", () => {
    expect(toIsoDuration(2.5)).toBe("PT2H30M");
    expect(toIsoDuration(1.25)).toBe("PT1H15M");
  });

  it("converts a value under an hour to minutes alone", () => {
    expect(toIsoDuration(0.5)).toBe("PT30M");
  });

  it("rounds to the nearest minute", () => {
    expect(toIsoDuration(0.008)).toBe("PT0H");
    expect(toIsoDuration(1.017)).toBe("PT1H1M");
  });
});

describe("log_time", () => {
  it("posts an ISO 8601 duration linked to the work package", async () => {
    routes({ "/users/me": ME, "/time_entries": ENTRY });
    const client = await connect();
    const result = (await callTool(client, "log_time", {
      workPackageId: 1234, hours: 2.5, date: "2026-07-28", comment: "Traced the redirect.",
    })).json();

    expect(timeEntryBody()).toEqual({
      hours: "PT2H30M",
      spentOn: "2026-07-28",
      comment: { raw: "Traced the redirect." },
      _links: { workPackage: { href: "/api/v3/work_packages/1234" } },
    });
    expect(result).toMatchObject({ id: 501, hours: "PT2H30M", spentOn: "2026-07-28" });
  });

  it("defaults the date to today", async () => {
    vi.setSystemTime(new Date("2026-07-28T15:00:00Z"));
    routes({ "/users/me": ME, "/time_entries": ENTRY });
    const client = await connect();
    await callTool(client, "log_time", { workPackageId: 1234, hours: 1 });

    expect(timeEntryBody().spentOn).toBe("2026-07-28");
    vi.useRealTimers();
  });

  it("resolves a named activity", async () => {
    routes({ "/users/me": ME, "/time_entries": ENTRY, "/time_entries/activities": ACTIVITIES });
    const client = await connect();
    await callTool(client, "log_time", { workPackageId: 1234, hours: 1, activity: "Development" });

    expect(timeEntryBody()._links.activity).toEqual({ href: "/api/v3/time_entries/activities/3" });
  });

  it("rejects a non-positive duration before making a request", async () => {
    routes({ "/users/me": ME });
    const client = await connect();
    const result = await callTool(client, "log_time", { workPackageId: 1234, hours: 0 });

    expect(result.isError).toBe(true);
  });

  it("is blocked in read-only mode", async () => {
    routes({ "/users/me": ME });
    const client = await connect({ ...testConfig, readOnly: true });
    const result = await callTool(client, "log_time", { workPackageId: 1234, hours: 1 });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tools/time.test.ts`
Expected: FAIL — cannot resolve `../../src/tools/time.js`.

- [ ] **Step 3: Implement `src/tools/time.ts`**

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveHref } from "../resolve.js";
import { handler, type ToolContext } from "./shared.js";

// OpenProject stores time entry durations as ISO 8601, so 2.5 hours is PT2H30M.
export function toIsoDuration(hours: number): string {
  const minutes = Math.round(hours * 60);
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!whole && !rest) return "PT0H";
  return `PT${whole ? `${whole}H` : ""}${rest ? `${rest}M` : ""}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type LogArgs = { workPackageId: number; hours: number; date?: string; comment?: string; activity?: string };

export function registerTimeTools(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    "log_time",
    {
      title: "Log time",
      description: "Record time spent on a work package. Hours are given as a decimal number; 2.5 means two and a half.",
      inputSchema: {
        workPackageId: z.number().int().describe("Work package the time was spent on."),
        hours: z.number().positive().describe("Decimal hours, for example 2.5."),
        date: z.string().optional().describe("ISO date the work happened. Defaults to today."),
        comment: z.string().optional().describe("What the time was spent doing."),
        activity: z.string().optional().describe('Activity name or id, for example "Development". See list_metadata.'),
      },
    },
    handler(async ({ workPackageId, hours, date, comment, activity }: LogArgs) => {
      const links: Record<string, { href: string }> = {
        workPackage: { href: `/api/v3/work_packages/${workPackageId}` },
      };
      if (activity) links.activity = { href: await resolveHref(client, "activities", activity) };

      const entry = await client.request("POST", "/time_entries", {
        body: {
          hours: toIsoDuration(hours),
          spentOn: date ?? today(),
          ...(comment ? { comment: { raw: comment } } : {}),
          _links: links,
        },
      });
      return { id: entry.id, hours: entry.hours, spentOn: entry.spentOn, workPackageId };
    }),
  );
}
```

- [ ] **Step 4: Register the tool in `src/server.ts`**

```ts
import { registerTimeTools } from "./tools/time.js";
```

```ts
  registerTimeTools(server, { client });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: log time with ISO 8601 duration conversion"
```

---

## Task 12: Conventions tools and resource

**Files:**
- Create: `src/tools/conventions.ts`
- Modify: `src/tools/shared.ts` — let `handler` return bare text unwrapped.
- Modify: `src/server.ts` — register the conventions tools and the resource.
- Test: `test/tools/conventions.test.ts`

**Interfaces:**
- Consumes: `readConventions`, `addRule`, `removeRule` from `src/conventions.js`.
- Produces: `registerConventionTools(server: McpServer, context: ToolContext): void` registering `conventions`, `add_convention`, `remove_convention`, and the `openproject://conventions` resource.

- [ ] **Step 1: Modify `handler` in `src/tools/shared.ts`**

A markdown manual serialized through `JSON.stringify` arrives full of `\n` escapes and is unpleasant to read. One rule covers it without a second wrapper function:

```ts
export function handler<Args>(run: (args: Args) => Promise<unknown>) {
  return async (args: Args) => {
    try {
      const value = await run(args);
      return typeof value === "string" ? { content: [{ type: "text" as const, text: value }] } : jsonResult(value);
    } catch (error) {
      return errorResult(humanMessage(error));
    }
  };
}
```

No existing tool returns a bare string, so nothing else changes.

- [ ] **Step 2: Write the failing test**

`test/tools/conventions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, callTool, testConfig } from "../support/harness.js";

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };

const MANUAL = `# ACME — OpenProject conventions

## Git / GitLab
- Branch: \`{type}/{wp-id}-{slug}\`

## Workflow
- Move to \`In progress\` only once a branch exists.
`;

let path: string;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), "operator-tool-manual-")), "conventions.md");
  writeFileSync(path, MANUAL);
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(ME), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function withManual(extra: Partial<typeof testConfig> = {}) {
  return { ...testConfig, conventionsPath: path, ...extra };
}

describe("instructions", () => {
  it("carry the manual to every client at connection", async () => {
    const client = await connect(withManual());
    expect(client.getInstructions()).toContain("- Branch: `{type}/{wp-id}-{slug}`");
  });
});

describe("conventions", () => {
  it("returns the manual as plain markdown, not escaped json", async () => {
    const client = await connect(withManual());
    const result = await callTool(client, "conventions");

    expect(result.text).toBe(MANUAL);
    expect(result.text).not.toContain("\\n");
  });

  it("says so when no manual exists", async () => {
    const client = await connect({ ...testConfig, conventionsPath: join(tmpdir(), "absent-manual.md") });
    expect((await callTool(client, "conventions")).text).toContain("No conventions manual");
  });
});

describe("add_convention", () => {
  it("appends a rule to an existing section", async () => {
    const client = await connect(withManual());
    const result = (await callTool(client, "add_convention", {
      section: "Git / GitLab",
      rule: "Rebase, never merge.",
    })).json();

    expect(result).toMatchObject({ section: "Git / GitLab", rule: "Rebase, never merge." });
    expect(readFileSync(path, "utf8")).toContain("- Rebase, never merge.");
  });

  it("creates a section that does not exist yet", async () => {
    const client = await connect(withManual());
    await callTool(client, "add_convention", { section: "Reviews", rule: "Two approvals before merge." });

    expect(readFileSync(path, "utf8")).toContain("## Reviews\n\n- Two approvals before merge.");
  });

  it("is blocked in read-only mode", async () => {
    const client = await connect(withManual({ readOnly: true }));
    const result = await callTool(client, "add_convention", { section: "Git / GitLab", rule: "Nope." });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });
});

describe("remove_convention", () => {
  it("refuses without confirm and leaves the file untouched", async () => {
    const client = await connect(withManual());
    const result = await callTool(client, "remove_convention", {
      section: "Workflow",
      rule: "Move to `In progress` only once a branch exists.",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("confirm: true");
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });

  it("removes with confirm and keeps a backup", async () => {
    const client = await connect(withManual());
    const result = (await callTool(client, "remove_convention", {
      section: "Workflow",
      rule: "Move to `In progress` only once a branch exists.",
      confirm: true,
    })).json();

    expect(result.removed).toBe(true);
    expect(readFileSync(result.backupPath, "utf8")).toBe(MANUAL);
    expect(readFileSync(path, "utf8")).not.toContain("only once a branch exists");
  });

  it("reports the real bullets when nothing matches", async () => {
    const client = await connect(withManual());
    const result = (await callTool(client, "remove_convention", {
      section: "Workflow", rule: "a rule nobody wrote", confirm: true,
    })).json();

    expect(result.removed).toBe(false);
    expect(result.bullets).toEqual(["Move to `In progress` only once a branch exists."]);
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });

  it("is blocked in read-only mode even with confirm", async () => {
    const client = await connect(withManual({ readOnly: true }));
    const result = await callTool(client, "remove_convention", {
      section: "Workflow", rule: "Move to `In progress` only once a branch exists.", confirm: true,
    });

    expect(result.isError).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(MANUAL);
  });
});

describe("the conventions resource", () => {
  it("serves the manual at openproject://conventions", async () => {
    const client = await connect(withManual());
    const result = await client.readResource({ uri: "openproject://conventions" });

    expect(result.contents[0].text).toBe(MANUAL);
    expect(result.contents[0].mimeType).toBe("text/markdown");
  });
});
```

If `client.getInstructions()` does not exist on the installed SDK version, read the value from the initialize result the client stored — check `node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.d.ts` for the accessor and use it. Do not delete the assertion; instructions delivery is the whole point of the feature.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/tools/conventions.test.ts`
Expected: FAIL — `Tool conventions not found`.

- [ ] **Step 4: Implement `src/tools/conventions.ts`**

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addRule, readConventions, removeRule } from "../conventions.js";
import { ReadOnlyError } from "../errors.js";
import { handler, type ToolContext } from "./shared.js";

export function registerConventionTools(server: McpServer, { client }: ToolContext): void {
  const { config } = client;
  const missing = `No conventions manual for this workplace. Create one at ${config.conventionsPath}, or add the first rule with add_convention.`;

  server.registerTool(
    "conventions",
    {
      title: "Workplace conventions",
      description:
        "The rules this workplace expects you to follow in OpenProject: branch and commit naming, workflow states, required fields. These are also delivered in the server instructions; re-read them here whenever you are unsure.",
      inputSchema: {},
    },
    handler(async () => readConventions(config.conventionsPath) ?? missing),
  );

  server.registerTool(
    "add_convention",
    {
      title: "Record a convention",
      description:
        "Append a rule to the workplace manual so it survives this session. Use it when the user states a working rule you would otherwise forget. Appending never removes anything.",
      inputSchema: {
        section: z.string().describe('Heading to file the rule under, for example "Git / GitLab". Created if absent.'),
        rule: z.string().describe("The rule, as one sentence."),
      },
    },
    handler(async ({ section, rule }: { section: string; rule: string }) => {
      if (config.readOnly) throw new ReadOnlyError();
      return addRule(config.conventionsPath, section, rule);
    }),
  );

  server.registerTool(
    "remove_convention",
    {
      title: "Remove a convention",
      description:
        "Delete a rule from the workplace manual. Set confirm only when the user has explicitly asked you, in this conversation, to remove that rule — never on your own initiative. The file is backed up before any change.",
      inputSchema: {
        section: z.string().describe("Heading the rule lives under."),
        rule: z.string().describe("Exact text of the rule, without its bullet marker."),
        confirm: z.boolean().optional().describe("Must be true. Only set it on the user's explicit instruction."),
      },
    },
    handler(async ({ section, rule, confirm }: { section: string; rule: string; confirm?: boolean }) => {
      if (config.readOnly) throw new ReadOnlyError();
      if (!confirm) {
        throw new Error(
          "Removing a convention needs confirm: true, and the user must have explicitly asked for this removal. Ask them first.",
        );
      }
      return removeRule(config.conventionsPath, section, rule);
    }),
  );

  server.registerResource(
    "conventions",
    "openproject://conventions",
    { title: "Workplace conventions", description: "This workplace's OpenProject rules.", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: readConventions(config.conventionsPath) ?? missing }],
    }),
  );
}
```

- [ ] **Step 5: Register in `src/server.ts`**

```ts
import { registerConventionTools } from "./tools/conventions.js";
```

```ts
  registerConventionTools(server, { client });
```

- [ ] **Step 6: Run the tests and confirm all twenty tools are present**

Run: `npx vitest run`
Expected: PASS.

Then add a completeness check to `test/server.test.ts` and run it:

```ts
import { connect } from "./support/harness.js";

it("registers exactly the twenty planned tools", async () => {
  const client = await connect();
  const names = (await client.listTools()).tools.map((tool) => tool.name).sort();

  expect(names).toEqual([
    "add_convention", "api_request", "comment_work_package", "conventions", "create_work_package",
    "get_work_package", "link_work_packages", "list_activities", "list_metadata", "list_notifications",
    "list_projects", "list_users", "log_time", "mark_notifications_read", "my_work",
    "remove_convention", "search_work_packages", "update_work_package", "watch_work_package", "whoami",
  ]);
});
```

This test needs `fetch` stubbed the way the other suites do it; copy the `beforeEach`/`afterEach` stub block from `test/tools/raw.test.ts` into `test/server.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: conventions tools, resource, and confirmed removal"
```

---

## Task 13: Setup wizard and the bin entry

**Files:**
- Create: `src/setup.ts`
- Modify: `src/index.ts` — route the `setup` argument.
- Test: `test/setup.test.ts`

**Interfaces:**
- Consumes: `normalizeUrl`, `profileDir`, `resolveProfile`, `saveConfig` from `src/config.js`; `OpenProjectClient` from `src/client.js`; `TEMPLATE_PATH` from `src/conventions.js`; `humanMessage` from `src/errors.js`.
- Produces:
  - `verifyCredentials(url: string, apiKey: string): Promise<{ identity: Identity; projectCount: number }>`
  - `scaffoldConventions(path: string): string | null` — returns the path written, or null when a manual already exists.
  - `mcpConfigSnippet(profile: string): string`
  - `runSetup(argv: string[]): Promise<void>`

**stdout is the MCP transport.** In every code path the server can reach, `console.log` corrupts the JSON-RPC stream — the rule is already in `CLAUDE.md` from Task 1. The wizard is the one place that owns stdout, because no transport is attached.

- [ ] **Step 1: Write the failing test**

`test/setup.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCredentials, scaffoldConventions, mcpConfigSnippet } from "../src/setup.js";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ME = { id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("verifyCredentials", () => {
  it("returns the identity and how many projects are visible", async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      url.pathname === "/api/v3/users/me" ? respond(ME) : respond({ total: 7, count: 1, _embedded: { elements: [] } }),
    );

    expect(await verifyCredentials("https://op.acme.com", "secret")).toEqual({
      identity: ME,
      projectCount: 7,
    });
  });

  it("propagates a readable message for a bad key", async () => {
    fetchMock.mockResolvedValue(respond({}, 401));
    await expect(verifyCredentials("https://op.acme.com", "wrong")).rejects.toThrow("API key rejected");
  });

  it("propagates a readable message for an unreachable host", async () => {
    fetchMock.mockRejectedValue(new TypeError("getaddrinfo ENOTFOUND"));
    await expect(verifyCredentials("https://op.invalid", "secret")).rejects.toThrow("Cannot reach https://op.invalid");
  });
});

describe("scaffoldConventions", () => {
  it("copies the packaged template when no manual exists", () => {
    const path = join(mkdtempSync(join(tmpdir(), "operator-scaffold-")), "conventions.md");
    expect(scaffoldConventions(path)).toBe(path);
    expect(readFileSync(path, "utf8")).toContain("## Git / GitLab");
  });

  it("creates any missing parent directory", () => {
    const path = join(mkdtempSync(join(tmpdir(), "operator-scaffold-")), "nested", "conventions.md");
    scaffoldConventions(path);
    expect(existsSync(path)).toBe(true);
  });

  it("never overwrites an existing manual", () => {
    const path = join(mkdtempSync(join(tmpdir(), "operator-scaffold-")), "conventions.md");
    writeFileSync(path, "# Mine\n");
    expect(scaffoldConventions(path)).toBeNull();
    expect(readFileSync(path, "utf8")).toBe("# Mine\n");
  });
});

describe("mcpConfigSnippet", () => {
  it("emits a copyable block for the default profile", () => {
    expect(JSON.parse(mcpConfigSnippet("default"))).toEqual({
      mcpServers: { openproject: { command: "npx", args: ["-y", "openproject-mcp"] } },
    });
  });

  it("names and flags a non-default profile so two workplaces can coexist", () => {
    expect(JSON.parse(mcpConfigSnippet("acme"))).toEqual({
      mcpServers: {
        "openproject-acme": { command: "npx", args: ["-y", "openproject-mcp", "--profile", "acme"] },
      },
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/setup.test.ts`
Expected: FAIL — cannot resolve `../src/setup.js`.

- [ ] **Step 4: Implement `src/setup.ts`**

```ts
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import { OpenProjectClient, type Identity } from "./client.js";
import { normalizeUrl, profileDir, resolveProfile, saveConfig } from "./config.js";
import { TEMPLATE_PATH } from "./conventions.js";
import { humanMessage } from "./errors.js";

export async function verifyCredentials(
  url: string,
  apiKey: string,
): Promise<{ identity: Identity; projectCount: number }> {
  const client = new OpenProjectClient({
    profile: "setup", url, apiKey, conventionsPath: "", readOnly: false,
  });
  const identity = await client.me();
  const { total } = await client.collection("/projects", { pageSize: 1 });
  return { identity, projectCount: total };
}

export function scaffoldConventions(path: string): string | null {
  if (existsSync(path)) return null;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  copyFileSync(TEMPLATE_PATH, path);
  return path;
}

export function mcpConfigSnippet(profile: string): string {
  const isDefault = profile === "default";
  const name = isDefault ? "openproject" : `openproject-${profile}`;
  const args = isDefault ? ["-y", "openproject-mcp"] : ["-y", "openproject-mcp", "--profile", profile];
  return JSON.stringify({ mcpServers: { [name]: { command: "npx", args } } }, null, 2);
}

async function promptHidden(rl: Interface, question: string): Promise<string> {
  const iface = rl as unknown as { _writeToOutput: (chunk: string) => void };
  const original = iface._writeToOutput;
  const answer = rl.question(question);
  // readline offers no masked-input option; muting its echo hook is the standard workaround.
  iface._writeToOutput = () => {};
  try {
    return (await answer).trim();
  } finally {
    iface._writeToOutput = original;
    process.stdout.write("\n");
  }
}

export async function runSetup(argv: string[]): Promise<void> {
  const profile = resolveProfile(argv, process.env);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(`\n  OPerator setup — profile "${profile}"\n`);

    let url = "";
    let apiKey = "";
    for (;;) {
      url = normalizeUrl(await rl.question("  OpenProject instance URL: "));
      apiKey = await promptHidden(rl, "  API key: ");
      try {
        const { identity, projectCount } = await verifyCredentials(url, apiKey);
        console.log(`  ✓ Connected as ${identity.name} (${identity.email})`);
        console.log(`  ✓ ${projectCount} projects visible`);
        break;
      } catch (error) {
        console.log(`  ✗ ${humanMessage(error)}\n`);
      }
    }

    const defaultProject = (await rl.question("  Default project identifier (optional): ")).trim() || undefined;
    console.log(`  ✓ Saved to ${saveConfig(profile, { url, apiKey, defaultProject })}`);

    const manual = scaffoldConventions(join(profileDir(profile), "conventions.md"));
    console.log(manual ? `  ✓ Starter conventions written to ${manual}` : "  · Existing conventions kept");

    console.log("\n  Add this to your MCP client config:\n");
    console.log(mcpConfigSnippet(profile));
    console.log("");
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 5: Route the `setup` argument in `src/index.ts`**

```ts
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { runSetup } from "./setup.js";

if (process.argv.includes("setup")) {
  await runSetup(process.argv.slice(2));
} else {
  const server = await createServer(loadConfig());
  await server.connect(new StdioServerTransport());
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Verify the wizard by hand**

```bash
npx tsc
node dist/index.js setup --profile scratch
```

Enter a wrong URL first and confirm it re-prompts with a readable message rather than exiting. Then enter real credentials. Confirm the API key does not echo as you type, that `~/.config/openproject-mcp/scratch/config.json` is mode 600, and that `conventions.md` landed beside it.

```bash
stat -c '%a %n' ~/.config/openproject-mcp/scratch/*
rm -rf ~/.config/openproject-mcp/scratch
```

If the key echoes, the readline internals differ in this Node version. Fall back to reading the key from `process.stdin` with `setRawMode(true)`, accumulating until newline. Do not ship a wizard that prints API keys to the terminal.

- [ ] **Step 8: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "feat: interactive setup wizard and bin routing"
```

---

## Task 14: README and the live smoke suite

The unit suite proves the code does what we believe OpenProject wants. This task proves OpenProject agrees. Several request shapes in this plan are asserted from documentation rather than observation — the `>d` date operator, whether a time entry needs an explicit project link, and whether `read_ian` takes its filters as a query parameter. The smoke suite is where those get settled.

**Files:**
- Create: `README.md`, `vitest.live.config.ts`, `test-live/smoke.test.ts`
- Modify: `package.json` — point `test:live` at the new config.

**Interfaces:**
- Consumes: everything.
- Produces: no source interfaces.

- [ ] **Step 1: Point `test:live` at its own config**

In `package.json`:

```json
    "test:live": "vitest run --config vitest.live.config.ts"
```

`vitest.live.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test-live/**/*.test.ts"], environment: "node", testTimeout: 30_000 },
});
```

The default `vitest.config.ts` includes only `test/**`, so `npm test` can never reach the live suite.

- [ ] **Step 2: Write the live smoke suite**

`test-live/smoke.test.ts`:

```ts
import { describe, expect, it, beforeAll } from "vitest";
import { OpenProjectClient } from "../src/client.js";
import { listMetadata } from "../src/resolve.js";
import { buildSearchFilters } from "../src/tools/workPackages.js";
import { toIsoDuration } from "../src/tools/time.js";

const url = process.env.OPENPROJECT_URL;
const apiKey = process.env.OPENPROJECT_API_KEY;
const project = process.env.OPENPROJECT_TEST_PROJECT;
const configured = Boolean(url && apiKey && project);

describe.skipIf(!configured)("live OpenProject instance", () => {
  let client: OpenProjectClient;
  let createdId: number;

  beforeAll(() => {
    client = new OpenProjectClient({
      profile: "live",
      url: url!,
      apiKey: apiKey!,
      conventionsPath: "",
      readOnly: false,
      defaultProject: project,
    });
  });

  it("authenticates and identifies the key's owner", async () => {
    const me = await client.me();
    expect(me.id).toBeGreaterThan(0);
    expect(me.name).toBeTruthy();
  });

  it("lists every metadata kind the tools resolve against", async () => {
    for (const kind of ["types", "statuses", "priorities", "activities"] as const) {
      const entries = await listMetadata(client, kind);
      expect(entries.length, `${kind} came back empty`).toBeGreaterThan(0);
      expect(entries[0]).toHaveProperty("name");
    }
  });

  it("accepts the open-status operator", async () => {
    const result = await client.collection(`/projects/${project}/work_packages`, {
      filters: await buildSearchFilters(client, { status: "open", project }),
      pageSize: 1,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("accepts the >d operator for updatedAt", async () => {
    const result = await client.collection(`/projects/${project}/work_packages`, {
      filters: await buildSearchFilters(client, { updatedSince: "2000-01-01", project }),
      pageSize: 1,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("creates, reads, updates and comments on a work package", async () => {
    const [type] = await listMetadata(client, "types", project);
    const created = await client.request("POST", `/projects/${project}/work_packages`, {
      body: { subject: `OPerator smoke ${Date.now()}`, _links: { type: { href: `/api/v3/types/${type.id}` } } },
    });
    createdId = created.id;
    expect(created.lockVersion).toBeTypeOf("number");

    const fetched = await client.request("GET", `/work_packages/${createdId}`);
    const updated = await client.request("PATCH", `/work_packages/${createdId}`, {
      body: { lockVersion: fetched.lockVersion, subject: "OPerator smoke (updated)" },
    });
    expect(updated.subject).toBe("OPerator smoke (updated)");

    const comment = await client.request("POST", `/work_packages/${createdId}/activities`, {
      body: { comment: { raw: "Smoke test comment." } },
    });
    expect(comment.id).toBeGreaterThan(0);
  });

  it("logs time against the work package with only a workPackage link", async () => {
    const entry = await client.request("POST", "/time_entries", {
      body: {
        hours: toIsoDuration(0.25),
        spentOn: new Date().toISOString().slice(0, 10),
        _links: { workPackage: { href: `/api/v3/work_packages/${createdId}` } },
      },
    });
    expect(entry.id).toBeGreaterThan(0);
  });

  it("reads the notification feed with a readIAN filter", async () => {
    const result = await client.collection("/notifications", {
      filters: [{ readIAN: { operator: "=", values: ["f"] } }],
      pageSize: 5,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("accepts read_ian with filters as a query parameter", async () => {
    await client.request("POST", "/notifications/read_ian", {
      query: { filters: JSON.stringify([{ reason: { operator: "=", values: ["dateAlert"] } }]) },
    });
  });
});
```

- [ ] **Step 3: Run the live suite against a real instance**

```bash
OPENPROJECT_URL=https://your-instance \
OPENPROJECT_API_KEY=your-key \
OPENPROJECT_TEST_PROJECT=your-scratch-project \
npm run test:live
```

Every failure here is a real finding, not a flaky test. Fix the source, not the assertion:

- **Time entry rejected with a project error** — add `project: { href: "/api/v3/projects/{id}" }` to the `_links` in `src/tools/time.ts`, deriving the project from a `GET /work_packages/{id}` first.
- **`>d` rejected or returning everything** — try `<>d` with `values: [from, ""]`, then correct `buildSearchFilters` in `src/tools/workPackages.ts`.
- **`read_ian` ignoring the filters** — move them into the request body in `src/tools/notifications.ts`.

Amend the affected unit test to match reality, and note the correction in `CLAUDE.md` under "OpenProject APIv3 traps".

Then delete the work package the suite created, through the escape hatch it was designed for:

```bash
curl -X DELETE -u "apikey:$OPENPROJECT_API_KEY" \
  "$OPENPROJECT_URL/api/v3/work_packages/<id>"
```

- [ ] **Step 4: Write `README.md`**

````markdown
# OPerator

An MCP server that lets agents work inside your OpenProject instance — read and
update work packages, triage notifications, log time — while following your
workplace's written conventions.

## Setup

```bash
npx openproject-mcp setup
```

The wizard asks for your instance URL and an API key, checks them, and prints the
block to paste into your MCP client:

```json
{
  "mcpServers": {
    "openproject": { "command": "npx", "args": ["-y", "openproject-mcp"] }
  }
}
```

Get an API key from your OpenProject profile, under **Access tokens**. It belongs
to you, so the server already knows who you are — `my_work` and your notification
feed work with no further configuration.

## Two workplaces at once

Each workplace is a profile with its own credentials and its own rules:

```bash
npx openproject-mcp setup --profile acme
npx openproject-mcp setup --profile personal
```

Register both:

```json
{
  "mcpServers": {
    "openproject-acme": { "command": "npx", "args": ["-y", "openproject-mcp", "--profile", "acme"] },
    "openproject-personal": { "command": "npx", "args": ["-y", "openproject-mcp", "--profile", "personal"] }
  }
}
```

## Conventions

Every profile carries a markdown manual at
`~/.config/openproject-mcp/<profile>/conventions.md`. It is sent to the agent at
the start of every session, so your rules apply without anyone restating them:

```markdown
## Git / GitLab
- Branch: `{type}/{wp-id}-{slug}`  →  `bug/1234-fix-login-redirect`
- Commit subject: `[#1234] <imperative summary>`
- MR title must contain `#1234` so GitLab links back to the work package.

## Workflow
- Move to `In progress` only once a branch exists.
- Never close a work package yourself — set `Developed`, QA closes it.
```

Tell an agent a rule in conversation and it can record it with `add_convention`,
so the rule outlives the session. Rules are only ever appended; removing one takes
an explicit instruction from you, and the file is backed up first.

**Sharing with a team:** point everyone at one file.

```bash
OPENPROJECT_CONVENTIONS_PATH=/path/to/repo/conventions.md
```

Check that file into your repository and the manual becomes versioned, reviewed in
merge requests, and identical for everyone.

## Tools

| | |
|---|---|
| **Identity** | `whoami` |
| **Discovery** | `list_projects` · `list_users` · `get_work_package` · `search_work_packages` · `my_work` |
| **Tasks** | `create_work_package` · `update_work_package` · `comment_work_package` · `list_activities` · `link_work_packages` |
| **Notifications** | `list_notifications` · `mark_notifications_read` · `watch_work_package` |
| **Time & metadata** | `log_time` · `list_metadata` |
| **Conventions** | `conventions` · `add_convention` · `remove_convention` |
| **Escape hatch** | `api_request` |

There is no delete tool. Deletion is possible only through `api_request`, which
takes an explicit method and path — so it cannot happen by misreading an
instruction.

## Configuration

| Variable | Effect |
|---|---|
| `OPENPROJECT_URL` | Instance URL. Overrides the stored profile. |
| `OPENPROJECT_API_KEY` | API key. Overrides the stored profile. |
| `OPENPROJECT_PROFILE` | Profile to load. Same as `--profile`. |
| `OPENPROJECT_DEFAULT_PROJECT` | Project used when a tool's `project` is omitted. |
| `OPENPROJECT_CONVENTIONS_PATH` | Read the manual from somewhere else. |
| `OPENPROJECT_READ_ONLY` | Set to `1` to refuse every write. |

## Read-only agents

```json
{ "env": { "OPENPROJECT_READ_ONLY": "1" } }
```

Every create, update, comment, time entry, watch change, and convention edit is
refused before a request leaves the machine. Reads work normally.

## Development

```bash
npm install
npm test          # mocked, never touches a real instance
npm run build
```

Requires Node 20+. Two runtime dependencies. See `CLAUDE.md` for the working rules.

## License

MIT
````

- [ ] **Step 5: Verify the packaged install works end to end**

```bash
npm run build
npm pack
```

Confirm the tarball listing includes `dist/` and `templates/conventions.md` — the wizard copies the template from the package, so a tarball without it produces a setup that silently scaffolds nothing.

- [ ] **Step 6: Run everything one last time**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests pass, no type errors, `dist/` written.

- [ ] **Step 7: Commit**

```bash
git add -A
git -c user.name="Daniel Escalona" -c user.email="daescalona@proton.me" \
  commit -m "docs: README and live smoke suite against a real instance"
```

---

## Verification checklist

Before calling the project done, confirm each of these by running it:

- [ ] `npx vitest run` — every suite passes.
- [ ] `npx tsc --noEmit` — no type errors.
- [ ] `client.listTools()` returns exactly the twenty names in Task 12, Step 6.
- [ ] No file in `src/` exceeds 150 lines: `wc -l src/**/*.ts | sort -n`
- [ ] No comment restates its code: `grep -rn '^\s*//' src/` returns only the five documented cases.
- [ ] `grep -rn 'console\.log' src/` matches nothing outside `src/setup.ts`.
- [ ] `grep -rn 'delete_' src/` matches nothing.
- [ ] `package.json` `dependencies` has exactly two entries.
- [ ] `npm run test:live` passes against a real instance, or its failures have been fixed at the source.
- [ ] A real MCP client connects, shows twenty tools, and `whoami` returns your identity.
