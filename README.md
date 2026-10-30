<p align="center">
  <a href="https://operator.daer.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/DanielEsc0911/operator-mcp/main/docs/brand/assets/hero/readme-hero-dark.png">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/DanielEsc0911/operator-mcp/main/docs/brand/assets/hero/readme-hero-light.png">
      <img src="https://raw.githubusercontent.com/DanielEsc0911/operator-mcp/main/docs/brand/assets/hero/readme-hero-dark.png" width="840" alt="OPerator: your agent, patched through to OpenProject.">
    </picture>
  </a>
</p>

<p align="center">
  <b>An MCP server that patches your coding agent through to OpenProject.</b><br>
  It reads your work, updates your tasks, and follows your team's rules.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/operator-mcp"><img src="https://img.shields.io/npm/v/operator-mcp?color=FFB020&labelColor=16131F" alt="npm version"></a>
  <a href="https://github.com/DanielEsc0911/operator-mcp/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/DanielEsc0911/operator-mcp/ci.yml?branch=main&label=CI&labelColor=16131F" alt="CI status"></a>
  <a href="https://github.com/DanielEsc0911/operator-mcp/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/operator-mcp?color=0C7D73&labelColor=16131F" alt="MIT licence"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#what-your-agent-can-do">What it does</a> ·
  <a href="#your-agent-cant-delete-anything-by-design">Safety</a> ·
  <a href="https://operator.daer.dev">Website</a>
</p>

---

Your coding agent can read your whole repository and still has to ask *"which
ticket is this?"*. It can't see your OpenProject, so you paste work packages into
the chat by hand, and the house rules (branch names, who closes what) get restated
every session.

OPerator connects the line. Your agent reads and updates work packages, triages
notifications and logs time, and it follows your workplace's written conventions
while doing so.

```text
You:   what's on my plate?
Agent: 3 work packages assigned to you in Acme:
       #1284  Bug   In progress  Fix login redirect loop
       #1301  Task  New          Migrate invoice export
       #1312  Task  New          Review Q3 access audit
```

## Install

On macOS or Linux (x64 or arm64), one line. No Node.js, no sudo:

```bash
curl -fsSL https://operator.daer.dev/install.sh | sh
```

The script downloads one gzipped binary, checks it against the release's SHA-256,
puts it in `~/.local/bin` and starts the setup wizard. To update, run the same line
again. It says what it found (*Upgrading 1.2.0 → 1.3.0*, or *npx → 1.3.0* if you
ran OPerator through npx before), and the wizard offers to keep your connection and
moves each agent onto the binary.

| Option | Effect |
|---|---|
| `sh -s -- --no-setup` | Install and stop there, without the wizard |
| `OPERATOR_VERSION=1.3.0` | Pin a release |
| `OPERATOR_INSTALL_DIR` | Install into another folder |
| `sh -s -- --lang es` or `OPERATOR_LANG=es` | Speak Spanish (the default follows your locale) |

**¿En español?** The installer, `setup`, `install`, `doctor` and `--help` speak
Spanish when your locale is Spanish (`LANG=es_ES.UTF-8` and the like), or when you
pass `--lang es`. What your agent reads (tool descriptions, errors) stays in English.

**Have Node.js 22 or newer?** npm fetches the package on demand. This is also the
way to install on Windows and Alpine:

```bash
npx operator-mcp setup
```

<details>
<summary><b>Or download the binary yourself</b></summary>

<br>

Grab it from the [latest release](https://github.com/DanielEsc0911/operator-mcp/releases/latest).
The files are named `operator-mcp-<linux|darwin>-<x64|arm64>.gz`, and `SHA256SUMS`
covers each `.gz`. Unpack the file, make it executable and put it on your `PATH`.
macOS marks browser downloads as quarantined, so clear that flag once:

```bash
gunzip operator-mcp-darwin-arm64.gz
chmod +x operator-mcp-darwin-arm64
xattr -d com.apple.quarantine operator-mcp-darwin-arm64
./operator-mcp-darwin-arm64 setup
```

</details>

### The wizard

`operator-mcp setup` takes about a minute, and the installer starts it for you. It
asks where your OpenProject lives, takes an API key, checks the line before saving
anything, and patches every agent it finds:

```text
  Where does your OpenProject live? e.g. openproject.acme.com
  › openproject.acme.com

  Your API key. Make one at https://openproject.acme.com/my/access_tokens
  (older instances: My account → Access token). It stays on this machine.
  › •••••••••••••

  Line's open   done   Ada Lovelace (ada@example.com) · 12 projects

  Which agents should OPerator patch into?
  › [x] Claude Code
    [x] Codex CLI
    [x] Gemini CLI
    [x] Cursor
    Confirm
    ↑↓ move · Space select · Enter confirm

  Patching in   done   Claude Code  added    ~/.claude.json
                done   Codex CLI    added    ~/.codex/config.toml
                done   Gemini CLI   updated  ~/.gemini/settings.json
                done   Cursor       added    ~/.cursor/mcp.json
```

An address without a scheme is taken as `https://`; plain `http://` is refused
unless the host is loopback. Along the way you pick a
default project (or none) from the projects where you can create work packages:
type part of a name or identifier to search them, ↑/↓ and Enter to choose. The wizard finishes with the same checks
`operator-mcp doctor` runs. Then **restart your agent** and ask it *"what's on my
plate?"*. Run `operator-mcp doctor` (or `npx operator-mcp doctor`) any time to check
the connection.

## Works with your agents

`setup` registers agents at the end. Run `install` on its own whenever you add a new
agent or a second profile:

```bash
npx operator-mcp install          # detect agents, ask which to register
npx operator-mcp install --yes    # register every detected agent, no prompt
```

It writes only OPerator's own entry, leaves your other servers untouched, and backs
up any file it changes.

| Agent | Where it writes | How to check it worked |
|---|---|---|
| **Claude Code** | `claude mcp add --scope user` | `/mcp` lists `openproject` as connected |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows); no Linux build, so not offered there | *Settings → Developer* shows `openproject` running |
| **Codex CLI** | `~/.codex/config.toml` | `codex mcp list` shows `openproject` |
| **Gemini CLI** | `~/.gemini/settings.json` | `/mcp` lists `openproject` |
| **Cursor** | `~/.cursor/mcp.json` | *Settings → MCP* shows `openproject` enabled |
| **opencode** | `~/.config/opencode/opencode.json` | `/mcp` lists `openproject` |

The installed binary registers itself by its absolute path, which Claude Desktop
needs because it starts servers with a minimal `PATH`. With `npx` instead, Claude
Desktop must find Node on its own `PATH`; when it can't, install the binary or put
the absolute path of `npx` in the entry.

### Registering by hand

For an agent OPerator doesn't detect, or if you'd rather write the config
yourself. Every MCP client wants the same two facts: run `npx`, with the arguments
`-y operator-mcp` — or, if you installed the binary, run its absolute path
(`~/.local/bin/operator-mcp`, expanded) with no arguments.

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
<summary><b>Claude Desktop</b>, <b>Cursor</b>, <b>Windsurf</b>, <b>Cline</b>, <b>Zed</b>, and most others</summary>

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
`~/.config/operator-mcp/<profile>/config.json`, written with `0600` permissions, so
your MCP config stays safe to check into a repo.

## What your agent can do

| Area | Tools |
|---|---|
| **Identity** | `whoami` |
| **Discovery** | `list_projects` · `list_users` · `get_work_package` · `search_work_packages` · `my_work` |
| **Tasks** | `create_work_package` · `update_work_package` · `comment_work_package` · `list_activities` · `link_work_packages` |
| **Notifications** | `list_notifications` · `mark_notifications_read` · `watch_work_package` |
| **Time & metadata** | `log_time` · `list_metadata` |
| **Conventions** | `conventions` · `add_convention` · `remove_convention` |
| **Escape hatch** | `api_request` |

The API key is yours, so the server already knows who you are: `my_work` and your
notification feed need no further configuration.

## Conventions: teaching your agent how you work

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

`setup` writes a starter file you can edit. Or tell an agent a rule in conversation
and it records it with `add_convention`, so the rule outlives the session. Rules are
only ever appended; removing one takes an explicit instruction from you, and the
file is backed up first.

**Sharing with a team:** point everyone at one file, check it into your repository,
and the manual becomes versioned, reviewed in merge requests, and identical for
everyone.

```bash
OPENPROJECT_CONVENTIONS_PATH=/path/to/repo/conventions.md
```

## Your agent can't delete anything. By design.

OPerator has no `delete_*` tool at all, so an agent cannot delete a work package
because it misread a vague instruction. The generic `api_request` tool also refuses
`DELETE` unless you set `OPENPROJECT_ALLOW_DELETE=1` in the server's environment,
and an agent can't set that for itself. If you want the agent to report without
touching anything, [read-only mode](#read-only-agents) refuses every write before
it leaves the machine.

## Two workplaces at once

Each workplace is a profile with its own credentials and its own rules:

```bash
npx operator-mcp setup --profile acme
npx operator-mcp setup --profile personal
```

Each registers under its own server name, `openproject-acme` and
`openproject-personal`, so both can be connected at the same time and your agent
never confuses one instance for the other.

## Read-only agents

Add this to the server's entry in your MCP config:

```json
{ "env": { "OPENPROJECT_READ_ONLY": "1" } }
```

Every create, update, comment, time entry, watch change, and convention edit is
refused before a request leaves the machine. Reads work normally.

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
| `OPERATOR_LANG` | `es` or `en` for the command-line text. Same as `--lang`; otherwise `LC_ALL`, `LC_MESSAGES`, `LANG` decide. |

Environment variables win over the stored profile, which makes CI easy: set
`OPENPROJECT_URL` and `OPENPROJECT_API_KEY` and skip `setup` entirely.

## Troubleshooting

<details>
<summary><b>The agent doesn't see OpenProject at all</b></summary>

<br>

Running `setup` alone is not enough on older versions: it saved credentials but
never told your agent the server existed. Run `npx operator-mcp install`, then
restart the agent. Almost every "it can't find my projects" report is this.

</details>

<details>
<summary><b>Registered, but the tools still don't appear</b></summary>

<br>

Restart the agent completely; most clients only read their MCP config at startup.
Then confirm the server starts on its own:

```bash
npx -y operator-mcp
```

It should sit there silently waiting for JSON-RPC on stdin. Press Ctrl+C. Any error
message it prints instead is the real problem.

</details>

<details>
<summary><b>"Not configured. Run: npx operator-mcp setup"</b></summary>

<br>

The agent found the server but no credentials for the profile it asked for. If you
registered a `--profile` server, run `setup --profile <name>` for that same profile.

</details>

<details>
<summary><b>"API key rejected"</b></summary>

<br>

The token was revoked or mistyped. Generate a new one at **My account → Access
tokens → API** and re-run `setup`.

</details>

<details>
<summary><b>"Cannot reach https://…"</b></summary>

<br>

The instance URL is wrong, or it's behind a VPN this machine isn't on. Open the URL
in a browser from the same machine to confirm.

</details>

<details>
<summary><b>Node version</b></summary>

<br>

The `npx` path requires Node 22 or newer (`node --version`). The installed binary
needs no Node.

</details>

## Development

```bash
npm install
npm test          # mocked, never touches a real instance
npm run build
```

Two runtime dependencies. See `CLAUDE.md` for the working rules.

## License

MIT © Daniel Escalona

<br>

<p align="center">
  <img src="https://raw.githubusercontent.com/DanielEsc0911/operator-mcp/main/docs/brand/assets/favicon/180.png" width="44" alt="Op, the OPerator mascot"><br>
  <sub>OPerator is an independent project, not affiliated with OpenProject GmbH.</sub>
</p>
