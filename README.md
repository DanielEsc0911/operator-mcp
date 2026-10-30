# OPerator

[![npm](https://img.shields.io/npm/v/operator-mcp.svg)](https://www.npmjs.com/package/operator-mcp)
[![license](https://img.shields.io/npm/l/operator-mcp.svg)](./LICENSE)

An MCP server that lets your coding agent work inside your OpenProject instance —
read and update work packages, triage notifications, log time — while following
your workplace's written conventions.

Ask your agent *"what's on my plate?"* and it answers from real work packages.
Tell it *"branches are named `bug/1234-slug` here"* and it remembers, for every
session after.

```
You: what's on my plate?
Agent: 3 work packages assigned to you in Acme:
       #1284  Bug   In progress  Fix login redirect loop
       #1301  Task  New          Migrate invoice export
       #1312  Task  New          Review Q3 access audit
```

## Quickstart

One command. It asks for your credentials, then registers OPerator with every
agent it finds on your machine.

```bash
npx operator-mcp setup
```

You'll be asked for two things:

| | |
|---|---|
| **Instance URL** | `https://openproject.acme.com` — the address you log in at |
| **API key** | Generate one at **Avatar → My account → Access tokens → API**, then copy it |

The wizard checks the credentials against your instance before saving anything, so
a typo tells you immediately instead of failing later inside an agent.

**Then restart your agent** and ask it *"what's on my plate?"*. That's the whole
setup.

### Verifying it worked

| Agent | Check |
|---|---|
| Claude Code | `/mcp` lists `openproject` as connected |
| Codex CLI | `codex mcp list` shows `openproject` |
| Gemini CLI | `/mcp` lists `openproject` |
| opencode | `/mcp` lists `openproject` |

If the tools still aren't there, see [Troubleshooting](#troubleshooting).

## Registering with agents

`setup` does this for you at the end. Run it standalone whenever you install a new
agent, or want to add a second profile:

```bash
npx operator-mcp install          # detect agents, ask which to register
npx operator-mcp install --yes    # register every detected agent, no prompt
```

It detects these, writes the entry, and backs up any file it changes:

| Agent | Where it writes |
|---|---|
| **Claude Code** | delegates to `claude mcp add --scope user` |
| **Codex CLI** | `~/.codex/config.toml` |
| **Gemini CLI** | `~/.gemini/settings.json` |
| **opencode** | `~/.config/opencode/opencode.json` |

Existing servers in those files are left untouched — only OPerator's own entry is
written.

### Registering by hand

For an agent OPerator doesn't detect, or if you'd rather write the config
yourself. Every MCP client wants the same two facts: run `npx`, with the arguments
`-y operator-mcp`.

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add openproject --scope user -- npx -y operator-mcp
```

Use `--scope project` instead to check the server into a repo for your team (it
lands in `.mcp.json`); `--scope local` limits it to the current project, just for you.
</details>

<details>
<summary><b>Codex CLI</b> — <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.openproject]
command = "npx"
args = ["-y", "operator-mcp"]
```
</details>

<details>
<summary><b>Gemini CLI</b> — <code>~/.gemini/settings.json</code></summary>

```json
{
  "mcpServers": {
    "openproject": { "command": "npx", "args": ["-y", "operator-mcp"] }
  }
}
```
</details>

<details>
<summary><b>opencode</b> — <code>~/.config/opencode/opencode.json</code></summary>

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openproject": {
      "type": "local",
      "command": ["npx", "-y", "operator-mcp"],
      "enabled": true
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b> — <code>~/.cursor/mcp.json</code>, <b>Windsurf</b>, <b>Cline</b>, <b>Zed</b>, and most others</summary>

```json
{
  "mcpServers": {
    "openproject": { "command": "npx", "args": ["-y", "operator-mcp"] }
  }
}
```

This is the common MCP shape. Any client that accepts a stdio server takes it —
check your client's docs for which file it reads.
</details>

<details>
<summary><b>VS Code</b> — <code>.vscode/mcp.json</code></summary>

```json
{
  "servers": {
    "openproject": { "type": "stdio", "command": "npx", "args": ["-y", "operator-mcp"] }
  }
}
```
</details>

Credentials never appear in these files. They live in
`~/.config/operator-mcp/<profile>/config.json`, written with `0600` permissions,
so your MCP config stays safe to check into a repo.

## What your agent can do

| | |
|---|---|
| **Identity** | `whoami` |
| **Discovery** | `list_projects` · `list_users` · `get_work_package` · `search_work_packages` · `my_work` |
| **Tasks** | `create_work_package` · `update_work_package` · `comment_work_package` · `list_activities` · `link_work_packages` |
| **Notifications** | `list_notifications` · `mark_notifications_read` · `watch_work_package` |
| **Time & metadata** | `log_time` · `list_metadata` |
| **Conventions** | `conventions` · `add_convention` · `remove_convention` |
| **Escape hatch** | `api_request` |

The API key is yours, so the server already knows who you are — `my_work` and your
notification feed need no further configuration.

**There is no delete tool.** Deletion is possible only through `api_request`, which
takes an explicit method and path — so it cannot happen by misreading a vague
instruction.

## Conventions — teaching your agent how you work

Every profile carries a markdown manual at
`~/.config/operator-mcp/<profile>/conventions.md`. It is handed to the agent at the
start of every session, so your rules apply without anyone restating them:

```markdown
## Git / GitLab
- Branch: `{type}/{wp-id}-{slug}`  →  `bug/1234-fix-login-redirect`
- Commit subject: `[#1234] <imperative summary>`
- MR title must contain `#1234` so GitLab links back to the work package.

## Workflow
- Move to `In progress` only once a branch exists.
- Never close a work package yourself — set `Developed`, QA closes it.
```

`setup` writes a starter file you can edit. Or just tell an agent a rule in
conversation and it records it with `add_convention`, so the rule outlives the
session. Rules are only ever appended; removing one takes an explicit instruction
from you, and the file is backed up first.

**Sharing with a team:** point everyone at one file.

```bash
OPENPROJECT_CONVENTIONS_PATH=/path/to/repo/conventions.md
```

Check that file into your repository and the manual becomes versioned, reviewed in
merge requests, and identical for everyone.

## Two workplaces at once

Each workplace is a profile with its own credentials and its own rules:

```bash
npx operator-mcp setup --profile acme
npx operator-mcp setup --profile personal
```

Each registers under its own server name — `openproject-acme`,
`openproject-personal` — so both can be connected at the same time and your agent
never confuses one instance for the other.

## Read-only agents

Add this to the server's entry in your MCP config:

```json
{ "env": { "OPENPROJECT_READ_ONLY": "1" } }
```

Every create, update, comment, time entry, watch change, and convention edit is
refused before a request leaves the machine. Reads work normally. Useful for an
agent you want reporting on the project but not touching it.

## Configuration

| Variable | Effect |
|---|---|
| `OPENPROJECT_URL` | Instance URL. Overrides the stored profile. |
| `OPENPROJECT_API_KEY` | API key. Overrides the stored profile. |
| `OPENPROJECT_PROFILE` | Profile to load. Same as `--profile`. |
| `OPENPROJECT_DEFAULT_PROJECT` | Project used when a tool's `project` is omitted. |
| `OPENPROJECT_CONVENTIONS_PATH` | Read the manual from somewhere else. |
| `OPENPROJECT_READ_ONLY` | Set to `1` to refuse every write. |
| `OPENPROJECT_ALLOW_DELETE` | Set to `1` to let `api_request` send `DELETE`. Off by default. Environment only. |
| `OPENPROJECT_ALLOW_INSECURE_HTTP` | Set to `1` to allow a plain `http://` URL to a non-loopback host. The API key then travels unencrypted. Environment only. |

Environment variables win over the stored profile, which makes CI easy: set
`OPENPROJECT_URL` and `OPENPROJECT_API_KEY` and skip `setup` entirely.

## Troubleshooting

**The agent doesn't see OpenProject at all.**
Running `setup` alone is not enough on older versions — it saved credentials but
never told your agent the server existed. Run `npx operator-mcp install`, then
restart the agent. Almost every "it can't find my projects" report is this.

**Registered, but the tools still don't appear.**
Restart the agent completely — most clients only read their MCP config at startup.
Then confirm the server starts on its own:

```bash
npx -y operator-mcp
```

It should sit there silently waiting for JSON-RPC on stdin. Press Ctrl+C. Any error
message it prints instead is the real problem.

**"Not configured. Run: npx operator-mcp setup"**
The agent found the server but no credentials for the profile it asked for. If you
registered a `--profile` server, run `setup --profile <name>` for that same profile.

**"API key rejected"**
The token was revoked or mistyped. Generate a new one at **My account → Access
tokens → API** and re-run `setup`.

**"Cannot reach https://…"**
The instance URL is wrong, or it's behind a VPN this machine isn't on. Open the URL
in a browser from the same machine to confirm.

**Node version.** Requires Node 22 or newer — `node --version`.

## Development

```bash
npm install
npm test          # mocked, never touches a real instance
npm run build
```

Two runtime dependencies. See `CLAUDE.md` for the working rules.

## License

MIT © Daniel Escalona
