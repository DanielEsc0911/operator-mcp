# OPerator

An MCP server that lets agents work inside your OpenProject instance — read and
update work packages, triage notifications, log time — while following your
workplace's written conventions.

## Setup

```bash
npx operator-mcp setup
```

The wizard asks for your instance URL and an API key, checks them, and prints the
block to paste into your MCP client:

```json
{
  "mcpServers": {
    "openproject": { "command": "npx", "args": ["-y", "operator-mcp"] }
  }
}
```

Get an API key from your OpenProject profile, under **Access tokens**. It belongs
to you, so the server already knows who you are — `my_work` and your notification
feed work with no further configuration.

## Two workplaces at once

Each workplace is a profile with its own credentials and its own rules:

```bash
npx operator-mcp setup --profile acme
npx operator-mcp setup --profile personal
```

Register both:

```json
{
  "mcpServers": {
    "openproject-acme": { "command": "npx", "args": ["-y", "operator-mcp", "--profile", "acme"] },
    "openproject-personal": { "command": "npx", "args": ["-y", "operator-mcp", "--profile", "personal"] }
  }
}
```

## Conventions

Every profile carries a markdown manual at
`~/.config/operator-mcp/<profile>/conventions.md`. It is sent to the agent at
the start of every session, so your rules apply without anyone restating them:

```markdown
## Git / GitLab
- Branch: `{type}/{wp-id}-{slug}`  →  `bug/1234-fix-login-redirect`
- Commit subject: `[#1234] <imperative summary>`
- MR title must contain `#1234` so GitLab links back to the work package.

## Workflow
- Move to `In progress` only once a branch exists.
- Never close a work package yourself — set `Developed`, QA closes it.
```

Tell an agent a rule in conversation and it can record it with `add_convention`,
so the rule outlives the session. Rules are only ever appended; removing one takes
an explicit instruction from you, and the file is backed up first.

**Sharing with a team:** point everyone at one file.

```bash
OPENPROJECT_CONVENTIONS_PATH=/path/to/repo/conventions.md
```

Check that file into your repository and the manual becomes versioned, reviewed in
merge requests, and identical for everyone.

## Tools

| | |
|---|---|
| **Identity** | `whoami` |
| **Discovery** | `list_projects` · `list_users` · `get_work_package` · `search_work_packages` · `my_work` |
| **Tasks** | `create_work_package` · `update_work_package` · `comment_work_package` · `list_activities` · `link_work_packages` |
| **Notifications** | `list_notifications` · `mark_notifications_read` · `watch_work_package` |
| **Time & metadata** | `log_time` · `list_metadata` |
| **Conventions** | `conventions` · `add_convention` · `remove_convention` |
| **Escape hatch** | `api_request` |

There is no delete tool. Deletion is possible only through `api_request`, which
takes an explicit method and path — so it cannot happen by misreading an
instruction.

## Configuration

| Variable | Effect |
|---|---|
| `OPENPROJECT_URL` | Instance URL. Overrides the stored profile. |
| `OPENPROJECT_API_KEY` | API key. Overrides the stored profile. |
| `OPENPROJECT_PROFILE` | Profile to load. Same as `--profile`. |
| `OPENPROJECT_DEFAULT_PROJECT` | Project used when a tool's `project` is omitted. |
| `OPENPROJECT_CONVENTIONS_PATH` | Read the manual from somewhere else. |
| `OPENPROJECT_READ_ONLY` | Set to `1` to refuse every write. |

## Read-only agents

```json
{ "env": { "OPENPROJECT_READ_ONLY": "1" } }
```

Every create, update, comment, time entry, watch change, and convention edit is
refused before a request leaves the machine. Reads work normally.

## Development

```bash
npm install
npm test          # mocked, never touches a real instance
npm run build
```

Requires Node 20+. Two runtime dependencies. See `CLAUDE.md` for the working rules.

## License

MIT
