# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.0] - 2026-10-30

### Added

- Spanish. `setup`, `install`, `doctor`, `--help` and `install.sh` speak Spanish
  when `--lang es`, `OPERATOR_LANG`, `LC_ALL`, `LC_MESSAGES` or `LANG` says so
  (in that order; otherwise the system locale decides). Tool descriptions, server
  instructions and errors an agent reads stay in English.
- Arrow-key menus for choosing agents and the default project: ↑/↓ or j/k, Space
  marks, `a` all, `n` none, Enter confirms. Long lists scroll. Piped input and
  `--non-interactive` keep the typed answers.
- Upgrading from 1.2.0: the installer says *Upgrading npx → 1.3.0* (or the old
  binary's version), setup offers to keep the existing connection after checking
  it again, and each agent is reported as *updated* or *added*. Entries that ran
  `npx -y operator-mcp` are replaced with the binary.

### Changed

- A URL without a scheme is taken as `https://`, so `openproject.acme.com` works.
  Remote `http://` is still refused.
- Spinner, download bar and step lines are cut to the terminal's width on every
  frame, so a narrow window no longer fills with copies of the same line.

### Fixed

- Claude Code registration replaces an existing `openproject` entry instead of
  failing because the name is taken.
- On Windows, a profile 1.2.0 saved under `~/.config/operator-mcp` is still found
  until one is saved under `%APPDATA%`.

## [1.2.1] - 2026-10-30

This release carries the security fixes first prepared as 1.1.2, which was never
published. 1.2.0 was published to npm on 2026-08-25 without a matching commit in
this repository; 1.2.1 is built from `main`.

### Added

- `curl -fsSL https://operator.daer.dev/install.sh | sh` installs a standalone binary
  (macOS and Linux, x64 and arm64) to `~/.local/bin` after checking its SHA-256, then
  starts setup. No Node and no sudo needed. `npx operator-mcp setup` still works.
- Releases attach gzipped binaries, `SHA256SUMS` and `install.sh`. Agents are
  registered with the binary's absolute path when it is used instead of `npx`.
- A restyled setup wizard: project picker, agent checklist, inline checks, and a
  closing card with a first prompt to try.
- Claude Desktop (macOS, Windows) and Cursor are detected and registered.
- `operator-mcp doctor [--profile p]`: checks the config file and its mode, that the
  instance is reachable, that the key is accepted, and what each detected agent runs.
- `--help`, `--version`, and `setup --non-interactive --url URL` (key from
  `OPENPROJECT_API_KEY`).
- The wizard says where to create a key, shows an existing profile before
  overwriting it, and offers retry or abort after a failed check.

### Fixed

- `operator-mcp --profile setup` started the wizard instead of the server.
- Ctrl-C at the API-key prompt left the terminal without echo; non-ASCII keys and
  arrow keys corrupted the key.
- A startup failure printed a stack trace; it is now one line on stderr.

### Changed

- Requires Node 22 or newer.
- The MCP server reports the package version instead of `1.0.0`.
- Profiles live in `$XDG_CONFIG_HOME/operator-mcp` (default `~/.config/operator-mcp`)
  and in `%APPDATA%\operator-mcp` on Windows.

### Security

- Requests are built under the configured URL, so instances on a sub-path
  (`https://host/openproject`) work, and a path that would leave `/api/v3` is refused.
- Plain `http://` URLs are refused unless the host is loopback or
  `OPENPROJECT_ALLOW_INSECURE_HTTP=1` is set.
- Agent-supplied project identifiers are encoded as a single path segment.
- Credentials, query and fragment are stripped from the instance URL, so they
  never reach tool results, errors or server instructions.
- Profile names are validated and can no longer point outside the config directory.
- A config file readable by other users triggers a `chmod 600` warning on stderr.
- `api_request` refuses `DELETE` unless `OPENPROJECT_ALLOW_DELETE=1` is set.
- Conventions added by an agent are collapsed to one line and length-capped, so
  a rule cannot forge a heading in the manual.
- Production dependencies refreshed to clear `npm audit` advisories.
