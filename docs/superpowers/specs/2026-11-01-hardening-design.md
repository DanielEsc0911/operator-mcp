# Hardening — Design

**Date:** 2026-11-01 · **Branch:** `feat/hardening` · **Plan:** `docs/superpowers/plans/2026-11-01-hardening.md`
**Progress:** `docs/progress/2026-11-01-hardening.md`

## 1. Why

Two inputs drove this:

1. **A field test with Antigravity CLI (Gemini Flash).** "¿Qué tengo pendiente en OP?" took 93 s,
   ~50 steps and 128k tokens, shelled out to Python, and answered wrongly ("nothing pending").
   Causes: oversized responses that the client spills to files, `my_work` returning finished
   work because the instance marks only one status closed, no `isClosed` on statuses, and no
   single tool for the most common question. The `briefing` tool and lean lists (commit
   `25dc5c2`) cut that to 24 s, one call, 40k tokens and a correct answer. This round finishes
   the job.
2. **An external review of 44 points** covering safety, correctness, install/CLI, process. Each
   point was checked against KISS and YAGNI below. Duplicates with our own list are merged.

## 2. Principles applied to every ruling

- **KISS.** The smallest change that completely removes the failure. Prefer a validation, a
  default or a deleted branch over a new mechanism.
- **YAGNI.** No speculative options. A point is deferred when its fix costs more moving parts
  than the failure it prevents, and the deferral is written down.
- **Safety fails closed.** Anything an agent can be talked into by text it read on the instance
  (injection) must need an explicit `confirm: true` that the agent sets only on the user's
  word. Ambiguous safety settings mean "safe".
- **One call per common question.** Responses stay under ~8 KB so no client spills them to a file.
- **Every number tells the truth.** If a list is cut, say so (`total`, `truncated`).

## 3. Rulings

Codes: **M** = our list (agy field test), **R** = external review point number.
Verdict: **do**, **do (reduced)** = scope cut on purpose, **defer** = written down, not done.

### 3.1 Safety (Chunk 1)

| # | Problem | Verdict and design |
|---|---|---|
| R1 | `add_convention` persists any text into every future session's instructions; injection can plant rules | **do.** `add_convention` requires `confirm: true`; description says: only on the user's explicit request, show the exact rule first. Server instructions state that rules come only from the user, never from work package text. |
| R2 | `api_request` can archive projects, wipe fields, change roles; "no delete tools" oversells safety | **do (reduced).** Every non-GET `api_request` requires `confirm: true` (same contract as R1). Rewrite the CLAUDE.md/README invariant honestly: the API key's permissions are the boundary; read-only mode is the real guard. No allow-lists of paths (YAGNI). |
| R3 | `update_work_package` re-reads and sends the fresh `lockVersion`, silently clobbering a colleague's edit | **do.** Optional `lockVersion` argument. **Required when `description` is changed** (the clobber case); a 409 then tells the agent to re-read. Other field updates keep the convenience path. |
| R5 | Read-only flag fails open (`TRUE`, `yes`, `" 1"` → writable); cannot live in a profile | **do.** Parse trimmed, case-insensitive: `""`/unset/`0`/`false`/`no`/`off` → writable, anything else → read-only. Profiles accept `readOnly: true`; `setup --read-only` writes it. Env still overrides. |
| R8 | 2xx with non-JSON body becomes `null` → crash after a committed write; timed-out POST invites duplicate retries | **do.** A 2xx whose body is not JSON (and not 204/empty) throws a typed error: "The server answered with a non-JSON page (proxy or login page?). A write may already have happened — check before retrying." A timeout on a non-GET says the same. No idempotency keys (OpenProject has none). |
| R9 | `mode: 0o600` only applies on create | **do (reduced).** `chmodSync(0o600)` after writing the config file (it holds keys). Agent config files and the manual hold no secrets: unchanged. |
| R10 | `mark_notifications_read {all:true}` empties the inbox unconfirmed | **do.** `all: true` requires `confirm: true`. |
| R29 | Empty env vars override stored values; env key not trimmed | **do.** Empty/whitespace env values count as unset; trim URL and key. |
| R31 | Corrupt `config.json` reads as empty, setup then overwrites it | **do.** Throw `ConfigError` naming the path and the parse error. Setup refuses to overwrite a corrupt file and says how to move it aside. |
| R36 | Conventions editor: fenced code treated as headings, `oneLine` mangles `#1234`/`**Never**`, duplicates, non-atomic writes, multi-line/nested bullets, `.bak` pile-up, stderr-only size warning, startup snapshot | **do (reduced).** Fence-aware parsing; `oneLine` strips only a leading bullet marker (`- `, `* `, `+ `); exact-duplicate rule is a no-op reported as such; write via temp file + rename and serialise calls in-process; removal matches a bullet with its continuation and nested lines; one rolling `.bak`; size warning returned in the tool result; add/remove results say "takes effect next session; `conventions` shows the current text". **Defer:** `## Heading ##` closing hashes, duplicate section names (rare, hand-edited files only). |
| R44c | Instructions embed instance name/email verbatim (injection surface) | **do.** Identity line strips control characters/newlines and caps each value at 80 chars. Email kept: it is what "me" means. |

### 3.2 Agent tools: speed, scope, correctness (Chunk 2)

| # | Problem | Verdict and design |
|---|---|---|
| M1 | Clients prompt for every tool | **do.** MCP `annotations` on every tool: `readOnlyHint: true` on reads; `destructiveHint` on `api_request`, `remove_convention`, `mark_notifications_read`; `idempotentHint` where true. |
| M2 + R24 | `briefing` is 10.7 KB (spilled to file); scopes mixed; `byStatus` counts only the first 100; one failing sub-request fails all; filters built serially | **do.** Target < 6 KB on the live instance. Pending rows drop `assignee`, `type`, `url` (the agent builds it from `urlTemplate` given once) and are **grouped by project**. True counts via OpenProject `groupBy=status` (verify live; fall back to counting with a "counted first N" note). Notifications collapsed per work package (`count`, `reasons`, latest actor/time). All three sections share one scope: the default project when set, else the whole instance — and the result says which. `recentlyChanged` is renamed to `teamActivity` with "changed by anyone in scope" in the description. `Promise.allSettled`: a failed section becomes `{ error }`. Filter building runs inside the parallel branches. |
| M3 + R20 | "What's going on with #X" needs 3–4 calls; `list_activities` shows the oldest entries | **do.** `get_work_package` adds `parent` (id + subject from the link title, no extra call) and `latestComments` (3 newest, text capped at 500 chars) in one extra request. `list_activities` returns newest first and honours `limit` (verify `pageSize` live; slice locally if ignored). |
| M4 | "What did I do yesterday / standup" | **do.** `standup` tool, `since` (local date, default previous working day): my time entries since (total hours + rows), my assigned work packages changed since with current status. Two requests in parallel. No "comments by me" (no API filter; YAGNI). |
| M5 + R25 | `my_work` returns up to 50 rows, no `total`; no paging past 100 | **do.** `my_work` default limit 20 and returns `{ total, results }`. `my_work` and `search_work_packages` accept `page` (1-based, maps to `offset`). |
| M6 | Small models hesitate between tools | **do.** Server instructions carry a short intent map: pending/new/plate → `briefing`; one item → `get_work_package`; yesterday/standup → `standup`; anything unknown → `list_metadata` before writing. |
| R11 | `today()` and `daysAgo` use the UTC date (wrong day in Caracas after 20:00) | **do.** One `localDate(offsetDays)` helper used by `log_time`, `briefing`, `standup`. |
| R12 | Startup blocks on `me()` (30 s) before connecting; `readConventions` throws on EISDIR/EACCES | **do.** Identity lookup at startup gets a 5 s timeout and falls back to the "unresolved" line. `readConventions` returns `null` on any read error and writes one stderr line. |
| R16 | Lists stop at 200 silently (projects, users, metadata, user resolution) | **do.** `client.collectAll(path, params)` pages until `total`, hard stop at 2,000 items with `truncated: true`. Used by metadata, users, projects, user resolution. `list_projects` returns `{ total, projects }`. |
| R17 | `resolveUserHref` hard-codes `/users/{id}` for groups/placeholders; first of duplicate names wins; email match fails for non-admins | **do.** Use the match's `_links.self.href`. Two or more exact name matches → error listing them with ids. Email match stays as a bonus (works for admins); not-found message says "use the numeric id" when names are ambiguous. |
| R18 | `search_work_packages.assignee` takes only `me`/id; `list_notifications.project` only a numeric id | **do.** Both go through the resolvers (name, id, identifier, `me`). |
| R19 | `"Open"` ≠ `"open"` | **do.** Compare case-insensitively after trim. |
| R21 | Metadata cache never expires; key ignores the user | **do.** On a not-found, refetch once and retry before erroring. Cache key includes the profile name. No TTL (YAGNI). |
| R22 | Type resolved against the default project, not the work package's; empty strings silently dropped | **do.** Resolve type against the work package's own project (from the GET already made). Name fields use `.min(1)`; checks use `!== undefined`. |
| R23 | Starter manual demands `Version`; no tool sets version; dates cannot be cleared | **do (reduced).** Add `version` (name or id, resolved in the work package's project) to `WRITE_SCHEMA`. `startDate`/`dueDate` accept `null` to clear. **Defer:** category, accountable, estimates, custom fields → `api_request` (documented in the tool description). Starter manual keeps the `Version` rule (now satisfiable). |
| R26 | `mark_notifications_read ids` partial failure; no validation | **do.** Positive ints, max 100. Use the bulk `POST /notifications/read_ian` with an `id` filter — one atomic request (verify live). |
| R27 | No response size limits | **do.** `limit` capped at 100 everywhere. `api_request` truncates bodies over 50 KB with a note. Descriptions in `get_work_package` capped at 20,000 chars with `descriptionTruncated: true`. |
| R28 | `hours: 0.004` → `PT0H` | **do.** Minimum one minute (`hours >= 1/60`); error says so. |
| R43 | `<>d` comment sits above `statusFilter`, not its line | **do.** Move it to the `updatedAt` line. |
| R44a/b | `version` duplicated in `server.ts`; import order | **do.** Read `version` from `package.json` once (JSON import), delete the duplicate and its guard test. Fix import order. |

### 3.3 Install, setup, CLI, doctor (Chunk 3)

| # | Problem | Verdict and design |
|---|---|---|
| R4 | Re-running install drops user `env` (incl. `OPENPROJECT_READ_ONLY`) and other fields, re-enables opencode | **do.** Every client merges: existing entry fields (`env`, `enabled`, `timeout`, …) are kept; only `command`/`args` are replaced. Claude Code: read the existing entry (`claude mcp get`) and pass its env back with `-e`. Codex: TOML merge keeps other keys, including inline `env = {…}`. Tests per client. |
| R6 | `npx -y operator-mcp` runs the newest npm publish forever | **do.** Register `npx -y operator-mcp@<this version>`. Re-running `install` after an upgrade bumps it. |
| R13 | Codex TOML: CRLF, reads past its table, quoted/spaced headers | **do.** Normalise line endings on read (write back with the file's original EOL), stop at the next `[` header, match `[mcp_servers.openproject]`, `[mcp_servers."openproject"]` and inner spaces. |
| R14 | Windows: `spawnSync("claude")` misses `claude.cmd`; bare `npx` fails in JSON clients | **do.** `shell: true` on win32 for `claude`; JSON entries on win32 use `command: "cmd", args: ["/c", "npx", …]`. |
| R15 | `bunx operator-mcp setup` registers `bun` with no script | **do.** Only treat `execPath` as the server when running the compiled binary (no script argument); otherwise register the npx form. |
| R30 | `--profile=work` and bare `--profile` fall back to default; `setup --help` runs setup; unknown flags ignored | **do.** Accept `--flag=value`; a flag missing its value is an error; `--help` works on every subcommand; unknown flags exit 2 with a suggestion. |
| R32 | doctor crashes on `http://`, "reachable" = any response, reasons lost | **do.** doctor catches config errors and reports them as a failed check; reachability requires `/api/v3` to answer JSON with `_type: "Root"`; the underlying error text is printed. |
| R33 | "fetch failed" hides `ENOTFOUND`/`ECONNREFUSED`/cert errors | **do.** Append `error.cause.code` and message; a certificate error suggests `NODE_EXTRA_CA_CERTS`. **Defer:** `HTTPS_PROXY` under Node (document: Node ≥ 24 `NODE_USE_ENV_PROXY=1`). |
| R34 | `choose()` accepts out-of-range numbers as a project id | **do.** Out-of-range number re-prompts. |
| R35 | `confirmList` sorts numbers as text | **do.** Numeric sort. |
| R37 | JSONC rejected by `editJson`, read as `{}`; `opencode.jsonc` ignored; project-scoped Claude entries invisible; backups pile up | **do (reduced).** Reading tolerates comments (small string-aware stripper). Writing a file that contains comments is refused with the manual snippet (no comment-losing rewrite). Look for `opencode.jsonc`. doctor uses `claude mcp get`, which reports any scope. One rolling `.bak`. |
| R38 | Masked input: ESC drops pasted key (bracketed paste); stdin left resumed; Ctrl-C during spinner | **do.** Strip `ESC[200~`/`ESC[201~`; lone ESC ignored; `pause()` after; restore cooked mode and exit 130 on SIGINT during network steps. |
| R39 | Choosing "none" in setup silently erases the default project | **do.** Default choice is "keep current"; erasing is an explicit option that names what is removed. |

### 3.4 Release and testing (Chunk 4)

| # | Problem | Verdict and design |
|---|---|---|
| R7 | Actions on movable tags; unpinned `npm@11` with `id-token`; tarball rebuilt after verify; no signatures; separate install domain | **do (reduced).** Pin every action to a commit SHA (tag in a comment). Pin npm to an exact version. Publish the exact tarball `verify` produced (upload/download artifact). Add `actions/attest-build-provenance` for binaries and tarball; README shows `gh attestation verify`. **Defer:** moving `install.sh` off `operator.daer.dev` — documented as a trust point, the script already verifies `SHA256SUMS` from GitHub Releases. |
| R40 | `test-live` not type-checked, stale, leaves data behind, marks real notifications read, order-dependent | **do.** `tsconfig.test.json` covering `test/` and `test-live/`, `npm run typecheck` runs both, CI runs it. Live tests: each creates its own fixture and deletes it in `afterAll` (DELETE through the client with `allowDelete`), never touch real notifications, no shared state. |
| R41 | Mocked tests encode our assumptions (`>d` passed) | **do.** A disposable OpenProject in Docker: `npm run test:docker` starts the official all-in-one image, seeds an admin API key, runs `test-live`, tears down. CI runs it on `workflow_dispatch` and weekly, not on every push (minutes and RAM). Live checks cover every operator and endpoint shape this plan assumed (`<>d`, `groupBy`, `read_ian` id filter, activities `pageSize`). |
| R42 | Binary runs on Bun, tests on Node | **do (reduced).** CI builds the binary and runs a smoke script against it: `--version`, MCP `initialize` + `tools/list` + one tool call against a local stub HTTP server, and `setup --non-interactive` into a temp HOME. No full Bun test port (YAGNI). |

## 4. Out of scope (deferred, with reason)

- Path allow-lists for `api_request` — `confirm` + read-only mode cover the risk with less code.
- Category/accountable/estimates/custom fields in write tools — `api_request` covers them; add when a real convention needs one.
- `## Heading ##` and duplicate section names in the manual — hand-edit edge cases.
- `HTTPS_PROXY` support under Node — documented workaround.
- Moving `install.sh` hosting — documented; checksums come from GitHub.

## 5. Invariants this round changes

- "No `delete_*` tools" stays, and CLAUDE.md gains the honest framing: the key's permissions
  are the boundary; every non-GET through `api_request`, every manual edit and every bulk
  notification change needs `confirm: true`; read-only mode (env or profile) is the hard guard.
- The comment count in `src/` changes; each new comment records an external constraint and
  CLAUDE.md's count is updated to match.
- Runtime dependencies stay at two.
