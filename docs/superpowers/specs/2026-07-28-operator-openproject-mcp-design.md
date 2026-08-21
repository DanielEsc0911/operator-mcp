# OPerator — an OpenProject MCP server

**Date:** 2026-07-28
**Status:** Approved design

## Summary

OPerator is a stdio MCP server that lets agents work inside an OpenProject
instance: read and update work packages, triage notifications, log time, and
follow the host organization's written conventions while doing it.

It ships as the npm package `openproject-mcp` and runs with no install step:

```json
{ "mcpServers": { "openproject": { "command": "npx", "args": ["-y", "openproject-mcp"] } } }
```

## Goals

- Zero-friction setup. One wizard command, no editing JSON by hand.
- The agent knows who it is, so "my tasks" and "my notifications" work without
  the user restating their identity.
- Complete coverage of OpenProject APIv3 without a tool for every endpoint.
- Each workplace carries its own conventions manual, delivered to the agent
  automatically at connection time.
- Agents cannot destroy work by accident.

## Non-goals

- OAuth2 and JWT authentication. API keys only.
- Attachments and file uploads. Multipart adds meaningful complexity for a
  workflow agents rarely need.
- Admin operations: creating users, editing roles, changing instance settings.
- HTTP transport. stdio only.

## Naming and packaging

| | |
|---|---|
| Brand | OPerator |
| npm package | `openproject-mcp` |
| Binary | `openproject-mcp` |
| Repository | `OPerator` |

The package name is descriptive so it can be found; the brand hides "OP" inside
a word describing what it does.

Node 20+. Two runtime dependencies: `@modelcontextprotocol/sdk` and `zod`.
Native `fetch` and `node:readline` cover the rest — no axios, commander,
inquirer, or dotenv.

## Architecture

```
OPerator/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            bin entry: `setup` → wizard, otherwise → server
│   ├── server.ts           MCP server construction, instructions, registration
│   ├── setup.ts            interactive wizard
│   ├── config.ts           profile resolution, env precedence, save/load
│   ├── conventions.ts      read, append, remove, backup
│   ├── client.ts           OpenProjectClient
│   ├── hal.ts              HAL+JSON → flat objects
│   ├── errors.ts           OpenProjectError → human message
│   └── tools/
│       ├── identity.ts     whoami, list_projects, list_users
│       ├── workPackages.ts get, search, my_work, create, update,
│       │                   comment, list_activities, link
│       ├── notifications.ts list, mark_read, watch
│       ├── time.ts         log_time
│       ├── meta.ts         list_metadata
│       ├── conventions.ts  conventions, add_convention, remove_convention
│       └── raw.ts          api_request
└── test/
```

No file exceeds ~150 lines. `OpenProjectClient` is the only class. No dependency
injection, no plugin registry, no abstract base classes.

## Configuration and profiles

One profile per workplace. Each profile is a directory:

```
~/.config/openproject-mcp/
├── acme/
│   ├── config.json
│   └── conventions.md
└── personal/
    ├── config.json
    └── conventions.md
```

`config.json`:

```json
{
  "url": "https://op.acme.com",
  "apiKey": "...",
  "defaultProject": "website"
}
```

Written at mode `600`, in a directory at mode `700`.

`defaultProject` is the fallback for every tool taking an optional `project`
argument. An explicit argument always wins; when neither is present the tool
queries across all visible projects.

**Resolution order**, highest priority first:

1. `--profile <name>` CLI argument
2. `OPENPROJECT_PROFILE` environment variable
3. `default`

**Per-setting precedence**, environment over file:

| Setting | Environment variable |
|---|---|
| Instance URL | `OPENPROJECT_URL` |
| API key | `OPENPROJECT_API_KEY` |
| Default project | `OPENPROJECT_DEFAULT_PROJECT` |
| Conventions file path | `OPENPROJECT_CONVENTIONS_PATH` |
| Read-only mode | `OPENPROJECT_READ_ONLY` |

Running two workplaces at once means registering the server twice with
different `--profile` arguments.

`loadConfig()` normalizes the URL: trailing slashes and a trailing `/api/v3`
are stripped, so users can paste whatever they have in the address bar.

When neither environment nor file supplies a URL and key, the server still
starts and every tool returns one message: `Not configured. Run: npx
openproject-mcp setup`. Starting successfully matters — a server that exits on
missing config shows up in MCP clients as a crash with no explanation.

### Setup wizard

`npx openproject-mcp setup [--profile <name>]`

1. Prompt for the instance URL. Normalize it.
2. Prompt for the API key, echo suppressed.
3. `GET /api/v3/users/me` to validate. On failure, explain and re-prompt.
4. `GET /api/v3/projects` and offer the visible projects as an optional default.
5. Write `config.json` at mode `600`.
6. Write a starter `conventions.md` if none exists.
7. Print the exact MCP client JSON block to copy.

## Identity

An OpenProject API key belongs to a user, so identity needs no configuration.
On the first tool call the server resolves `GET /api/v3/users/me` once and
caches `{ id, name, email }` for the process lifetime.

Filters that target the current user pass OpenProject's literal `me` value
rather than a numeric id, so nothing depends on the cache being warm.

## OpenProject APIv3 notes

Details that shape the implementation and are easy to get wrong:

- **Auth:** `Authorization: Basic base64("apikey:" + <apiKey>)`.
  (Corrected 2026-08-19: this spec originally said `Bearer <apiKey>`, which is
  OAuth2-only and 401s for a personal API key.)
- **Filters** are a URL-encoded JSON array of single-key objects:
  `filters=[{"assignee":{"operator":"=","values":["me"]}}]`
- **Status open/closed** uses operators, not values: `{"status":{"operator":"o","values":[]}}`
  for open, `"c"` for closed.
- **Text search:** `{"search":{"operator":"**","values":["login"]}}`
- **Pagination:** `offset` is a **1-based page number**, not a record offset.
  `pageSize` is items per page.
- **PATCH requires `lockVersion`.** Updates fetch the work package first to read
  the current value. This is optimistic locking; a stale value returns 409.
- **Time entry hours are ISO 8601 durations.** 2.5 hours is `"PT2H30M"`.
- **Comments** are `POST /api/v3/work_packages/{id}/activities` with body
  `{"comment": {"raw": "..."}}`.
- **Assignable people:** `GET /api/v3/projects/{id}/available_assignees` respects
  permissions and is correct where `/api/v3/users` requires admin rights.
- **Collections** return members under `_embedded.elements`, with `total` and
  `count` at the root.

Exact request shapes are verified against a live instance during
implementation; the live smoke suite exists for that purpose.

## HAL flattening

A raw work package is roughly 4 KB of HAL with dozens of `_links`. Every tool
returns a flat object instead. `hal.ts` exposes pure helpers — `linkTitle`,
`linkId`, `flattenWorkPackage`, `flattenNotification`, `flattenProject` — and
nothing else.

```json
{
  "id": 1234,
  "subject": "Fix login redirect",
  "type": "Bug",
  "status": "In progress",
  "priority": "High",
  "project": "Website",
  "assignee": "Daniel Escalona",
  "author": "Ana Ruiz",
  "startDate": "2026-07-28",
  "dueDate": "2026-08-03",
  "percentageDone": 40,
  "lockVersion": 7,
  "updatedAt": "2026-07-28T09:14:02Z",
  "url": "https://op.acme.com/work_packages/1234"
}
```

`description` is included by `get_work_package` and omitted from list results,
where it would dominate the payload.

`url` is present on every flattened resource so agents can hand the user a
clickable link instead of a bare id.

## Tool catalogue

Twenty tools. Signatures are indicative TypeScript; inputs are declared as Zod
schemas, which double as the documentation the agent reads.

### Identity and discovery

```ts
whoami()
  → { user, email, instanceUrl, profile, defaultProject, readOnly, conventionsLoaded }

list_projects(query?: string)
  → Project[]

list_users(project?: string, query?: string)
  → User[]   // available_assignees when project is given, principals otherwise
```

### Work packages

```ts
get_work_package(id: number)
  → WorkPackage   // includes description

search_work_packages({
  project?: string, assignee?: string, status?: "open" | "closed" | string,
  type?: string, priority?: string, query?: string, updatedSince?: string,
  sortBy?: string, limit?: number
}) → { total, results: WorkPackage[] }

my_work(status?: "open" | "closed", limit?: number)
  → WorkPackage[]   // assignee=me, sorted by due date ascending

create_work_package({
  project: string, type: string, subject: string, description?: string,
  assignee?: string, status?: string, priority?: string,
  startDate?: string, dueDate?: string, parent?: number
}) → WorkPackage

update_work_package({
  id: number, subject?, description?, status?, assignee?, priority?,
  type?, startDate?, dueDate?, percentageDone?, parent?
}) → WorkPackage   // reads lockVersion internally

comment_work_package(id: number, comment: string)
  → { id, createdAt, url }

list_activities(id: number, limit?: number)
  → Activity[]   // comments and field changes, chronological

link_work_packages(from: number, to: number,
  type: "relates" | "duplicates" | "blocks" | "precedes" | "includes" | "requires")
  → Relation
```

`search_work_packages` accepts plain arguments and builds the JSON filter
string itself. Agents never write HAL filter syntax.

Reference arguments accept either a numeric id or a name, resolved through the
metadata endpoints. `assignee: "me"` is passed through to OpenProject.

In `status`, the strings `open` and `closed` are reserved: they map to the
operators `o` and `c` and match any status in that class. Every other value is
treated as a specific status name or id.

### Notifications

```ts
list_notifications({ unreadOnly?: boolean, reason?: string,
                     project?: string, limit?: number })
  → { total, notifications: Notification[] }

mark_notifications_read({ ids?: number[], all?: boolean,
                          reason?: string, project?: string })
  → { marked: number }

watch_work_package(id: number, watching: boolean)
  → { id, watching }
```

`reason` is one of OpenProject's values: `assigned`, `mentioned`, `commented`,
`created`, `dateAlert`, `prioritized`, `processed`, `responsible`,
`subscribed`, `scheduled`, `watched`.

`mark_notifications_read` requires either `ids` or `all: true`. With `all`, the
optional filters narrow what gets marked.

### Time and metadata

```ts
log_time({ workPackageId: number, hours: number,
           date?: string, comment?: string, activity?: string })
  → TimeEntry   // hours converted to ISO 8601 duration

list_metadata(kind: "types" | "statuses" | "priorities" | "activities",
              project?: string)
  → { id, name }[]
```

One `list_metadata` tool replaces four near-identical lookups. The results are
cached for the process lifetime; this data effectively never changes.

### Conventions

```ts
conventions()
  → string   // the manual verbatim

add_convention(section: string, rule: string)
  → { section, rule, path }

remove_convention(section: string, rule: string, confirm: boolean)
  → { removed, backupPath }
```

### Escape hatch

```ts
api_request(method: "GET" | "POST" | "PATCH" | "DELETE",
            path: string, query?: object, body?: object)
  → unknown   // raw APIv3 response, unflattened
```

`path` is relative to `/api/v3`. This exists so no OpenProject capability is
ever out of reach, and so deletion requires a deliberate, explicit call.

### Deliberately absent

No `delete_work_package`, `delete_project`, or `delete_comment`. Destruction is
reachable only through `api_request`, where it cannot happen by misreading a
vague instruction.

## Conventions system

Each workplace carries a markdown manual of its own rules — branch naming,
commit format, workflow states, required fields. It reaches the agent through
three layers so it works regardless of client capabilities.

**1. Server `instructions`.** MCP's `initialize` response carries an
`instructions` string that clients surface to the model automatically. The
server injects live context followed by the manual verbatim:

```
You are Daniel Escalona (daescalona@proton.me) on https://op.acme.com,
profile "acme". Default project: website.

Follow these conventions in all OpenProject work:

<contents of conventions.md>
```

This is the guarantee that an agent has seen the rules before it acts.

**2. The `conventions` tool.** Returns the same manual on demand — a fallback
for clients that drop `instructions`, and a way to re-read mid-session.

**3. Resource `openproject://conventions`.** Lets GUI clients surface the
manual in a picker.

### Size

The manual is injected on every session, so it costs tokens every time. The
server prints a warning to stderr at startup when the file exceeds 10 KB. It is
never truncated — silently dropping half a company's rules is worse than a
large prompt.

### Team sharing

`OPENPROJECT_CONVENTIONS_PATH` points at any file. A team checks
`conventions.md` into its repository and points every agent at that path: one
manual, versioned in git, changed through merge requests. No synchronization
code in this server.

### Editing

`add_convention(section, rule)` appends a bullet under the given heading. The
heading is matched case-insensitively at any level; when no heading matches, a
new `##` section is created at the end of the file. This is how a rule
mentioned in passing survives the session.

`remove_convention(section, rule, confirm)` refuses unless `confirm` is `true`.
The tool description states that `confirm` may only be set when the user has
explicitly asked for that removal in the current conversation. The rule is
matched against the exact text of a bullet, after its marker; if nothing
matches, the tool changes nothing and returns the section's current bullets so
the agent can retry against real text rather than guess. Every removal first
copies the file to `conventions.md.<timestamp>.bak`, so a mistaken deletion is
always recoverable.

Both are disabled under `OPENPROJECT_READ_ONLY`.

### Starter template

Written by the wizard when no manual exists:

```markdown
# <Workplace> — OpenProject conventions

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

## Project: Website
- Bugs also need the `Browser` custom field.
```

Per-project rules are a markdown heading. No extra machinery.

## Read-only mode

`OPENPROJECT_READ_ONLY=1` makes every mutating tool refuse before issuing a
request: all creates, updates, comments, time entries, watch changes,
convention edits, and any non-`GET` `api_request`. The refusal names the
environment variable so the cause is obvious.

`whoami` reports the mode so an agent can plan around it rather than
discovering it through failures.

## Error handling

Tools return readable MCP errors. Stack traces never reach the agent.

| Condition | Message |
|---|---|
| No config | `Not configured. Run: npx openproject-mcp setup` |
| 401 | `API key rejected by https://op.acme.com — regenerate at /my/access_token` |
| 403 | `Your account lacks permission to <action> in <project>` |
| 404 | `Work package 1234 not found (or not visible to you)` |
| 409 | `Work package 1234 changed while you were editing it. Read it again and retry.` |
| 422 | OpenProject's own validation messages, passed through verbatim |
| Network | `Cannot reach https://op.acme.com: <reason>` |
| Read-only | `Server is in read-only mode (OPENPROJECT_READ_ONLY)` |

422 responses carry OpenProject's field-level messages under
`_embedded.errors[].message`; they are already clear and are surfaced unchanged.

Requests time out after 30 seconds.

## Testing

Vitest.

| Unit | Coverage |
|---|---|
| `hal.ts` | Flattening, against captured real HAL fixtures. Missing and null `_links`. |
| `config.ts` | Profile resolution, env precedence, URL normalization, file permissions. |
| `conventions.ts` | Append into existing and missing sections, removal backups, confirm gate. |
| `client.ts` | Mocked `fetch`: auth header, filter encoding, page-number pagination, error mapping. |
| `tools/*` | Mocked client: asserts the request each tool builds. |
| `server.ts` | `instructions` contains identity and manual; read-only blocks writes. |

Fixtures are real HAL responses captured once and committed, so tests stay
honest about the API's actual shape.

`npm run test:live` runs a smoke suite against a real instance, executing only
when `OPENPROJECT_URL` and `OPENPROJECT_API_KEY` are present. It never runs in
CI and only creates work packages inside a project named in
`OPENPROJECT_TEST_PROJECT`.

## Code style

Recorded in `CLAUDE.md`:

- Self-explanatory names over comments. Comment only what code cannot express —
  `lockVersion` optimistic locking, `offset` meaning page number, ISO 8601
  duration conversion, the `o`/`c` status operators.
- One file per domain, none over ~150 lines.
- `OpenProjectClient` is the only class.
- Zod schemas describe every tool input and serve as its documentation.
- Two runtime dependencies. Adding a third needs a reason.
- No abstraction without a second caller.

## Deliverables

1. `CLAUDE.md` — the working spec for agents editing this repository.
2. `README.md` — install, setup, MCP client configuration, conventions guide.
3. The server, wizard, and tests above.
4. A `conventions.md` template shipped in the package.

## Deferred

- Attachments and file uploads.
- OAuth2 and JWT authentication.
- Custom field discovery. Custom fields pass through `api_request` today.
- Webhooks and push notifications. The server is request-response only.
