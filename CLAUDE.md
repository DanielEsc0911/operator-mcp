# OPerator

MCP server exposing an OpenProject instance to agents. Published as `operator-mcp`.
TypeScript, ESM, `@modelcontextprotocol/sdk` + `zod`, tested with vitest.

## Run it

```bash
npm install          # once
npm test             # vitest, mocked fetch, never touches a real instance
npx tsc --noEmit     # types only
npm run build        # tsc → dist/
node dist/index.js setup    # credential wizard
node dist/index.js          # stdio MCP server
```

## The two golden rules

**KISS.** Take the simplest solution that *completely* covers the need — no simpler,
and no more. Prefer deleting a branch to adding a flag, a function to a class, an
existing helper to a new one. Cleverness that a reader has to decode is a defect.
When two designs both work, ship the one with fewer moving parts.

**Write clearly; let the code explain itself.** Names carry the meaning. Small
functions, one responsibility each, obvious data flow. Comments are rare and earn
their place: a comment explains something the code *cannot* — an external API's
counterintuitive contract, a workaround, a constraint from outside the file. Never
write a comment that restates the line below it. There are exactly six comments in
`src/`; each records an OpenProject or Node constraint. Do not add a seventh without
a reason of the same kind.

## Navigating this project — use CodeGraph

This repo is indexed by CodeGraph (`.codegraph/`). **Use it before Grep, Glob, or
reading files to orient yourself.** It is a tree-sitter parse of every symbol and
edge; reads are sub-millisecond and return structure that grep cannot. Trust its
results — do not re-verify them with grep.

| Question | Tool |
|---|---|
| How does this area work? What's the context for this task? | `codegraph_context` **(start here)** |
| Show me several related symbols' source | `codegraph_explore` (one call, not many reads) |
| Where is symbol X? | `codegraph_search` |
| X's signature or body | `codegraph_node` |
| What calls X? / What does X call? | `codegraph_callers` / `codegraph_callees` |
| What breaks if I change X? | `codegraph_impact` — **required** before changing anything in `shared.ts`, `client.ts`, `hal.ts`, or `resolve.ts` |
| What files exist under path/ | `codegraph_files` |

Use Read/Grep only for literal text (a string, a comment, a log line) or once you
already have the right file. Re-index after large external changes: `codegraph index .`

## Skills

Project skills in `.claude/skills/`. Load the relevant one **before** writing code —
each replaces reading three or four files to re-derive a pattern.

| Skill | Load it when |
|---|---|
| `authoring-mcp-tools` | Adding or changing a tool in `src/tools/` |
| `openproject-apiv3` | Writing any OpenProject request, filter, or HAL flattener |
| `testing-mcp-tools` | Writing or fixing anything in `test/` or `test-live/` |
| `reviewing-operator-changes` | Finishing a change, before committing or calling it done |

`openproject-apiv3` holds the instance's non-guessable conventions — filter
operators, `lockVersion`, page-number `offset`, ISO 8601 durations, HAL shape. Read
it before hand-rolling a request rather than guessing.

## Invariants

**Two runtime dependencies.** `@modelcontextprotocol/sdk` and `zod`. Native `fetch`
replaces axios, `node:readline` replaces inquirer, `process.env` replaces dotenv. A
third dependency needs a reason and the user's agreement.

**Relative imports end in `.js`.** ESM under `moduleResolution: Node16`.
`import { loadConfig } from "./config.js"` — even though the file is `.ts`.

**Files stay under ~150 lines, one responsibility each.** When a file outgrows that,
split it by responsibility. `OpenProjectClient` is the only class.

**Zod `.describe()` on every field.** These strings are agent-facing documentation.
Write what an agent needs to choose correctly, not what a type checker needs.

**No `delete_*` tools, ever.** Destruction goes through `api_request`, where it
cannot happen by misreading a vague instruction.

**Every write checks `config.readOnly`.** HTTP writes are guarded inside
`OpenProjectClient.request`. Filesystem writes — the conventions manual — are
guarded in their own tool.

**stdout belongs to the transport.** The stdio server speaks JSON-RPC on stdout; a
stray `console.log` anywhere the server can reach corrupts the stream and the client
disconnects. Diagnostics use `process.stderr.write`. Only `src/setup.ts` may write to
stdout, because the wizard runs with no transport attached.

**Tests mock `fetch`.** `test/` never reaches the network. Live smoke tests live in
`test-live/` and run only when `OPENPROJECT_URL` and `OPENPROJECT_API_KEY` are set.

## Framework practice

- Every tool is one `server.registerTool` inside a `register<Domain>Tools(server, { client })`
  function, registered from `createServer` in `src/server.ts`.
- Every handler is wrapped in `handler()` from `src/tools/shared.ts`. It shapes the
  result and converts a thrown error into `{ isError: true }`. Never build
  `{ content: [...] }` by hand; never `try/catch` inside a handler — throw.
- Tools return flattened objects from `src/hal.ts`, never raw HAL.
- User-supplied names go through `src/resolve.ts`, so a tool accepts a name, an id,
  or `"me"` and its not-found error lists the valid options.
- Errors are typed in `src/errors.ts` and carry a message that tells the agent what
  to do next.

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
| `test/support/harness.ts` | In-memory MCP client used by every tool test |
