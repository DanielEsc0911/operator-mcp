# Hardening — Progress

**Spec:** `docs/superpowers/specs/2026-11-01-hardening-design.md`
**Plan:** `docs/superpowers/plans/2026-11-01-hardening.md`
**Branch:** `feat/hardening` (baseline `25dc5c2`)

Each chunk runs as one fresh agent. The agent ticks its rows here and appends a short hand-off
note for the next agent: what was done, what deviated from the plan and why, and anything left
open, with the commit range.

| Step | Status | Notes |
|---|---|---|
| Field test with agy (93 s → 24 s) | done | `briefing`, lean lists, `<>d` fix — `25dc5c2` |
| Review triage (44 points + 6) | done | Rulings in spec §3, deferrals in §4 |
| Spec + plan | done | |
| Chunk 1 — Safety and the manual (1a–1g) | done | `ca9a34e`..`dbecbbe` |
| Chunk 1 — review fixes (F1–F16) | done | `e788bcb`..`718e3f7` |
| Chunk 2 — Agent tools (2a–2i) | done | `b636897`..`26d77aa` (2i skipped) |
| Chunk 2 — review fixes (G1–G14) | done | `47978c9`..`65457ed` |
| Chunk 3 — Install, setup, CLI, doctor (3a–3f) | done | `a6b40bf`..`2d2a636` |
| Chunk 4 — Release, testing infra, final gate (4a–4f) | 4a–4e done, 4f pending | `6c295e0`..`3a2e130` |

## Hand-off notes

### Triage (orchestrator, 2026-11-01)

- Live instance facts: only "Traspasado" has `isClosed: true`; "Culminado" (100 %) and
  "Rechazado" count as open. `updatedAt` rejects `>d`; `<>d` with `["YYYY-MM-DD", ""]` works.
- agy reads tool schemas from its cache in `~/.gemini/antigravity-cli/mcp/openproject/` and its
  server entry lives in `~/.gemini/config/mcp_config.json` (points at `~/.local/bin/operator-mcp`,
  the released binary). Do not edit the user's agent configs.
- Never touch the user's real OpenProject instance from a chunk. Live checks go to Docker.

### Chunk 1 (2026-11-01, `ca9a34e`..`dbecbbe`)

Done: 1a `requireConfirm` helper (in `tools/shared.ts`; read-only wins over confirm), 1b `lockVersion`,
1c config fail-closed (`parseReadOnly`, `readStored` exported, `setup --read-only`), 1d client integrity
(`UnexpectedResponseError`), 1e identity sanitising, 1f conventions editor, 1g docs. 350 tests green.

Deviations:
- No in-process mutex for the manual: add/remove are fully synchronous (read, modify, temp+rename), so
  concurrent tool calls cannot interleave. Test covers four concurrent adds.
- `setup` keeps an existing profile's `readOnly: true` when re-run without the flag (otherwise a re-run
  would silently drop it). `storedCredentials` now returns the parsed `StoredConfig` and throws on a
  corrupt file instead of returning `{}`.
- The rolling backup is `conventions.md.bak` (rolling). Agent-config backups in `clientFiles.ts` are still
  timestamped: that is Chunk 3 (R37).
- Non-GET timeout gets the "write may have happened" text; other network errors keep "Cannot reach".
- The `whoami` rejected-key test reused one `Response`; now returns a fresh one per call (body is read once).
- Comment count unchanged (8). `codegraph_impact` was not available as a tool; the `shared.ts` change is
  an additive export only.

Open for later chunks:
- `readConventions` still throws on EISDIR/EACCES (R12, Chunk 2). `MANUAL_WARNING_BYTES` now lives in
  `conventions.ts` (exported), server imports it.
- `list-notifications` etc. unchanged; `mark_notifications_read ids` still loops per id (R26, Chunk 2).
- `doctor` calls `loadConfig`; it must catch the new `ConfigError` for corrupt files (R32, Chunk 3).
- New usage line `--read-only` added to en/es help; Chunk 3c should keep it when reworking flags.

### Chunk 2 (2026-11-01, `b636897`..`26d77aa`)

Done: 2a annotations + intent map, 2b `localDate`/5 s identity cap/`readConventions` never throws, 2f
`collectAll` + resolvers, 2c briefing v2, 2d work package context, 2e `standup` + paging, 2g write tools,
2h small items. 382 tests green. Commit order is 2a, 2b, 2f, 2c, 2d, 2e, 2g, 2h: briefing needs
`resolveProjectId` and `collectAll` from 2f.

Live checks (disposable `openproject/openproject:16`, since removed):
- `groupBy=status`: the response has a top-level `groups: [{ value, count, _links }]`; `pageSize=1` is enough.
- Activities: `pageSize` and `sortBy` are both ignored (all entries, oldest first). Newest-first and `limit` are
  done locally.
- `POST /notifications/read_ian` with `filters=[{"id":{"operator":"=","values":["1","2"]}}]` returns 204 and
  marks exactly those; an unknown filter name gives 400.
- Time entries: `user = me` and `spentOn <>d [date, ""]` work (the System user itself is rejected, irrelevant
  in practice). Whole server also exercised end to end through stdio against the container.

Deviations:
- Comments in `src/` are now ten (new: activities endpoint contract; the `<>d` note is now its own comment).
  CLAUDE.md and the reviewing skill say ten.
- `list_activities` moved to new `src/tools/activities.ts` (`registerActivityTools`) to keep the write file small.
- `client.collection` gained optional `groupBy` and returns `groups`. `hal.ts` gained `linkHref`;
  `flattenWorkPackage` detail now returns `parent: { id, subject }` and caps the description.
- Briefing pending rows keep `priority`; the 6 KB test uses 25 open items + 50 notifications (50 pending rows
  alone are about 6 KB). `list_users` still returns an array (only `list_projects` reports `truncated`).
- `list_metadata` accepts `versions` (project-scoped) so agents can discover version names.
- `version` is read with `createRequire(import.meta.url)("../package.json")` (tsc `rootDir` forbids a JSON
  import). The guard test "reports the package version" was deleted.
- `codegraph_impact` was not available; changes to `client.ts`, `hal.ts`, `resolve.ts` are additive except
  `listMetadata`'s cache key (now includes profile) and `resolveUserHref` (self href, ambiguity error).
- 2i skipped: agy not run; no instance of the user was touched.

Open for later chunks:
- (superseded by G3: literal version) Chunk 4 binary smoke: confirm `createRequire(...)("../package.json")` works in the Bun-compiled binary
  (fall back to a generated constant if not).
- Live suite (R41) should cover the shapes above (`groupBy`, `read_ian` id filter, activities, `spentOn`).
- Notifications are not generated for self-made changes in the Docker image; seed them with `rails runner`
  (`Notification.create!`) when the live suite needs them.

### Chunk 1 review fixes (2026-11-01, `e788bcb`..`718e3f7`)

All of F1–F16 done, 397 tests green, no new code comments.
- F1: fetch and body read share one try; non-GET failures become `UnexpectedResponseError` ("write may already have happened"), GET keeps "Cannot reach". The old "did not answer" wording is gone.
- F2: `storedReadOnly` in `config.ts` is the one predicate for `loadConfig` and setup.
- F3: ReadOnlyError text names profile `readOnly` and the env var.
- F4: `patchWorkPackage` helper (not inside the handler) rethrows a 409 with the compare-and-ask text when the body has `description`. README softened: without a passed `lockVersion` the tool uses the current one, so no protection.
- F5-F9, F13: `conventions.ts` split; parsing moved to new `src/manualText.ts` (listed in CLAUDE.md). Lazy continuations, mode kept, CRLF kept, top-level-only dedupe and removal, unclosed fence throws naming the line. `parse` is a plain loop with `closesFence`.
- F11: non-HTML non-JSON 2xx GET says "<path> is not a JSON resource (content-type X)".
- F12: blank `OPENPROJECT_PROFILE` is unset. F14: concurrent test deleted. F16: bidi/format characters stripped.
- F15: interactive `setup --read-only`, `~~~` and nested-backtick fences, read-only before confirm on `api_request` and `mark_notifications_read`. The read-only-precedence tests passed already (regression guards).

Deviation: `removeRule` also lists only top-level bullets now (consistent with F8).

### Chunk 3 (2026-11-01, `a6b40bf`..`2d2a636`)

Done: 3a/3b/3f client side in one commit (`a6b40bf`; the three rewrote the same two files), 3c flags (`bcd8c0b`),
3d doctor and network causes (`efdfa6f`), 3e prompts and setup. 436 tests green, comment count still ten.

Deviations:
- Claude Code re-install reads the old env from `~/.claude.json` (the user-scope entry it is about to replace)
  rather than `claude mcp get`; `claude mcp get` is used by `doctor` only (any scope). `Runner` now returns stdout.
- Windows `cmd /c npx` wrapping applies to every client (Codex and Claude Code too), not only JSON ones; simpler
  and equally correct. `spawnRunner(platform, spawn)` is a factory so tests inject the platform.
- bunx is detected by `basename(execPath)` being `bun`/`bunx`; the compiled binary is any other Bun runtime.
  Chunk 4 binary smoke should confirm the compiled binary's `execPath` is its own path.
- Codex merge rewrites only `command`/`args` in the table (multi-line `args` handled); other keys, inline `env`
  and sub-tables stay. JSONC: comments stripped for reads; a file with comments is refused for writes (trailing
  commas are not tolerated). New modules `serverCommand.ts` and `flags.ts` (listed in CLAUDE.md).
- `--help` on any subcommand prints the full usage. Unknown flags exit 2 for the server command too.
- R38 SIGINT: not a signal handler. `interruptible(rl, work)` turns readline's SIGINT during the verify and doctor
  steps into `SetupAborted` (readline owns raw mode; `runSetup` closes it and returns 130).
- R39: keep-current prompt is asked only when projects exist; when none are writable the stale default is dropped
  with a "removed" line. `setup --non-interactive` now keeps the stored default project when none is given.
- doctor catches any `loadConfig` error (including the http:// refusal), not only `ConfigError`.

Open for Chunk 4: README mentions of backups (`.bak` is now one rolling file), `--flag=value`, and the pinned
`npx operator-mcp@<version>` entry; CHANGELOG entries for R4/R6/R13/R14/R15/R30/R32-R39.

### Chunk 2 review fixes (2026-11-01, `47978c9`..`65457ed`)

- G1 `readConventions` returns null only for ENOENT, else throws. `createServer` catches, writes one stderr line,
  starts without the manual. add/remove error on an unreadable manual (file unchanged, tested). `whoami` now uses
  `existsSync` for `conventionsLoaded` so it never fails on an unreadable manual.
- G2 briefing: 15 soonest-due `pending` rows, `pendingCount`, description points to `my_work`; activity rows drop
  `project` when scoped to one project. G8 `byStatusCountedFirst` fallback. G9 `sortBy id desc` on both
  notification feeds.
- G3 `version` is a literal again plus a guard test against package.json. `bun` is NOT installed here, so the
  compiled-binary check could not run (open item for Chunk 4 binary smoke).
- G4 standup: rows 20, `total` and `truncated` on both lists. G5 `my_work`: no per-row assignee/url, one `urlTemplate`.
- G6 `resolveProjectId` tries `GET /projects/{value}` first, scans names only on 404. G7 `mark_notifications_read`
  ids path returns `{ requested }`, description corrected. G10 `api_request` caps by bytes and returns
  `{ truncated, bytes, preview }`. G11 `isMe` (trim, case-insensitive) in resolve.ts, used by search and user resolution.
  G12 search assignee names resolve via `/principals`. G13 `list_users` returns `{ total, users, truncated? }`.
  G14 the api_request hint moved from the `version` field to create/update tool descriptions.
- Deviations: none of substance. No new comments, no new files.
- Measured on realistic fixtures (Spanish 85-char subjects, 65-char project names): briefing 7700 B (46 open items,
  50 notifications), standup 8012 B (20 entries + 20 changes, 25 total), my_work 7279 B (20 rows). Standup is close
  to the 8192 B budget.
- Open: bun binary `--version` check; standup headroom is thin if comments get longer.

### Chunk 4, tasks 4a–4e (2026-11-01, `6c295e0`..`3a2e130`)

Done: 4a `tsconfig.test.json` (module NodeNext, resolveJsonModule) + `npm run typecheck` (src then tests), used by CI and
release; fixed the 8 type errors it surfaced (all in tests). 4b `npm run test:docker` (`scripts/test-docker.sh`,
`scripts/seed-openproject.rb`, `.github/workflows/live.yml` on dispatch + weekly). 4c live suite rewritten
(`test-live/smoke.test.ts`, `tools.test.ts`, `support/live.ts`). 4d `scripts/binary-smoke.mjs` + CI job `binary`; release
uses the script. 4e actions pinned to SHAs, npm 11.21.1 exact, tarball packed in `verify` and published from the artifact,
`attest-build-provenance` for `.gz` binaries and the `.tgz` (also attached to the release), README "Verifying a release".
451 unit tests green, typecheck silent, no `src/` changes, comment count unchanged (ten).

Live suite on Docker (`openproject/openproject:16.6.10`, same digest as the local `:16`), clean boot, 16/16 green, ~95 s total,
container removed afterwards (script uses a trap): metadata (types/statuses/priorities), open-status `o`, `<>d` with open
upper bound (and `>d` rejected), `groupBy=status` top-level `groups`, PATCH ok + stale lockVersion 409, activities ignore
`pageSize`/`sortBy`, time entry with only a workPackage link + `user=me` and `spentOn <>d`, `readIAN` filter, `collectAll`
over 105 work packages (two pages), `briefing`, `standup`, `update_work_package` writing a version by name, `list_activities`
newest-first with limit, `mark_notifications_read` by ids flips exactly the chosen one (seeded via `Notification.create!`,
non-System admin user; only runs when `OPENPROJECT_LIVE_DISPOSABLE=1`, which the docker script sets).

Binary smoke: real Bun 1.4.4 (via `npx -y bun@1.4.4`, nothing installed) compiled `bun-linux-x64`: `--version` (literal
constant works), initialize, tools/list, `whoami` call against a stub server, `setup --non-interactive` in a temp HOME, and
`install --yes` registers the binary under its own path (`execPath` is the binary, confirmed). All ok.

Deviations / findings:
- Seed facts needed on 16.6: the project needs `workspace_type: "project"`; time tracking needs the `costs` module enabled
  (otherwise 403 on POST /time_entries); `journal_aggregation_time_minutes = 0` so a comment is its own activity; notifications
  must be created after a `sleep 20` because the creation's journal jobs delete earlier ones; use host `localhost`, not
  127.0.0.1 (host_name check). Versions are created via `POST /versions` with a numeric definingProject link.
- Non-interactive `setup` does not register agents; the smoke script checks registration through `install --yes`.
- Live DELETE cleanup uses `allowDelete: true` in the live config only.
- actionlint run through docker `rhysd/actionlint:1.7.7` (mounted with `:z`, which relabelled `.github` for SELinux): clean.
- Action SHAs use the major-tag comment (v7, v8, v3, v4); attest-build-provenance v4.2.2; setup-bun v2.2.0.

Open items:
- BUG FOUND LIVE: `list_metadata kind=activities` is broken on OpenProject 16.6: `/time_entries/activities` has no index
  route (404; only `/time_entries/activities/{id}`). The live test omits that kind. Needs a fix (e.g. read allowed values from
  the time entry form/schema, or probe ids) or a documented limitation: for 4f or a follow-up.
- `list_notifications` etc. are not live-tested beyond the id filter.
- 4f final gate still pending (README tool table, CHANGELOG items listed in the Chunk 3 note, comment count check).
- Workflows are not run on GitHub (no push); first real run may need adjustments (e.g. `setup-bun` and `bun` on PATH).
