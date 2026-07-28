# OPerator

MCP server exposing an OpenProject instance to agents. Published as `openproject-mcp`.

## Run it

```bash
npm install          # once
npm test             # vitest, mocked fetch, never touches a real instance
npm run build        # tsc → dist/
node dist/index.js setup    # credential wizard
node dist/index.js          # stdio MCP server
```

## Rules

**Two runtime dependencies.** `@modelcontextprotocol/sdk` and `zod`. Nothing else ships.
Native `fetch` replaces axios, `node:readline` replaces inquirer, `process.env`
replaces dotenv. A third dependency needs a reason and the user's agreement.

**Relative imports end in `.js`.** This is an ESM package under `moduleResolution:
Node16`. `import { loadConfig } from "./config.js"` — even though the file is `.ts`.

**Files stay under ~150 lines, one responsibility each.** When a file outgrows that,
split it by responsibility. `OpenProjectClient` is the only class.

**Comments are rare and earn their place.** Names carry the meaning. A comment
explains something the code cannot: an external constraint, a counterintuitive
API contract, a workaround. There are exactly six in this codebase — OpenProject's
`lockVersion` locking, `offset` being a page number, ISO 8601 durations, the `o`/`c`
status operators, `t`/`f` boolean filter values, and readline's unmutable echo.
Do not add a seventh without a reason of the same kind. Never write a comment
restating what the line does.

**Zod descriptions are agent-facing documentation.** `.describe()` on every field.
Write what an agent needs to choose correctly, not what a type checker needs.

**No `delete_*` tools, ever.** Destruction goes through `api_request`, where it
cannot happen by misreading a vague instruction.

**Every write checks `config.readOnly`.** HTTP writes are guarded inside
`OpenProjectClient.request`. Filesystem writes — the conventions manual — are
guarded in their own tool.

**stdout belongs to the transport.** The stdio server speaks JSON-RPC on stdout;
a stray `console.log` anywhere the server can reach corrupts the stream and the
client disconnects. Diagnostics use `process.stderr.write`. Only `src/setup.ts`
may write to stdout, because the wizard runs with no transport attached.

**Tests mock `fetch`.** `test/` never reaches the network. Live smoke tests live in
`test-live/` and run only when `OPENPROJECT_URL` and `OPENPROJECT_API_KEY` are set.

## Layout

| Path | Does |
|---|---|
| `src/config.ts` | Profiles, env precedence, URL normalization |
| `src/errors.ts` | Typed errors and their human messages |
| `src/client.ts` | All HTTP. Auth, timeouts, filters, pagination, read-only guard |
| `src/hal.ts` | HAL+JSON → flat objects. Pure |
| `src/conventions.ts` | The workplace manual: read, append, remove, back up |
| `src/resolve.ts` | Name-or-id → APIv3 href |
| `src/server.ts` | McpServer, `instructions`, registration |
| `src/setup.ts` | Wizard |
| `src/tools/` | One module per domain |
| `src/tools/workPackageFields.ts` | Write-argument schema and its field/link mapping |

## OpenProject APIv3 traps

- Auth is `Authorization: Bearer <apiKey>`.
- `filters` is a URL-encoded JSON array: `[{"assignee":{"operator":"=","values":["me"]}}]`
- Open and closed are *operators*, not values: `{"status":{"operator":"o","values":[]}}`
- `offset` is a 1-based **page number**, not a record offset. `pageSize` is items per page.
- `PATCH` requires the current `lockVersion`. Read the resource first. A stale value returns 409.
- Time entry hours are ISO 8601 durations. 2.5 hours is `PT2H30M`.
- Comments are `POST /work_packages/{id}/activities` with `{"comment":{"raw":"..."}}`.
- Assignable people come from `/projects/{id}/available_assignees`. `/users` needs admin.
- Collections put members in `_embedded.elements`, with `total` and `count` at the root.
