# Contributing

Thanks for looking at OPerator.

## Getting set up

```bash
git clone https://github.com/DanielEsc0911/operator-mcp
cd operator-mcp
npm install
npm test          # mocked fetch, never touches a real instance
```

Node 22 or newer — `.nvmrc` pins it.

## Before you open a pull request

```bash
npx tsc --noEmit && npm test && npm run build && node scripts/pack-check.mjs
```

Live smoke tests run against a real instance and are opt-in:

```bash
OPENPROJECT_URL=... OPENPROJECT_API_KEY=... npm run test:live
```

Use a scratch project.

## The two golden rules

**KISS.** Take the simplest solution that completely covers the need — no simpler,
and no more. Prefer deleting a branch to adding a flag.

**Write clearly; let the code explain itself.** Names carry the meaning. Comments
are rare and record something the code cannot: an OpenProject API contract, a Node
constraint, a workaround.

## Invariants

These are not preferences. A pull request that breaks one will be asked to change.
`CLAUDE.md` holds the full list.

- **Two runtime dependencies**: `@modelcontextprotocol/sdk` and `zod`.
- **Relative imports end in `.js`** — ESM under `moduleResolution: Node16`.
- **Files stay under ~150 lines**, one responsibility each.
- **Zod `.describe()` on every field.** Those strings are what the agent reads.
- **No `delete_*` tools, ever.** Every write checks `config.readOnly`.
- **stdout belongs to the transport.** Terminal commands write only to the
  streams `runCli` hands them; `test/importGraph.test.ts` keeps them out of the
  server's reach.
- **Tests mock `fetch`.** `test/` never reaches the network.
- **Caller-supplied values are percent-encoded** with `segment()` before they
  land in an API path.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`). The
release notes are generated from them.
