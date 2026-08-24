---
name: reviewing-operator-changes
description: Use when a change to this repo is finished and before committing, publishing, or reporting it done — the gate for the invariants that keep this server small, safe on stdio, and safe against destructive writes.
---

# Reviewing changes to this server

This project holds a small number of invariants that a reasonable-looking change
quietly breaks. Walk the list against the diff, then run the commands.

## Verify

```bash
npx tsc --noEmit    # must be silent
npm test            # 18 files, 192 tests, ~2s
```

Both must pass before the change is described as done. Report the actual output —
never claim green without having seen it.

## The invariants

**Two runtime dependencies.** `@modelcontextprotocol/sdk` and `zod`, nothing else in
`dependencies`. Native `fetch` instead of axios, `node:readline` instead of inquirer,
`process.env` instead of dotenv. A third dependency requires the user's agreement —
ask, do not add.

**stdout belongs to the transport.** The stdio server speaks JSON-RPC on stdout; one
stray `console.log` on a path the server can reach corrupts the stream and the client
disconnects. Diagnostics use `process.stderr.write`. Only `src/setup.ts` and
`src/install.ts` may write to stdout, because both run as CLI commands with no
transport attached.

```bash
grep -rn "console\." src/ | grep -vE "^src/(setup|install)\.ts"   # must be empty
```

**No `delete_*` tool.** Destruction goes through `api_request`, where it cannot
happen by misreading a vague instruction. A new tool whose name or description
promises removal is a design error, not a naming one — `remove_convention` is the
one exception, and it backs the file up first.

**Every write is guarded.** HTTP writes are blocked in `OpenProjectClient.request`
when `config.readOnly`. A filesystem write must check `config.readOnly` itself and
throw `ReadOnlyError`. New write tool → new read-only test.

**Files stay under ~150 lines, one responsibility each.**

```bash
wc -l src/*.ts src/tools/*.ts | sort -rn | head
```

**Relative imports end in `.js`.** ESM under `moduleResolution: Node16`.

```bash
grep -rn "from \"\\.\\.*/[^\"]*\"" src/ | grep -v "\.js\"" | grep -v "\.json\""
```

**Every zod field has `.describe()`.** These are agent-facing docs, not type-checker
noise. A field an agent cannot choose a value for is a broken tool.

**Comments are rare and earn their place.** There are exactly six in `src/`:
`lockVersion` locking, `offset` being a page number, ISO 8601 durations, the `o`/`c`
status operators, `t`/`f` boolean filter values, and readline's unmutable echo. Each
records an external constraint the code cannot express. A seventh needs a reason of
the same kind. Delete any comment that restates what the line does.

**Tests never reach the network.** `test/` mocks `fetch`. Anything needing a real
instance belongs in `test-live/`, behind the `OPENPROJECT_URL` / `OPENPROJECT_API_KEY`
guard.

## Quality pass

Beyond the invariants, check the change for:

- **KISS.** Is there a smaller version that fully covers the need? Prefer deleting a
  branch to adding a flag, a plain function to a class, an existing helper to a new
  one.
- **Reuse.** Did this add a flattener that `hal.ts` already has, a resolver that
  `resolve.ts` already has, or a response shape that `handler` already builds?
- **Blast radius.** For any change to `shared.ts`, `client.ts`, `hal.ts`, or
  `resolve.ts`, run `codegraph_impact` on the changed symbol. `handler` alone reaches
  19 symbols; `request` has 7 callers.
- **Error text.** Does a failure tell the agent what to do next? `No type named
  "Epicc". Available: Bug` is the standard — name the problem and list the way out.

## Red flags

| In the diff | Means |
|---|---|
| `console.log` outside `setup.ts`/`install.ts` | Will break the stdio transport |
| A new entry in `dependencies` | Stop and ask the user |
| `try`/`catch` inside a tool handler | `handler` already does this |
| A tool named `delete_*` / `remove_*` / `destroy_*` | Route through `api_request` |
| `.optional()` with no `.describe()` | Undocumented agent-facing field |
| A comment restating the next line | Delete it |
| A `test/` file reading `process.env.OPENPROJECT_*` | Belongs in `test-live/` |
| A src file past ~150 lines | Split it by responsibility |
