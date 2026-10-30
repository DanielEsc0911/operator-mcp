# Public Release Hardening — Design & Finding Register

**Date:** 2026-08-21
**Status:** Approved, ready to implement. **Amended 2026-10-29:** Node floor is `>=22`, not `>=24` — see `2026-10-29-fresh-coat-design.md` §3. Execution of this register is tracked by that spec's chunks 1–2.
**Implements:** first public release of OPerator to npm and GitHub
**Plan:** `docs/superpowers/plans/2026-08-21-public-release-hardening.md`
**Human runbook:** `docs/MANUAL-RELEASE-STEPS.md`

---

## 1. Goal

Take OPerator from "works on the author's machine" to a package a stranger can
install, trust, and run on Windows, macOS, or Linux — with a CI/CD pipeline that
proves every release, and no way for an installed copy to damage the machine or
the OpenProject instance without the operator's explicit consent.

Nothing about the tool surface changes. Every finding below is about
distribution, safety, or the terminal experience.

## 2. Decisions taken

These four were open questions; they are now settled and every task below
assumes them.

| Decision | Value | Why |
|---|---|---|
| **npm package name** | `operator-mcp` | `openproject-mcp` is taken on npm — `openproject-mcp@1.0.1`, published 2026-01-23 by `cyborgx0x`, a different, unrelated OpenProject MCP server. `mcp-openproject` is the same author's repo. `operator-mcp` is unregistered and matches the project's real name. |
| **`engines.node`** | `>=24` | Node 24 is Active LTS ("Krypton", currently 24.19.0, ships npm 11.17.0). Node 20 went EOL in April 2026 and receives no security patches. CI matrix is Node 24 only. |
| **`api_request` DELETE** | Gated behind `OPENPROJECT_ALLOW_DELETE=1` | The escape hatch stays, but destruction becomes a deliberate act by the human who wrote the MCP client config, not something a prompt-injected agent can reach on a default install. |
| **npm publish auth** | Trusted Publishing (OIDC) | No long-lived `NPM_TOKEN` in GitHub secrets, nothing to rotate or leak, and provenance attestation comes free. |

### Consequences of the name change

- Binary becomes `operator-mcp`; `npx operator-mcp setup`.
- Config directory becomes `~/.config/operator-mcp/<profile>/`. There are **no
  published users**, so no migration code is written. The author's own existing
  config is moved by one `mv` in the runbook.
- Every string in `README.md`, `src/errors.ts`, `src/setup.ts` and the templates
  that says `openproject-mcp` must change. The **MCP server name stays
  `openproject`** — that is what appears in the client's tool namespace and it
  describes the domain, not the package.

## 3. Finding register

Severity: **H** = must fix before publishing · **M** = fix in this release ·
**L** = worth doing, not a blocker.

### 3.1 Security

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 | H | **Sub-path installs are silently broken and requests can leave the configured path root.** `new URL(\`/api/v3${path}\`, this.config.url)` discards any path component of the base URL. An instance at `https://host/openproject` (OpenProject's supported `relative_url_root`) gets requests sent to `https://host/api/v3/...`. | `src/client.ts:24` | Build the URL by concatenation — `new URL(\`${config.url}/api/v3${path}\`)` — and assert the resulting `origin` equals the configured origin before the request goes out. |
| S2 | H | **API key is transmitted in cleartext over `http://`.** The key authenticates as HTTP Basic (`apikey:<key>`, base64 — encoding, not encryption). Any `http://` instance URL leaks a full-privilege credential to every hop. | `src/client.ts:32-38` | Reject `http://` at config load unless the host is loopback (`localhost`, `127.0.0.1`, `::1`) or `OPENPROJECT_ALLOW_INSECURE_HTTP=1` is set. Warn loudly in the wizard. |
| S3 | H | **Un-encoded agent input is interpolated into API paths.** `project` is a free-form string from the model and lands in `/projects/${project}/work_packages`, `/projects/${project}/types`, `/projects/${project}/available_assignees`. A value of `../../users/me` reaches an unintended endpoint. This matters more once `api_request` DELETE is gated: a `project` argument must not become a general-purpose path constructor. | `src/tools/workPackages.ts:43`, `src/resolve.ts:29`, `src/resolve.ts:86`, `src/tools/identity.ts:68` | A `segment()` helper that `encodeURIComponent`s every interpolated user value. `/` becomes `%2F`, so a traversal collapses into one literal segment the server rejects. |
| S4 | H | **Credentials embedded in a URL are echoed back to the agent.** `OPENPROJECT_URL=https://user:pass@host` is stored verbatim and reappears in `whoami`, in the server `instructions`, in every `url` field of every flattened resource, and in the 401 message. | `src/config.ts:20-22`, `src/hal.ts:48`, `src/server.ts:19` | Strip `username`, `password`, `search` and `hash` in `normalizeUrl`. Add a test asserting no error path or tool result ever contains the API key. |
| S5 | M | **Profile name is not validated and reaches the filesystem.** `--profile ../../.ssh` resolves to `join(homedir(), ".config", "operator-mcp", "../../.ssh")`. Self-inflicted, but a published CLI should not have a directory-traversal argument. | `src/config.ts:24-32` | `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`. Rejects `..` because the first character class excludes `.`. |
| S6 | M | **A world-readable credential file is loaded without complaint.** `saveConfig` writes `0600`, but nothing checks the mode on read — a file restored from a backup, copied between machines, or written by an older build can be `0644` and nobody is told. | `src/config.ts:34-42` | On load, `statSync` the file; if `mode & 0o077`, write one line to stderr naming the file and the `chmod 600` fix. Warn, never fail — a failure here would break a working install. |
| S7 | H | **Two known vulnerabilities in the production dependency tree.** Both arrive through `@modelcontextprotocol/sdk@1.30.0`, which is already the latest release. `nanoid` is dev-only (vite → postcss) and does not ship. | `npm audit --omit=dev`: `hono@4.12.32` (≤4.12.33, 4 advisories incl. GHSA-f23p-vx2j-j53r cross-user data disclosure) and `fast-uri@3.1.4` (≤3.1.4, GHSA-7p8r-x3mc-p8w7 host confusion) | `npm audit fix` — both fixed versions are inside the existing semver ranges, so a lockfile refresh is enough. Add `overrides` only if that fails. Gate CI on `npm audit --omit=dev --audit-level=high`. |
| S8 | H | **`api_request` can DELETE anything with no second gate.** By design deletion is "explicit method plus path", but on a public package the caller is a model that may be reading attacker-controlled work package text. | `src/tools/raw.ts:20` | Refuse `DELETE` unless `config.allowDelete`. Gate in the **tool**, not in `client.request` — `watch_work_package(watching: false)` legitimately issues a DELETE to `/watchers/{id}` and must keep working. |
| S9 | M | **`add_convention` is a persistent prompt-injection foothold.** The manual is injected verbatim into `instructions` on every future session. A rule containing a newline plus `## ` forges a section; a rule containing instructions survives forever. An agent that reads a poisoned work package description can write one. | `src/conventions.ts:30-47`, `src/server.ts:24` | Normalize `section` and `rule` to a single line — collapse `\r\n\t` and runs of whitespace, strip a leading `#` or bullet marker, cap at 80 / 500 characters. `removeRule` must normalize identically or removal stops matching. |
| S10 | L | `remove_convention` writes an unbounded number of `.bak` files next to the manual. | `src/conventions.ts:68` | Out of scope. Note in the README that backups accumulate and are safe to delete. |
| S11 | M | **Machine-local and generated directories are not ignored** and would be committed to a public repo: `.claude/settings.local.json` (this machine's permission grants) and `.codegraph/` (a large regenerable index). | `.gitignore` | Extend `.gitignore`. `.claude/skills/` is deliberately kept — the four project skills are useful to contributors. |
| S12 | M | **The author's real name and personal email are baked into ten test fixtures**, which become public with the repo. | `test/**` — 10 occurrences of `daescalona@proton.me` | Replace with a neutral persona (`Ada Lovelace` / `ada@example.com`). |
| S13 | L | Fixed 30 s timeout, no retry, no backoff. Not a vulnerability; a hung instance stalls one tool call and the agent sees a clear error. | `src/client.ts:9` | Leave alone. KISS. |

**Explicitly assessed and found clean:**

- No secrets in git history (`git log -p --all` scanned for key/token/password literals — no hits). `package-lock.json` is tracked.
- `test/` never reaches the network; `test-live/` is a separate vitest config, gated on `OPENPROJECT_URL`/`OPENPROJECT_API_KEY`/`OPENPROJECT_TEST_PROJECT` being present, and is not run by CI.
- No `child_process`, no `eval`, no dynamic `import()` of user input, no shell interpolation anywhere in `src/`.
- Filesystem writes are confined to the profile directory and `conventionsPath`, both operator-configured. No agent argument selects a path.
- Every HTTP write is guarded by `config.readOnly` inside `client.request`; the one filesystem write reachable by an agent (`add_convention`) is guarded in its own tool.
- `stdout` is clean: the only `console.log` calls are in `src/setup.ts`, which runs with no transport attached.

### 3.2 Correctness and product bugs

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| B1 | H | **`operator-mcp --profile setup` starts the wizard instead of the server**, because routing is `process.argv.includes("setup")` — a substring match across the whole argv. | `src/index.ts:7` | Route on `argv[2]` only, in a testable `runCli(argv)`. |
| B2 | M | No `--help`, no `--version`. A published CLI must answer both. | `src/index.ts` | Add both to `runCli`. |
| B3 | H | **Ctrl-C during the API-key prompt leaves the terminal with echo off.** `readHidden` calls `process.exit(130)` without `setRawMode(false)`; the user's shell is left in raw mode and they must blind-type `reset`. | `src/setup.ts:61-64` | Restore raw mode and the borrowed listeners on every exit path, including abort. |
| B4 | M | **Non-ASCII and edited input is corrupted.** `String.fromCharCode(byte)` decodes each UTF-8 byte separately, so a multibyte character becomes mojibake; arrow keys and Home/End insert raw escape-sequence bytes into the key. | `src/setup.ts:67` | Decode the chunk as UTF-8 and iterate code points; discard the remainder of a chunk that begins an escape sequence; support Ctrl-U (clear line) and both backspace codes. |
| B5 | M | **The wizard cannot be aborted and cannot be scripted.** Wrong credentials loop forever with no "give up" path, and there is no non-interactive mode for Docker images, dotfiles bootstraps, or CI. | `src/setup.ts:89-100` | Offer retry/abort after each failure; exit 130 on abort. Add `--non-interactive`, taking the URL from `--url` or `OPENPROJECT_URL` and the key from `OPENPROJECT_API_KEY` or piped stdin. **No `--api-key` flag** — argv is world-readable through `ps`. |
| B6 | M | The wizard never says where to get an API key, which is the single most common first-run stumble. | `src/setup.ts:91` | Once the URL is known, print `<url>/my/access_token` before prompting for the key. |
| B7 | M | Re-running setup silently overwrites an existing profile with no indication of what was there. | `src/setup.ts:103` | Show the existing URL and a masked key, and require confirmation before overwriting. |
| B8 | M | **No way to diagnose a broken install from the terminal.** "It doesn't show up in my client" is the dominant support burden for every MCP server, and there is currently nothing to run. | — | Add `operator-mcp doctor`: version, Node, platform, resolved profile, which source each setting came from, config file path/existence/permissions, masked key, read-only and delete flags, conventions path and size, then a live connectivity probe. Exit 1 on any hard failure. |
| B9 | M | **The printed config snippet only fits Claude Desktop.** Cursor, VS Code, Windsurf and Claude Code all differ, and on Windows a bare `npx` command fails in several clients — it needs `cmd /c npx`. | `src/setup.ts:28-33` | Emit a per-client block: `claude mcp add` for Claude Code, JSON for Claude Desktop / Cursor / Windsurf, `.vscode/mcp.json` for VS Code, plus the `cmd /c` form on win32. |
| B10 | M | **`~/.config` is not the Windows convention** and `XDG_CONFIG_HOME` is ignored on Linux. | `src/config.ts:24-26` | `%APPDATA%\operator-mcp` on win32, `$XDG_CONFIG_HOME/operator-mcp` otherwise, falling back to `~/.config`. |
| B11 | M | **The server version is hardcoded `"0.1.0"`** in `McpServer` and will drift from `package.json` on the first release. | `src/server.ts:39` | Single-source it from `package.json`. |
| B12 | H | The wizard's snippet, `ConfigError`, and the README all name `openproject-mcp`, which now belongs to someone else. Users would be told to install a stranger's package. | `src/errors.ts:3`, `src/setup.ts:31`, `README.md` | Rename throughout. |
| B13 | L | A startup failure surfaces as a raw stack trace. | `src/index.ts` | Catch at the top level, print one clear stderr line, exit 1. |
| B14 | L | `engines` is advisory; on an old Node the failure is a cryptic syntax error. | `src/index.ts` | Check `process.versions.node` at entry and print an actionable message. |

### 3.2a Register status (2026-10-29, Fresh Coat)

| Row | Status | Commit |
|---|---|---|
| S1 | done | 53e4f49 |
| S2 | done | 54ef089 |
| S3 | done | 53e4f49 |
| S4 | done | 54ef089 |
| S5 | done | 54ef089 |
| S6 | done | 54ef089 |
| S7 | done | 9920902 |
| S8 | done | 44cd899 |
| S9 | done | 0a50bda |
| S10 | deferred | — |
| S11 | done | `.gitignore` before Fresh Coat |
| S12 | open | — (author email still in 9 test files) |
| S13 | wontfix | — |
| B1 | done | 6d47eb8 |
| B2 | done | 6d47eb8 |
| B3 | done | b737b61 |
| B4 | done | b737b61 |
| B5 | done | 670d2a6 |
| B6 | done | 670d2a6 |
| B7 | done | 670d2a6 |
| B8 | done | 87b2d12 |
| B9 | moot | agent auto-registration (`install`) replaced the snippet |
| B10 | done | ad9e4d5 |
| B11 | done | 1711c8b |
| B12 | moot | rename already landed |
| B13 | done | 6d47eb8 |
| B14 | done | 6d47eb8 (floor 22, not 24) |

### 3.3 Missing for a public repository

Everything in this table is absent today.

| Item | Purpose |
|---|---|
| `LICENSE` | `package.json` claims MIT with no license file. npm and GitHub both surface this; without the file the claim is unenforceable. |
| `SECURITY.md` | Where to report a vulnerability privately, and the supported-versions statement. Mandatory for a credential-handling tool. |
| `CONTRIBUTING.md` | Setup, the two golden rules, the invariants, how to run tests. |
| `CHANGELOG.md` | Keep a Changelog format; the release workflow references it. |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1. |
| `.github/ISSUE_TEMPLATE/{bug,feature}.yml`, `PULL_REQUEST_TEMPLATE.md` | Issue triage; the bug form asks for `operator-mcp doctor` output. |
| `.github/dependabot.yml` | Weekly npm + github-actions updates. Without it, S7-class findings recur silently. |
| `.github/workflows/ci.yml` | Lint, typecheck, test, build, package-contents check on Linux/macOS/Windows; audit; secret scan. |
| `.github/workflows/codeql.yml` | GitHub static analysis for JS/TS. |
| `.github/workflows/release.yml` | Tag-triggered publish via OIDC with provenance, plus a GitHub Release. |
| `.nvmrc` | Pins the dev Node to 24. |
| `biome.json` + `@biomejs/biome` | The project has no linter or formatter. Biome is one devDependency covering both — the right KISS answer versus ESLint + Prettier + plugins. |
| `scripts/pack-check.mjs` | Asserts the published tarball contains `dist/`, `templates/`, `README.md`, `LICENSE` and nothing else — no `src/`, no `test/`, no `.env`, no `.claude/`. |
| `package.json` metadata | `repository`, `bugs`, `homepage`, `keywords`, `author`, `publishConfig.access`, `prepack`. Missing metadata means no repo link on npm and no provenance UI. |

## 4. Design of the new pieces

### 4.1 Config surface after this change

```
OPENPROJECT_URL                  instance URL, overrides the stored profile
OPENPROJECT_API_KEY              API key, overrides the stored profile
OPENPROJECT_PROFILE              profile to load (same as --profile)
OPENPROJECT_DEFAULT_PROJECT      project used when a tool's `project` is omitted
OPENPROJECT_CONVENTIONS_PATH     read the manual from somewhere else
OPENPROJECT_READ_ONLY            "1" refuses every write
OPENPROJECT_ALLOW_DELETE         "1" permits api_request DELETE            [new]
OPENPROJECT_ALLOW_INSECURE_HTTP  "1" permits a non-loopback http:// URL    [new]
XDG_CONFIG_HOME / APPDATA        where the profile directory lives         [new]
```

`Config` gains `allowDelete: boolean` and `allowInsecureHttp: boolean`. Both
default to `false`. Both are read only from the environment — never from the
stored profile file, so that enabling them is always visible in the MCP client
config a human wrote.

### 4.2 CLI surface

```
operator-mcp                     start the stdio MCP server (default)
operator-mcp setup [--profile p] [--non-interactive] [--url URL]
operator-mcp doctor [--profile p]
operator-mcp --help | -h
operator-mcp --version | -v
```

`src/index.ts` shrinks to a shebang plus a call into `src/cli.ts`, which is
pure enough to test: `runCli(argv, streams)` returns an exit code.

### 4.3 Release pipeline

```
push / PR ──▶ ci.yml ──▶ lint · typecheck · test · build · pack-check   (ubuntu, macos, windows)
                     ├─▶ npm audit --omit=dev --audit-level=high        (ubuntu)
                     └─▶ gitleaks                                       (ubuntu)

push tag v* ─▶ release.yml ─▶ tag == package.json version
                           ─▶ full test + build
                           ─▶ npm publish   (OIDC, no secret, provenance)
                           ─▶ GitHub Release with generated notes
```

Trusted Publishing requires npm ≥ 11.5.1; Node 24 ships 11.17.0, and the
workflow upgrades npm anyway so the floor cannot regress.

Workflows are validated three ways before the first real release: `actionlint`
locally, a `workflow_dispatch` run of `ci.yml`, and a dry run of the release
path against a `v0.0.0-test` tag on a throwaway branch — described step by step
in the runbook.

## 5. Out of scope

- Retries, backoff, or rate limiting in `client.ts` (S13).
- Pruning `.bak` files (S10).
- Any change to the tool set, tool names, or tool arguments. The MCP surface
  published at 1.0.0 is exactly the one that exists today, plus the DELETE gate.
- Docker image, Homebrew formula, or a hosted/remote transport.
- Migration code for the old config directory — there are no published users.

## 6. Version

First public release is **1.0.0**. The tool surface is deliberate and stable,
and semver protects tool names and argument shapes from here on. Publishing
0.x would signal instability that does not exist and would leave no room to
communicate a genuine breaking change later.
