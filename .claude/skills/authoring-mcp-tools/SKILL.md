---
name: authoring-mcp-tools
description: Use when adding, renaming, or changing a tool this MCP server exposes — anything touching src/tools/, registerTool, WRITE_SCHEMA, or the tool list in src/server.ts.
---

# Authoring MCP tools

Every tool in this server is one `server.registerTool` call inside a
`register<Domain>Tools(server, { client })` function. Copy the shape below; do not
invent a new one.

## The shape

```typescript
server.registerTool(
  "list_metadata",
  {
    title: "List metadata",
    description:
      "Ids and names for work package types, statuses, priorities, or time entry activities. Call this when a write is rejected for an unknown value.",
    inputSchema: {
      kind: z.enum(["types", "statuses", "priorities", "activities"])
        .describe("Which list to fetch. `activities` means time entry activities."),
      project: z.string().optional()
        .describe("Restrict types to one project. Ignored for the other kinds."),
    },
  },
  handler(({ kind, project }: { kind: MetaKind; project?: string }) =>
    listMetadata(client, kind, project ?? client.config.defaultProject),
  ),
);
```

## Rules

1. **Wrap every handler in `handler()`** from `./shared.js`. It converts a returned
   object to JSON content, a returned string to text content, and any thrown error
   to `{ isError: true }` via `humanMessage`. Never build `{ content: [...] }` by hand,
   never `try/catch` inside a handler — throw and let `handler` shape it.
2. **Return flattened data, never raw HAL.** Use a `flatten*` from `../hal.js`.
   If no flattener fits the resource, add one there rather than inlining field picking.
3. **`.describe()` on every zod field.** These strings are the only documentation the
   calling agent gets. Write what an agent needs to choose correctly — the accepted
   forms, the default, what `null` means — not what a type checker needs.
4. **Accept names, not just ids.** Route user-supplied values through
   `resolveHref` / `resolveId` / `resolveUserHref` in `../resolve.js`. They accept a
   numeric id, a name, or `"me"`, and their not-found error lists the valid options.
5. **Writes need a guard.** HTTP writes are already blocked inside
   `OpenProjectClient.request`. A tool that writes to the *filesystem* must check
   `config.readOnly` itself and `throw new ReadOnlyError()`.
6. **PATCH reads first.** See `openproject-apiv3` for the `lockVersion` protocol.
7. **No `delete_*` tool, ever.** Destructive calls go through `api_request`.
8. **Register it.** A new `register*Tools` function must be called in `createServer`
   (`src/server.ts`) or the tool does not exist.
9. **Relative imports end in `.js`.** `./shared.js`, `../hal.js` — even from a `.ts` file.

## Shared write arguments

`create_work_package` and `update_work_package` both spread `WRITE_SCHEMA` from
`workPackageFields.ts` and both call `buildPayload`, which splits arguments into
plain `fields` and `_links`. Adding a writable work-package field means editing
`WriteArgs`, `WRITE_SCHEMA`, and `buildPayload` together — not adding an argument to
one tool.

## When the file outgrows ~150 lines

Split by responsibility, the way `workPackages.ts` (reads) / `workPackageWrites.ts`
(writes) / `workPackageFields.ts` (schema) already are. Do not let a module grow a
second job.

## Before you edit

`handler` reaches 19 symbols and `OpenProjectClient.request` has 7 callers. Run
`codegraph_impact` on anything in `shared.ts`, `client.ts`, `hal.ts`, or
`resolve.ts` before changing its signature.

## Common mistakes

| Mistake | Fix |
|---|---|
| `try/catch` inside the handler | Throw. `handler` turns it into an error result. |
| Returning `wp` straight from `client.request` | `flattenWorkPackage(wp, config.url)` |
| `z.string()` with no `.describe()` | Every field, always. |
| Handler takes only a numeric id | Accept a name too; resolve it. |
| New tool module never appears | Add the `register*Tools` call to `createServer`. |
| `import { handler } from "./shared"` | `"./shared.js"` |
