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
| Chunk 2 — Agent tools (2a–2i) | done | `b636897`..`26d77aa` (2i skipped) |
| Chunk 3 — Install, setup, CLI, doctor (3a–3f) | todo | |
| Chunk 4 — Release, testing infra, final gate (4a–4f) | todo | |

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
- Chunk 4 binary smoke: confirm `createRequire(...)("../package.json")` works in the Bun-compiled binary
  (fall back to a generated constant if not).
- Live suite (R41) should cover the shapes above (`groupBy`, `read_ian` id filter, activities, `spentOn`).
- Notifications are not generated for self-made changes in the Docker image; seed them with `rails runner`
  (`Notification.create!`) when the live suite needs them.
