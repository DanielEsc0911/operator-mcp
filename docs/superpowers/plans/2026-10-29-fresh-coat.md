# Fresh Coat — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-10-29-fresh-coat-design.md` (v1) — the *why*. This file is the *what* and *how to prove it*.
**Progress:** `docs/progress/2026-10-29-fresh-coat.md` — tick rows, append a hand-off note.
**Branch:** `fresh-coat` in this repo. The landing repo `../operator-landing-page` works on `main`.

## Rules for every chunk

1. **Read first:** `CLAUDE.md`, the spec, this plan's section for your chunk, the
   progress hand-off notes. Use CodeGraph (`codegraph_context` etc.) to orient,
   per `CLAUDE.md`.
2. **Load skills before code:** `authoring-mcp-tools`, `openproject-apiv3`,
   `testing-mcp-tools` as relevant; `test-driven-development` for any
   behaviour change; `impeccable` and/or `ui-ux-pro-max` for anything visual;
   `reviewing-operator-changes` and `verification-before-completion` before you
   call the chunk done.
3. **Invariants hold** (CLAUDE.md): two runtime deps, `.js` import suffixes,
   ~150-line files, `.describe()` on every zod field, no `delete_*` tools,
   `readOnly` guard, stdout belongs to the transport, tests mock fetch. Comments
   only for external constraints. Dev dependencies are fine when the chunk
   names them.
4. **Commit** in small logical commits on `fresh-coat` (Conventional Commit
   subjects, as in `git log`), ending every message with
   `Claude-Session: https://claude.ai/code/session_01Drj6YeGoXicRLegLtS1A76`.
   **Never push, publish, tag, or create remote repos** — those are manual steps.
5. **Live testing** (containers, a local HTTP fixture, a dev server, a headless
   browser) is yours to run when the chunk needs it. Clean up containers and
   background processes before you finish.
6. **When reality disagrees with the plan**, prefer the simpler correct thing,
   and write the deviation and its reason in the hand-off note. Never skip a
   verification step silently. If one cannot run, say so in the note.
7. **Finish** by: running the chunk's verification block, self-reviewing the
   full diff against the invariants and the spec, fixing what you find, ticking
   the progress row, and appending a hand-off note (≤15 lines: done, deviations,
   open items, exact commands that prove it).

---

## Chunk 1 — Security patch (spec §3 rank 1)

Source of detail: `docs/superpowers/specs/2026-08-21-public-release-hardening-design.md`
§3.1 and the matching tasks in `docs/superpowers/plans/2026-08-21-public-release-hardening.md`.
Re-audit each row against today's code first. Some may be partly done or moot.

- [ ] **1.1 S1 sub-path URLs + origin check** — `client.ts` builds `${config.url}/api/v3${path}` and refuses a request whose origin differs from the configured one. Tests: sub-path instance, an absolute-URL `path` rejected.
- [ ] **1.2 S2 http refusal** — `http://` refused at config load unless the host is loopback or `OPENPROJECT_ALLOW_INSECURE_HTTP=1`. Env-only flag. Tests for all three cases.
- [ ] **1.3 S3 path segments** — one `segment()` helper (`encodeURIComponent`) used at every interpolation of a user/agent value into a path (`workPackages.ts`, `resolve.ts`, `identity.ts`, anywhere else CodeGraph finds). Run `codegraph_impact` on `resolve.ts`/`client.ts` first. Test: `../../users/me` becomes one encoded segment.
- [ ] **1.4 S4 URL credential stripping** — `normalizeUrl` drops userinfo, query, hash. Test asserts no tool result or error message contains the API key or URL credentials.
- [ ] **1.5 S5 profile name validation** — `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`, clear error.
- [ ] **1.6 S6 credential file mode warning** — stderr warning if `mode & 0o077`; never fails.
- [ ] **1.7 S7 audit** — `npm audit --omit=dev`; refresh the lockfile to fix; record the result.
- [ ] **1.8 S8 DELETE gate** — `api_request` refuses `DELETE` unless `OPENPROJECT_ALLOW_DELETE=1` (env only). Gate in the tool, not the client: `watch_work_package(watching:false)` must keep working (test it).
- [ ] **1.9 S9 conventions injection** — apply the August spec's S9 fix as written there.
- [ ] **1.10 Version + engines** — `McpServer` version read from `package.json` (B11). `engines.node` `>=22`. `package.json` version `1.1.2`.
- [ ] **1.11 `CHANGELOG.md`** (Keep a Changelog) with a 1.1.2 security entry. Update README's Configuration table with the two new env flags and the Node 22 note.

**Verify:** `npm test && npx tsc --noEmit && npm run build && npm audit --omit=dev --audit-level=high`. Grep proves `segment(` covers every path interpolation of agent input.

## Chunk 2 — CLI, doctor, CI, community files (spec §3 ranks 2–4)

- [ ] **2.1 `src/cli.ts`** — `runCli(argv, streams) → exit code`; `index.ts` is shebang + call. Routing by first positional, not `argv.includes` (fixes B1). `--help`, `--version` (B2). Top-level catch → one clear stderr line + exit 1 (B13). Node floor check with a clear message (B14, floor 22).
- [ ] **2.2 Setup fixes that the restyle will build on** — B3 (Ctrl-C restores the terminal), B4 (UTF-8 and edited input), B5 (`--non-interactive --url`, key from `OPENPROJECT_API_KEY`; a failed verify exits non-zero instead of looping forever in non-interactive mode; interactive gets an abort path), B6 (print where to get a key: `<url>/my/access_tokens`, older: *My account → Access token*), B7 (show the existing profile before overwriting). Keep `setup.ts` under ~150 lines; split `prompts.ts` now if needed (spec §5.2 names it).
- [ ] **2.3 `src/doctor.ts`** + `operator-mcp doctor [--profile p]` — checks: config file found and mode; URL reachable; key accepted (identity); each detected client has an entry for this profile and what command it runs. Each check a ✓/✗ line with the next command to run. Exit code non-zero on any ✗. Written to the stream it is given.
- [ ] **2.4 B10 config dir** — `XDG_CONFIG_HOME` on Linux/macOS, `%APPDATA%` on Windows. No migration code (spec: no published users rely on the old path beyond the author; note the `mv` in the runbook if it changes the author's path).
- [ ] **2.5 Import-graph test** (spec §5.2) — walks static imports from `src/server.ts`, fails if `cli.ts`, `setup.ts`, `install.ts`, `doctor.ts`, `prompts.ts` or `ui.ts` is reachable. Update the CLAUDE.md stdout invariant and the Layout table.
- [ ] **2.6 Workflows** — `.github/workflows/ci.yml` (Node 22 + 24 × ubuntu/macos/windows: typecheck, test, build, pack-check; ubuntu: `npm audit --omit=dev --audit-level=high`, gitleaks), `codeql.yml`, `release.yml` (tag `v*`: tag == package version, test, build, `npm publish --provenance` via OIDC, GitHub Release with generated notes; the binary job is added in chunk 4). `.github/dependabot.yml`. Validate with `actionlint` (run it via its container image or a downloaded binary into the scratch area, not installed system-wide).
- [ ] **2.7 Community files** — `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, contact `<CONTACT>` placeholder per the runbook), issue forms (bug form asks for `operator-mcp doctor` output), PR template, `.nvmrc` (22), `scripts/pack-check.mjs`. Biome: add it only if it costs ≤1 devDependency and the codebase passes with a minimal config. Otherwise note why not.
- [ ] **2.8 Tick the August register** — in the August spec, mark each S/B row done/moot with one word and the commit.

**Verify:** `npm test && npx tsc --noEmit && npm run build && node scripts/pack-check.mjs && node dist/index.js --help && node dist/index.js --version && node dist/index.js --profile setup` (must start the *server*, not the wizard; kill it after a second). `actionlint` clean.

## Chunk 3 — Brand (spec §4)

- [ ] **3.1 Seed** — `docs/brand/seed/op.grid`: the 16×16 role-letter operator (`b` base, `a` accent headset, `t` teal mic lamp/blush, space empty). Cute, legible at 16 px and as 8 terminal rows. Iterate by rendering it, not by imagining it.
- [ ] **3.2 Wordmark seed** — "OPerator" in Bricolage Grotesque, outlined to paths once (Inkscape is fine here), committed as `docs/brand/seed/wordmark.svg`. Font files are not committed to this repo.
- [ ] **3.3 `scripts/brand.mjs`** (no deps, deterministic) → `docs/brand/assets/`: `mark/op.svg` (themable via `currentColor` + CSS vars), `mark/op-light.svg`, `mark/op-dark.svg`, `lockup/horizontal.svg` (light+dark), `hero/readme-hero.svg` (light+dark, for `<picture>`), `social/card.svg` 1200×630, `favicon/favicon.svg`, `terminal/op.cells` (the grid rows as `install.sh` and `ui.ts` consume them). `npm run brand`.
- [ ] **3.4 `scripts/brand-raster.sh`** → `social/card.png`, `favicon/{16,32,48,180,512}.png`, `favicon/favicon.ico`. Inkscape/ImageMagick. Committed outputs.
- [ ] **3.5 `docs/brand/README.md`** — the rules: palette table (spec §4.3, with measured contrast ratios), type, voice, the not-affiliated line, "never edit assets by hand", how to regenerate. Verify terminal accent slot contrast on white and black backgrounds and record it.
- [ ] **3.6 README hero** — `<picture>` hero at the top, the not-affiliated line in the footer. No other README changes yet (chunk 5 refreshes the rest).
- [ ] **3.7 Render check** — rasterize the hero, lockup, card and mark at small sizes; look at the PNGs yourself (Read the image files) and iterate until they're good. Paste nothing large into the hand-off.

**Verify:** `npm run brand && git diff --exit-code docs/brand/assets/**/*.svg docs/brand/assets/terminal` (byte-identical regeneration). `npm test` still green.

## Chunk 4 — Binaries and the curl installer (spec §3 ranks 5–6, §5.0, §5.1, §5.3)

- [x] **4.1 Spike (gate)** — `npx -y bun build --compile` the current build. On Linux: MCP `initialize` + `tools/list` over stdio (write a tiny Node script with the SDK client), masked prompt raw mode + Ctrl-C restore (drive it with `script`/a pty), `0600` modes, readline prompts. Record results in the hand-off. **If it fails and isn't a one-line fix, stop, apply the spec §5.0 kill switch, amend the spec, and do the npx-wrapper installer instead.**
- [x] **4.2 `serverCommand(profile)`** in `clients.ts` (run `codegraph_impact` first) — runtime choice per spec §3 rank 6; replace every hardcoded `npx`. Tests for both branches (stub `process.versions.bun`/`execPath`). `doctor` prints which command is registered.
- [x] **4.3 Release binaries** — `release.yml` job: `bun build --compile --target=bun-{linux-x64,linux-arm64,darwin-x64,darwin-arm64}` → `operator-mcp-<os>-<arch>`; darwin binaries `codesign --force -s -` on a `macos-14` runner and smoke-run (`--version` and an MCP handshake); `SHA256SUMS`; `install/install.sh` attached as a release asset. Bun is a CI-only tool, pinned to an exact version. `actionlint` clean.
- [x] **4.4 `install/install.sh`** — POSIX sh per spec §5.1: mark from `docs/brand/assets/terminal/op.cells` (copied into the script by `npm run brand`, never hand-edited; extend `brand.mjs` to write that block), facts table, lamp spinner, download bar, SHA-256 against `SHA256SUMS`, install to `~/.local/bin` (`OPERATOR_INSTALL_DIR`), PATH hint, the `/dev/tty` test, `exec … setup </dev/tty`, `--no-setup`, `OPERATOR_VERSION`, `OPERATOR_BASE` (download base; default `https://github.com/DanielEsc0911/operator-mcp/releases`), musl refusal with the npx line, plain output under `NO_COLOR`/non-UTF-8/`TERM=dumb`, macOS + Linux × x64 + arm64, never sudo. Look at the Nexo script (`../nexo/packaging/downloads/install.sh`) for feel and robustness patterns. Do not copy its licence header.
- [x] **4.5 `test-install/`** — a runner script (`npm run test:install`, not in `npm test`) that builds a fake release dir (a real compiled linux-x64 binary or a stub), serves it with a local static server, and runs `install.sh` in podman containers: Fedora and Debian install succeeds and `operator-mcp --version` runs; a corrupted checksum refuses and installs nothing; `NO_COLOR=1` output contains no ESC byte; Alpine prints the musl refusal. Run shellcheck via its container image. Clean up containers.
- [x] **4.6 README** — "Install" section: curl line first, npx second, the manual binary download with the macOS `xattr -d com.apple.quarantine` note.

**Verify:** `npm test && npx tsc --noEmit && npm run build && npm run test:install` green; shellcheck clean; spike results in the hand-off.

## Chunk 5 — The wizard (spec §5.2, §3 rank 7–8)

- [ ] **5.1 `src/ui.ts`** — styles (off under `NO_COLOR`/non-TTY), mark from `op.cells` (read at runtime from `templates/` or inlined by `brand.mjs` into a generated `src/brandCells.ts`; pick the one that keeps `npm` and the Bun binary both working, and say which), `step`, `lamp`, `card`. Every function takes its output stream.
- [ ] **5.2 `src/prompts.ts`** — `ask`, `askHidden`, `choose` (numbered ≤9 + free identifier), `confirmList` (checklist, all pre-selected, Enter accepts). Tested with fake streams.
- [ ] **5.3 `setup.ts` flow** — the nine steps of spec §5.2, with the switchboard voice, the README example in the outro. `--non-interactive` path untouched in behaviour. Files under ~150 lines.
- [ ] **5.4 Claude Desktop + Cursor** in `clients.ts` per spec §3 rank 7 (paths per OS; Desktop not offered on Linux). Update README's agent tables. If `clients.ts` passes ~150 lines, split by responsibility (e.g. registry vs file editing).
- [ ] **5.5 `install.ts`** restyled with `ui.ts`; `doctor` output restyled with `ui.ts`.
- [ ] **5.6 Capture** — run the curl installer + wizard end to end against the chunk-4 fixture and a mocked OpenProject (a tiny local HTTP server answering `/api/v3/users/me` and `/api/v3/projects` with fixture JSON), in a pty (`script -q`), at 80 columns. Save `docs/brand/demo/session.txt` (ANSI kept) and record the wall-clock install-to-outro time in the hand-off note. Also save a `NO_COLOR` capture to prove the plain path.
- [ ] **5.7 README refresh** — hero, a one-paragraph pitch that opens on the pain, the curl quickstart, the wizard description, agents table incl. Desktop/Cursor, "Your agent can't delete anything. By design." section. Keep everything accurate to the code.

**Verify:** `npm test && npx tsc --noEmit && npm run build && npm run test:install`; import-graph test green; `session.txt` exists and replays correctly with `cat`.

## Chunk 6 — Landing page build (spec §6), in `../operator-landing-page`

- [ ] **6.1 Scaffold** — `git init` on `main`; Astro (exact current stable, pinned), TypeScript strict, static output; `README.md` (what it is, `npm run dev/build/test`, how to deploy on Cloudflare Pages Git integration: build `npm run build`, output `dist`), `.nvmrc`, `.gitignore`. `CLAUDE.md` for that repo with its own rules (KISS infra, overengineered craft, budgets, sync scripts).
- [ ] **6.2 Tokens + fonts** — CSS custom properties from `docs/brand/README.md`; light/dark with toggle; self-hosted subset woff2 (Bricolage Grotesque, Instrument Sans, Departure Mono, JetBrains Mono — all OFL; include licence files).
- [ ] **6.3 Sync scripts** — `npm run sync-brand` copies `../operator-mcp/docs/brand/assets` + `demo/session.txt` into the repo; `npm run sync-tools` does the real `tools/list` handshake (spec §6.4). Outputs committed.
- [ ] **6.4 Sections 0–9** of spec §6.2, each its own component. Islands: install tabs + copy, switchboard hero animation (SVG + WAAPI/CSS), scripted chat, ANSI terminal player for `session.txt`, interactive manual, tool search. All motion has a `prefers-reduced-motion` path. No framework runtime.
- [ ] **6.5 Copy** — use the impeccable skill's copy guidance. Pain-first, plain, the switchboard voice. Every factual claim matches the code (tool count, env flags, client list, Node floor). The not-affiliated line in the footer.
- [ ] **6.6 Cloudflare files** — `public/_redirects` (`/install.sh` → `https://github.com/DanielEsc0911/operator-mcp/releases/latest/download/install.sh 302`), `public/_headers` (strict CSP without `unsafe-inline` scripts, HSTS, immutable cache for `/_astro/*`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), `robots.txt`, sitemap, OG/Twitter meta with the card PNG, favicons, `site.webmanifest`.
- [ ] **6.7 Tests** — Playwright: page renders, copy button copies, tabs switch, terminal player plays, reduced-motion shows static states, manual island updates the answer, tool search filters, no console errors; axe on light and dark; a test asserting `_redirects` and `_headers` contents.
- [ ] **6.8 Look at it** — run the dev server, screenshot desktop (1440) and mobile (390) in light and dark with Playwright, Read the screenshots, iterate until it's genuinely excellent (impeccable's critique/polish passes). Commit.

**Verify:** `npm run build && npm test` green in the landing repo; screenshots reviewed; no horizontal scroll at 390 px.

## Chunk 7 — Polish, budgets, cross-repo verification

- [x] **7.1 Lighthouse CI** — `@lhci/cli` against the built `dist` on desktop and mobile presets; budgets per spec §6.3; fix until met. `.github/workflows/ci.yml` in the landing repo: build, Playwright + axe, Lighthouse.
- [x] **7.2 Design pass** — the impeccable skill's audit + polish + critique on the live dev server; fix every finding worth fixing; record what you declined and why.
- [x] **7.3 Cross-repo truth check** — every claim on the page and in the README against the code: tool list (re-run `sync-tools`), env vars, client list, install line, Node floor, the not-affiliated line. Brand assets re-synced and identical.
- [x] **7.4 Installer ↔ page** — serve `dist` locally with a static server that honours `_redirects` (e.g. `wrangler pages dev dist` via `npx`), and prove `curl -fsSL <local>/install.sh` resolves to the redirect target URL (it will 404 upstream until the first tag. Assert the redirect, not the body).
- [x] **7.5 Runbook** — update `docs/MANUAL-RELEASE-STEPS.md` (this repo) with exactly the owner-only steps from spec §8, in order, each with the command or the UI path. Remove steps that no longer apply.
- [x] **7.6 Close out** — progress doc final state; spec status → "Implemented" with any amendments; final hand-off summarising both repos' state, every commit range, and what the owner does next.

**Verify:** Lighthouse budgets met (paste the four scores per preset into the hand-off); landing `npm test` green; this repo `npm test && npx tsc --noEmit && npm run build` green.
