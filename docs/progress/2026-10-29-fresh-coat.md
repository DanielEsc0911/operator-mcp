# Fresh Coat — Progress

**Spec:** `docs/superpowers/specs/2026-10-29-fresh-coat-design.md`
**Plan:** `docs/superpowers/plans/2026-10-29-fresh-coat.md`
**Branch:** `fresh-coat` (this repo) · `main` (`../operator-landing-page`)

Each chunk runs as one fresh agent. The agent ticks its rows here and appends
a short hand-off note for the next agent: what was done, what deviated from the
plan and why, and anything left open.

| Step | Status | Notes |
|---|---|---|
| Concept draft v0 | done | 2026-10-29 |
| Three-band critique | done | Rulings in spec §9 |
| Spec v1 + plan | done | |
| Chunk 1 — Security patch (1.1.2) | done | 54ef089..HEAD |
| Chunk 2 — CLI, doctor, CI, community files | done | ad9e4d5..HEAD |
| Chunk 3 — Brand | done | d59e995..HEAD |
| Chunk 4 — Binaries + curl installer | pending | |
| Chunk 5 — Wizard restyle + clients + capture | pending | |
| Chunk 6 — Landing page build | pending | |
| Chunk 7 — Polish, budgets, cross-repo verification | pending | |

## Hand-off notes

*(Newest last.)*

### Chunk 1 — Security patch (2026-10-29)

- **Shipped:** S1 `client.ts` builds `${url}/api/v3${path}` and refuses any resolved href outside that root (covers origin change and `/../` escapes). S2 `assertSecureUrl` in `loadConfig` and in the wizard loop. S3 `segment()` in `client.ts`, applied to every string project value (`resolve.ts` ×2, `identity.ts`, `workPackages.ts`, `workPackageWrites.ts`). S4 `normalizeUrl` drops userinfo/query/hash; `test/secrets.test.ts` checks instructions, results and a 401. S5, S6 in `config.ts`. S7 lockfile refresh. S8 gate in `raw.ts`; `watch_work_package(false)` test still green. S9 `oneLine()` in `conventions.ts`, same normalization on add and remove. B11 version from `package.json`. Node `>=22`, version 1.1.2, CHANGELOG, README flags.
- **Deviations:** CodeGraph tools were not available to the agent; Grep/Read used instead. Remaining `${id}` path interpolations are zod `.int()` numbers or server-returned ids, so they are not wrapped in `segment()`. S1 checks the full api-root prefix, not only the origin, since dot segments were the reachable escape. `npm audit fix`/`npm update` crash in npm 10.9.8 arborist (`edgesOut` on vitest's jsdom/canvas peers); I ran targeted `npm update <pkg>` instead and raised the floors to sdk `^1.32.2`, zod `^4.6.7`. Empty profile names and unicode names fail S5 too. No new comments in `src/`.
- **Open for Chunk 2+:** dev-only `npm audit` advisories remain (not in the gate). `server.ts` reads `../package.json` at runtime: fine for npm, check it in the Bun binary spike (chunk 4). The "broken config" test now prints the S6 warning to stderr (harmless noise).
- **Verify:** `npm test` 19 files / 213 tests passed; `npx tsc --noEmit` silent; `npm run build` ok; `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities.

### Chunk 2 — CLI, doctor, CI, community files (2026-10-29)

- **Shipped:** `cli.ts` `runCli(argv, streams, nodeVersion)` routes by first positional (B1), `--help`/`--version` (B2), one-line stderr + exit 1 (B13), Node 22 floor (B14); `serve.ts` starts the server; `index.ts` is 4 lines. `prompts.ts` (`ask` with Ctrl-C → `SetupAborted`, `readHidden`/`askHidden` restore raw mode, UTF-8, Ctrl-U, drop escapes: B3/B4). `setup.ts` takes `Streams`: `--non-interactive --url` (B5, failed verify throws → exit 1), retry/abort (exit 130), `keyHint` `/my/access_tokens` + older path (B6), `describeExisting` masked overwrite guard (B7). `doctor.ts` (B8 as the Fresh Coat plan scopes it). `configHome` XDG/APPDATA (B10; author's Linux path unchanged, no `mv`). `install.ts` takes `Streams`, returns a code. `test/importGraph.test.ts`. CI/CodeQL/release/dependabot, community files, `.nvmrc`, `scripts/pack-check.mjs`. August register ticked (§3.2a).
- **Deviations:** CodeGraph tools unavailable; Grep/Read used. Added `Client.entry()` (doctor reads back what each agent runs) and split JSON/TOML helpers into `clientFiles.ts` to stay under 150 lines. Comment count in CLAUDE.md corrected six → eight (it was already eight; none added). Non-interactive setup does not register agents; it prints `operator-mcp install --yes`. Release uses `gh release create` instead of a third-party action. Biome **not** added: 2.5.15 recommended rules report 4 errors / 63 warnings on today's code, so no minimal config passes. A few tests (doctor "no key" case, `ask`) were written after the code.
- **Open for 3–5:** `setup.ts` is 120 lines — Chunk 5's restyle should put look in `ui.ts` and keep `setup.ts` as flow; `prompts.ts` lacks `choose`/`confirmList` (spec §5.2). `runInstall(argv, streams, rl?)` still prompts with free text. `Streams.stdin` is a `ReadStream`; `askHidden` falls back to `ask` when not a TTY. Release has a placeholder comment for Chunk 4's `binaries` job. Windows CI never run locally (tests stub `APPDATA`; pre-existing tests rely on `HOME`, which Windows `homedir()` ignores — expect fixes on first CI run). S12 (author email in 9 test files) still open. `<CONTACT>` in CODE_OF_CONDUCT.md awaits the owner.
- **Verify:** `npm test` 23 files / 254 passed; `npx tsc --noEmit` silent; `npm run build` ok; `node scripts/pack-check.mjs` 30 files ok; `--help`/`--version` (1.1.2) ok; `node dist/index.js --profile setup` answered an `initialize` as the server; `podman run --rm -v "$PWD":/repo:Z -w /repo docker.io/rhysd/actionlint:latest` clean; gitleaks container: no leaks.

### Chunk 3 — Brand (2026-10-29)

- **Shipped:** S12 (fixtures now Ada Lovelace / `ada@example.com`; register ticked). Seeds `docs/brand/seed/op.grid` (outline-face operator, amber headset, teal blush + mic lamp) and `wordmark.svg` (Bricolage Grotesque Bold, opsz 96, outlined via fontTools + HarfBuzz in the scratchpad; no font committed). `scripts/brand.mjs` (`npm run brand`) → `docs/brand/assets/{mark,lockup,hero,social,favicon,terminal}`; `scripts/brand-raster.sh` → card PNG, favicon 16/32/48/180/512 + ICO. `docs/brand/README.md` holds the rules. README: `<picture>` hero + not-affiliated footer line.
- **Palette (measured, on #FBF6EC / #16131F):** ink/paper 17.00; signal text `#A15C00` 4.82, fill `#FFB020` 10.01 dark (1.70 on paper: decorative only); patch `#0C7D73` 4.65 / `#2EC4B6` 8.45; alarm 4.83 / 6.55; muted 4.85 / 6.37.
- **Terminal slots:** signal **136** (3.34 white / 6.29 black), patch **30**, alarm **167**, muted **243**, base = default fg. 214 failed on white (1.84).
- **Consuming `op.cells`:** 16 lines × 16 role letters; print two lines per row with `▀`/`▄`/`█` (nexo `mark_lines` pattern, `base` = default fg). `install.sh` should embed the cells as a heredoc (Chunk 4 can copy them from the file). For `ui.ts`, the simplest path that also survives the Bun binary: have `brand.mjs` additionally emit a generated `src/brandCells.ts` (`export const OP_CELLS = [...]`) so no runtime file read and `docs/` stays out of the tarball.
- **Deviations:** spec §4.3 amended — signal text `#B86A00`→`#A15C00` and light patch `#0E8F84`→`#0C7D73` (both failed 4.5:1); terminal 214/37/203/245 → 136/30/167/243 (failed on white). Mark is an outline face, not a filled head: the filled version read as a dark blob on light grounds. Lockup/hero ship as separate `-light`/`-dark` files. Banner taglines use Instrument Sans with a system fallback (GitHub SVGs get no web fonts). CodeGraph unavailable again.
- **Verify:** `npm run brand && git diff --exit-code docs/brand/assets/**/*.svg docs/brand/assets/terminal` clean; `npm test` 23 files / 254 passed; `npx tsc --noEmit` silent; `node scripts/pack-check.mjs` ok, 30 files (unchanged). Looked at mark 16/32/180 px, hero light+dark, card, terminal on white and black.
