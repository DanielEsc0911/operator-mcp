# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

- Profiles live in `$XDG_CONFIG_HOME/operator-mcp` (default `~/.config/operator-mcp`)
  and in `%APPDATA%\operator-mcp` on Windows.

## [1.1.2] - 2026-10-29

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

### Changed

- Requires Node 22 or newer.
- The MCP server reports the package version instead of `1.0.0`.
