# Security Policy

## Supported versions

The latest published minor version of `operator-mcp` receives security fixes.

## Reporting a vulnerability

Report privately through GitHub's advisory form:
<https://github.com/DanielEsc0911/operator-mcp/security/advisories/new>

Please do not open a public issue for anything that could expose someone's
OpenProject credentials or data. Expect an acknowledgement within 72 hours and a
fix or a plan within 14 days.

## What this server can do

`operator-mcp` acts with exactly the permissions of the API key you configure. It
speaks only to the instance URL in your profile, over HTTPS (plain `http://` is
refused unless the host is loopback or `OPENPROJECT_ALLOW_INSECURE_HTTP=1`), and
stores the key in a mode-600 file in your own config directory. It runs as a local
subprocess of your agent and opens no listening port.

`api_request` refuses `DELETE` unless `OPENPROJECT_ALLOW_DELETE=1`.
`OPENPROJECT_READ_ONLY=1` refuses every write.

## Threat model

The agent driving this server may be reading attacker-controlled text — a work
package description, a comment, an imported email. The server therefore treats
every tool argument as untrusted: path segments are percent-encoded, requests
cannot leave the configured `/api/v3` root, recorded conventions are collapsed to
a single capped line, and destructive verbs need an opt-in that only the person
who wrote the agent's config can give.

The server does **not** defend against a compromised agent client, a malicious
OpenProject instance, or an operator who enables every switch.
