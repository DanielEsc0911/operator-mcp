# Fresh Coat — Concept, Brand, Installer, Landing Page

**Date:** 2026-10-29
**Status:** v1 — critique applied (see §9), ready to execute
**Branch:** `fresh-coat`
**Plan:** `docs/superpowers/plans/2026-10-29-fresh-coat.md`
**Progress:** `docs/progress/2026-10-29-fresh-coat.md`
**Sibling repo:** `../operator-landing-page` (private, Cloudflare Pages)

---

## 1. What the owner asked for, sorted

| # | Ask | Reading |
|---|---|---|
| A | "Suggestions on how we can improve it functionally" | Rank what makes OPerator more correct, safer and easier to start with. Ship the top of the list; park the rest with a reason. |
| B | "Define a proper aesthetic, create an image for it" | One brand: a mark, a palette, type, a voice. One seed drawing generates every asset. It feeds C and D. |
| C | "A CLI installer, very aesthetic and cute, a proper wizard from run to start using, like nexo-agent, works via curl, not only npx (removes the need for Node)" | `curl … \| sh` downloads a standalone binary, verifies it, then hands off to a restyled `setup` wizard that ends with the agent registered and a first prompt to try. |
| D | "Most important: a webpage that fully emphasises the best possible presentation and really upsells it. Static on Cloudflare Pages, overengineered, in `../operator-landing-page`" | Craft is overengineered: motion, a real terminal replay, a scripted agent demo, perfect performance and a11y, tested in CI. Infrastructure is not: static files, no backend, no CMS. |

**KISS / YAGNI line for this whole effort:** the CLI and the server stay
small (the existing invariants hold — two runtime deps, ~150-line files, six
comments). Polish is spent where a stranger meets the project: the installer,
the wizard, the README and the landing page.

## 2. Ground truth found before planning

- **The August hardening plan was never executed.** `docs/superpowers/plans/2026-08-21-public-release-hardening.md`
  has 125 unchecked steps; none of S1–S9 or B1–B14 is in `src/` (no `allowDelete`,
  no path `segment()`, no http refusal, no `cli.ts`, no `--help`, no `doctor`, no
  `.github/`). Yet `operator-mcp@1.1.1` is published. This is the most important
  functional fact in the repo.
- Already done since that spec: `LICENSE`, package rename, `package.json`
  metadata, agent auto-registration (`install`, `src/clients.ts`, 4 clients).
- `McpServer` still reports version `"1.0.0"` (B11). `engines` still says `>=20`.
- Local machine: Node 22.23, no Bun, Inkscape + ImageMagick present, podman present.
- Nexo's installer (`../nexo/packaging/downloads/install.sh`) is the reference
  for feel: a 16×16 role-letter mark printed with half-blocks beside a facts
  table, an animated "mini cores" spinner per step, a download bar, SHA-256
  check, plain fallback when not a UTF-8 TTY or when `NO_COLOR` is set.

## 3. Functional improvements (Ask A), ranked

| Rank | Improvement | Why | Ships in |
|---|---|---|---|
| 1 | **Execute the hardening register** (S1–S9, B1–B14 minus B9/B12 already moot), re-audited against today's code. Security rows first, as a patch-ready 1.1.2 | A public credential-handling tool with path injection (S3), cleartext keys over http (S2), credential echo (S4) and an ungated DELETE (S8) is on npm today | Chunks 1–2 |
| 2 | **`operator-mcp doctor`** | "It doesn't show up in my agent" is the dominant support burden; the installer and wizard both end by running it | Chunk 2 |
| 3 | **`cli.ts` routing, `--help`, `--version`, top-level error line, Node floor check** | B1 (`--profile setup` starts the wizard) is a real bug; a published CLI answers `--help` | Chunk 2 |
| 4 | **CI + tag-triggered release** (npm via OIDC with provenance, GitHub Release with binaries + `SHA256SUMS` + `install.sh`) | Nothing proves a release today; the curl installer needs release assets | Chunks 2 + 4 |
| 5 | **Standalone binaries** — `bun build --compile` in CI for linux-x64, linux-arm64, darwin-x64, darwin-arm64; darwin binaries ad-hoc signed (`codesign -s -`) and smoke-tested on a macOS runner. Proven first by a spike (§5.0); ~55–60 MB each is accepted (Nexo ships the same order) | The curl path must not need Node. Bun is a CI build tool only, never a runtime dependency | Chunk 4 |
| 6 | **Binary-aware registration** — one `serverCommand(profile)` returns `{ command: "npx", args: ["-y", "operator-mcp", …] }`, or `{ command: process.execPath, args: […] }` when `process.versions.bun` is set. Decided at runtime: no build define, one build for npm. Replaces the four hardcoded `npx` sites in `clients.ts` | Without it a curl user's agent config would still call `npx` and fail with no Node; Claude Desktop's minimal PATH makes an absolute path better anyway | Chunk 4 |
| 7 | **Two more auto-registered clients: Claude Desktop and Cursor** — Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows), not offered on Linux (no official build). Cursor: `~/.cursor/mcp.json` everywhere | Both use the common `mcpServers` JSON shape; Claude Desktop is where non-developers live | Chunk 5 |
| 8 | **Wizard restyle** — project picker, direct link to the access-token page, lamp spinner, agent checklist, outro card | The wizard is the product's first impression after the page | Chunk 5 |

**Parked, with reasons**

| Idea | Why not now |
|---|---|
| New tools (attachments, versions, boards, wiki) | No user has asked; `api_request` covers the gap. Revisit with evidence. |
| MCP prompts (e.g. "standup") | Nice demo, but clients surface prompts inconsistently. Revisit after the page ships. |
| Self-update command | Re-running the curl line *is* the update. |
| Windows `install.ps1` and a Windows binary | Windows users have `npx`; an untested binary is not shipped. Revisit on demand. |
| Retries/backoff (S13), `.bak` pruning (S10) | Same verdict as the August spec. |
| Remote/HTTP transport, Docker, Homebrew | Out of scope as before. |

**Node floor:** `>=22`, reversing the August spec's `>=24` (the reversal is
recorded in that spec's header). Reason: Node 22 is a supported LTS until April
2027, nothing in `src/` needs a 24-only API, and the binary path removes Node for
users who don't have it. Holding 24 would only exclude supported installs. CI
matrix: Node 22 and 24. `engines` moves off the EOL `>=20` either way.

## 4. Brand (Ask B)

### 4.1 Idea

**OPerator is a switchboard operator.** It patches your agent through to
OpenProject — the old telephone operator who knows every line and the house
rules. The metaphor gives the voice ("patching you through"), the motion
(cables, lamps) and the mascot.

**Tagline:** *Your agent, patched through to OpenProject.*
**Line two:** *It reads your work, updates your tasks, and follows your team's rules.*

### 4.2 The mark — "Op"

A cute pixel-art operator: a rounded head with two dot eyes and a small smile,
wearing a headset whose band and mic are the accent colour. Drawn **once** as a
16×16 role-letter grid (`docs/brand/seed/op.grid`), exactly like Nexo's cells:

| Letter | Role |
|---|---|
| `b` | base (ink on light, paper on dark) |
| `a` | accent (signal amber — the headset) |
| `t` | secondary (patch teal — the mic lamp / cheek blush) |
| ` ` | empty |

One Node script, `scripts/brand.mjs` (no dependencies), turns the grid into
every SVG asset: themable mark, light/dark baked marks, lockup, README hero
banner (SVG), social card 1200×630 (SVG), favicon SVG, and the terminal cells
used by `install.sh` and `src/ui.ts`. SVG output is deterministic and
regenerates byte-identically.

The wordmark ("OPerator" in the display face) is outlined to paths **once**
and committed as a source file, `docs/brand/seed/wordmark.svg`; `brand.mjs`
only composes it. Rasters (social card PNG, favicon PNGs/ICO) come from a
separate `scripts/brand-raster.sh` using Inkscape/ImageMagick on the author's
machine; the PNGs are committed and not expected to be byte-identical across
tool versions. Nothing in CI or `npm test` needs Inkscape.
**Never edit generated assets by hand** — edit the seed and re-run.

### 4.3 Palette

| Token | Light | Dark | Terminal (256) | Use |
|---|---|---|---|---|
| `ink` / `paper` | `#16131F` on `#FBF6EC` | `#FBF6EC` on `#16131F` | default fg | text, base cells |
| `signal` | `#B86A00` (text) / `#FFB020` (fill) | `#FFB020` | 214 | accent: lamps, headset, links, primary button |
| `patch` | `#0E8F84` | `#2EC4B6` | 37 | secondary: cables, success |
| `alarm` | `#C8372D` | `#FF6B5E` | 203 | errors only |
| `muted` | `#6E6A7C` | `#9A96A8` | 245 | secondary text |

Every text/background pair meets WCAG AA (4.5:1 body, 3:1 large/UI). The
terminal accent must read on both light and dark terminals — verify, and pick
the nearest slot that does if 214 fails on white.

### 4.4 Type and voice

- **Display:** Bricolage Grotesque (OFL). **Body:** Instrument Sans (OFL).
  **Mono / terminal UI:** Departure Mono (OFL) for small labels and the pixel
  feel; JetBrains Mono for long code blocks. Self-hosted woff2, subset.
- **Voice:** warm, plain, a little playful in progress messages ("Patching you
  through…", "Line's open."). Errors are never cute: they say what broke and the
  next command to run.
- **Not affiliated:** no OpenProject logo or colours. Footer and README carry
  "OPerator is an independent project, not affiliated with OpenProject GmbH."
  Agent clients are named in text chips, never with their logos.

## 5. Installer and wizard (Ask C)

### 5.0 Spike first

Before any installer or wizard work, a throwaway spike proves the binary path:
`npx bun build --compile` the current server, then on Linux (locally) and macOS
(CI runner) check (1) an MCP `initialize` + `tools/list` handshake over stdio,
(2) the masked key prompt's raw mode and Ctrl-C restore, (3) `0600` file modes
from `saveConfig`, (4) `readline/promises` prompts. If any fails and cannot be
fixed in a line or two, the binary path is cut, the curl installer becomes a
thin wrapper that requires Node and runs `npx`, and this spec is amended.

### 5.1 `curl -fsSL https://operator-mcp.pages.dev/install.sh | sh`

`operator-mcp.pages.dev` is the Pages default domain and a single constant; a
custom domain later changes one line. The landing page serves `/install.sh` as a
302 (`_redirects`) to `github.com/DanielEsc0911/operator-mcp/releases/latest/download/install.sh`,
so the script's source of truth stays in this public repo at `install/install.sh`.

POSIX `sh`, macOS + Linux, x64 + arm64. No sudo, ever — it installs to
`~/.local/bin` (override `OPERATOR_INSTALL_DIR`). Steps, in the switchboard voice:

```
   [16×16 Op mark]    OPerator  installer
                      ─────────────────────
                      System     Fedora 44 · x86_64
                      Installed  not yet
                      Release    1.2.0
                      Into       ~/.local/bin

  Line check   ● ● ●   github.com reachable
  Dialing      ━━━━━━━━━━━━━━━━━━━━━━━━ 100%   operator-mcp · 58.1 MB
  Verifying    done    SHA-256 matches
  Patching in  done    ~/.local/bin/operator-mcp

  Connecting you to setup…
```

Then `exec operator-mcp setup </dev/tty`. The TTY test is
`[ -r /dev/tty ] && : </dev/tty 2>/dev/null` — not `[ -t 0 ]`, because under
`curl | sh` stdin is the pipe. Without a TTY (CI, containers) it skips setup and
prints the next command. On musl (Alpine) it stops before downloading and prints
the `npx` path instead. `releases/latest` skips prereleases and 404s until the
first tagged release carries `install.sh`; that is expected, and the live
end-to-end check is a manual step after the first tag. `OPERATOR_VERSION` pins a release;
`--no-setup` stops after install. Plain output under `NO_COLOR`, non-UTF-8, or
`TERM=dumb`. If `~/.local/bin` is not on `PATH`, it prints the one line to add.

**Spinner:** three switchboard lamps cycling `● ○ ○ → ○ ● ○ → ○ ○ ● ` in signal
amber, 120 ms a step.

### 5.2 Wizard (`operator-mcp setup`) — same look, in TypeScript, no new deps

Split by responsibility to hold the ~150-line rule:

| File | Does |
|---|---|
| `src/ui.ts` | ANSI styles (honouring `NO_COLOR` and non-TTY), the mark from the generated cells, `step`, `lamp` spinner, `card`. Every function writes to a stream it is given |
| `src/prompts.ts` | `ask`, `askHidden` (the fixed raw-mode reader), `choose` (numbered list or free text), `confirmList` (checklist) |
| `src/setup.ts` | The flow below, nothing else |

Flow:

1. **Greeting** — mark + facts (profile, config dir, version).
2. **"Where does your OpenProject live?"** — URL, normalized; http refused per S2.
3. **"Your API key"** — prints `<url>/my/access_tokens` as the place to make one (older instances: *My account → Access token*); masked input (fixed B3/B4).
4. **Verify** — lamp spinner → `Line's open — connected as Ada Lovelace · 12 projects`.
5. **Default project** — numbered list of up to 9 projects plus "none"; accepts a number or an identifier.
6. **Conventions** — starter manual written, path shown.
7. **Agents** — detected clients as a checklist, all pre-selected; Enter accepts.
8. **Doctor** — the same checks `operator-mcp doctor` runs, inline.
9. **Outro card** — "Restart <agent>, then ask: *what's on my plate?*" — the same
   prompt and the same `#1284 / #1301 / #1312` example the README and the page use.

`--non-interactive --url … ` (B5) skips every prompt and reads the key from
`OPENPROJECT_API_KEY`.

**stdout invariant, restated:** CLI command modules write only to the stream
they are handed by `cli.ts`; the server's import graph never reaches `ui.ts`,
`prompts.ts`, `setup.ts`, `install.ts` or `doctor.ts`. A test walks the static
imports from `src/server.ts` and fails if it does. CLAUDE.md is updated to say so.

The chunk that ships the wizard also captures one real run of `install.sh` +
`setup` against the local fixture as `docs/brand/demo/session.txt` (ANSI kept),
and measures install-to-outro time. The landing page replays that transcript and
quotes the measured time only if it was measured.

### 5.3 Testing the installer

`test-install/` runs `install.sh` inside podman containers (Fedora, Debian;
an Alpine run asserts the musl refusal message) against a local HTTP fixture serving a
fake release (`OPERATOR_BASE` override), asserting the binary lands, the
checksum mismatch path refuses, and `NO_COLOR` output has no escape codes.
`shellcheck` runs in CI.

## 6. Landing page (Ask D) — `../operator-landing-page`

### 6.1 Stack

Astro (static output, zero JS by default) + hand-written CSS on the brand
tokens + small vanilla TypeScript islands. Self-hosted fonts. Deployed by
Cloudflare Pages' Git integration (no secrets in the repo). `_headers` with a
strict CSP and immutable caching for hashed assets; `_redirects` for
`/install.sh`. Light/dark from `prefers-color-scheme` with a toggle.

### 6.2 Story, top to bottom

0. **The pain, in one beat** — above the fold, before the product: an agent
   answering *"I can't see your project tracker"*, or a ticket being pasted into
   a chat by hand. The switchboard then patches the line and resolves it.
1. **Hero** — wordmark, tagline, the install line with a copy button and tabs
   (`curl` · `npx`), and a live switchboard: agent chips on the left, Op in the
   middle, an OpenProject line on the right; cables patch in on load, lamps blink.
2. **"Ask, and it answers from real work"** — a scripted agent conversation
   cycling three moments: *what's on my plate?* (the README's exact `#1284 /
   #1301 / #1312` answer) · *log 2h on #1284* · *a branch named the house way,
   because the manual said so*.
3. **Three steps** — install → wizard → ask, with a replay of the real captured
   transcript (`docs/brand/demo/session.txt`), played by a tiny custom ANSI
   player, not a GIF. A measured time-to-first-answer headline only if measured.
4. **The manual, interactive** — the visitor edits one convention line (the
   branch pattern) and the scripted agent's answer changes live. Vanilla island.
5. **Every tool** — the 20 tools grouped, searchable, each with its one-line description.
6. **"Your agent can't delete anything. By design."** — the safety story as a
   selling point for whoever approves the install: no `delete_*` tools, the
   DELETE gate, read-only mode, http refusal, 0600 credentials, checksum-verified
   installer. Each claim links to the line of source on GitHub that enforces it.
7. **Works with** — text chips: Claude Code, Codex CLI, Gemini CLI, opencode,
   Claude Desktop, Cursor, VS Code, and "anything that speaks MCP over stdio".
8. **Two workplaces at once** — profiles.
9. **FAQ** and footer (GitHub, npm, MIT, not-affiliated line).

### 6.3 Where "overengineered" is spent

Motion choreographed with `prefers-reduced-motion` fallbacks for every effect;
the terminal replay; the interactive manual; an OG image from the brand seed;
Lighthouse CI budgets (performance ≥ 95, accessibility 100, best practices 100,
SEO 100) and Playwright + axe tests in GitHub Actions. **Not** spent on: a CMS,
analytics beyond Cloudflare's cookieless Web Analytics, a backend, a framework
runtime, view transitions (one page), a press page.

### 6.4 Data

Tool names and descriptions live in `src/data/tools.json` in the landing repo,
produced by `npm run sync-tools`: it starts `../operator-mcp/dist/index.js` with
dummy env credentials, performs a real MCP `tools/list` handshake, and writes the
result. The data is whatever the server actually advertises. Brand assets are copied the same way from
`../operator-mcp/docs/brand/assets`. One direction, one command, no runtime coupling.

## 7. Execution chunks

Executed one at a time by a fresh agent each; the plan file is the contract.

| Chunk | Scope | Done when |
|---|---|---|
| 1 | Security rows S1–S9, `engines`, server version from `package.json`, `CHANGELOG` 1.1.2 | Tests prove each fix; patch-ready commit; publishing is the owner's manual step |
| 2 | B-rows: `cli.ts`, `--help/--version`, `doctor`, Windows/XDG config dir, top-level errors; CI + release workflows; community files | `npm test`, `tsc`, `build` green; every S/B row ticked or marked moot with a reason |
| 3 | Brand: grid seed, wordmark seed, `scripts/brand.mjs`, rasters, `docs/brand/`, README hero | SVGs regenerate byte-identically; README renders the hero |
| 4 | Binary spike → binaries in release (4 targets, darwin signed) + `serverCommand` + `install/install.sh` + `test-install/` | Container installs pass; a compiled binary serves a live MCP handshake |
| 5 | `ui.ts` + `prompts.ts` + wizard restyle + Claude Desktop + Cursor + transcript capture + README refresh | Wizard runs end to end against a mocked instance; import-graph test green |
| 6 | Landing page scaffold + every section | Builds; Playwright + axe green |
| 7 | Landing polish, Lighthouse budgets, cross-repo verification, runbook update | Budgets met; manual-steps doc lists only what needs the owner's accounts |

## 8. What only the owner can do (goes in `docs/MANUAL-RELEASE-STEPS.md`)

Publish the 1.1.2 security patch; create the GitHub repo for the landing page
and connect it to Cloudflare Pages; configure npm Trusted Publishing; push tags;
run the live `curl | sh` check after the first tagged release; run a trademark
search on "OPerator" (npm, USPTO, EUIPO); pick a custom domain if wanted.

## 9. Critique log

Band 1 (judge) wrote v0; Band 2 (optimist) and Band 3 (ruthless critic) reviewed
it independently. Rulings:

| Source | Point | Ruling |
|---|---|---|
| B3 | Chunk 1 too big; security is live on npm | **Accepted.** Split into security (1) and CLI/CI (2). Rejected the "no brand work until npm publish" gate: publishing needs the owner's account, so it is a manual step, not a chunk gate. |
| B3 | macOS Gatekeeper / unsigned arm64 | **Accepted.** Ad-hoc `codesign -s -` in CI, smoke run on a macOS runner, `xattr` note for browser downloads. |
| B3 | Bun compatibility unproven | **Accepted.** §5.0 spike with a written kill switch. Binary size accepted. |
| B3 | Build-time define impossible under tsc | **Accepted.** Runtime check on `process.versions.bun`. |
| B3 | `curl \| sh` TTY test; `releases/latest` 404 before first tag | **Accepted** the TTY test and the documented 404. **Rejected** a fallback copy of `install.sh` on Pages: two copies drift. |
| B3 | Chunk 3 overloaded; wizard breaks file budget | **Accepted.** Split; wizard files named in §5.2. |
| B3 | Desktop/Cursor paths per OS | **Accepted.** §3 row 7. |
| B3 | Inkscape as hidden dependency | **Accepted.** Outlined wordmark committed as seed; rasters a separate script. |
| B3 | stdout invariant widened | **Accepted.** Injected streams plus an import-graph test. |
| B3 | Node floor 22 lacks a reason | **Accepted** the criticism, **kept** 22 with a stated reason, recorded in the August spec. |
| B3 | Older OpenProject token path | **Accepted.** |
| B3 | `sync-tools` reads source text | **Accepted.** Real `tools/list` handshake. |
| B3 | Name search | **Accepted** as a manual step. The name itself is the owner's and is not relitigated. |
| B3 | Alpine is a dead row | **Accepted.** musl refusal, asserted in one container. |
| B3 cut | `/press`, view transitions, Windows binary | **Cut.** |
| B3 cut | Lighthouse CI gating | **Rejected.** The owner asked for an overengineered page; budgets are how that is held. |
| B3 cut | Real recorded replay | **Rejected.** Reordering makes it capturable (chunk 5 before 6). |
| B3 cut | Project picker | **Rejected.** It is the "cute, proper wizard" the owner asked for and costs one `collection()` call. |
| B3 cut | Inline doctor | **Kept**, since doctor now ships in chunk 2, before the wizard. |
| B2 | Pain before product | **Accepted.** §6.2 item 0. |
| B2 | Safety as a selling point, linked to source | **Accepted.** §6.2 item 6. |
| B2 | Reuse the README example everywhere | **Accepted.** Wizard outro, README, page. |
| B2 | Interactive manual | **Accepted.** §6.2 item 4, within the page's craft budget. |
| B2 | Time-to-first-answer claim | **Accepted, conditionally:** only a measured number. |
| B2 | Shareable outro card | **Folded** into the OG image; no extra asset. |
