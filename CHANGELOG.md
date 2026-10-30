# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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
