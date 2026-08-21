---
name: testing-mcp-tools
description: Use when writing, fixing, or extending tests under test/ or test-live/ — mocking fetch, driving a tool through the in-memory MCP client, asserting request bodies, or a test that unexpectedly hits the network.
---

# Testing MCP tools

Tests drive the **real server over an in-memory MCP transport** and mock only
`fetch`. That means a test exercises registration, the zod schema, `handler`, the
client, and the flattener in one call — the same path the agent takes.
`test/` never reaches the network.

## The harness

`test/support/harness.ts` gives you three things:

```typescript
import { connect, callTool, testConfig } from "../support/harness.js";

const client = await connect();                                   // default config
const client = await connect({ ...testConfig, readOnly: true });  // variant
const result = await callTool(client, "get_work_package", { id: 1234 });
result.isError;   // boolean
result.text;      // raw text content
result.json();    // parsed, for object-returning tools
```

## The fetch mock

Copy this preamble; it is the same in every tool test.

```typescript
function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const match = Object.keys(map).find((path) => url.pathname === `/api/v3${path}`);
    return match ? respond(map[match]) : respond({ message: `no route for ${url.pathname}` }, 404);
  });
}

function callsTo(pathname: string) {
  return fetchMock.mock.calls.filter(([url]) => (url as URL).pathname === `/api/v3${pathname}`);
}

function bodyOf(call: any[]): any {
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());
```

`routes` returns a 404 naming the unrouted path, so a missing route reads as
`no route for /api/v3/...` instead of a cryptic failure.

## Two non-obvious requirements

- **`clearMetadataCache()` in `beforeEach`.** `listMetadata` caches by
  `url + path` at module scope. Without the reset, a later test silently reuses the
  previous test's types and statuses.
- **Route `/users/me`.** `createServer` calls `client.me()` while building its
  instructions, so almost every test needs `"/users/me": ME` even when the tool
  under test never looks at identity.

## Assert the request, not just the response

The valuable assertion is the body this server *sent* to OpenProject — that is where
the `_links` split, the `lockVersion`, and the ISO duration live.

```typescript
expect(bodyOf(callsTo("/work_packages/1234")[1])).toEqual({
  lockVersion: 7,
  percentageDone: 60,
  _links: { status: { href: "/api/v3/statuses/9" } },
});
```

For a multi-step tool, assert the *order*: `calls[0][1].method` is `GET`,
`calls[1][1].method` is `PATCH`.

## Cover these cases per tool

| Case | Assertion |
|---|---|
| Happy path | request body and flattened result |
| Read-only | `isError`, text is the `ReadOnlyError` message |
| Unknown name | error text names the valid options |
| Nothing to do | `isError` **and** zero requests issued |
| Upstream failure | `respond(body, 409)` → the human message, not the raw body |
| Defaults applied | default project / limit / date reaches the request |

When the mock has to vary by method or status, drop `routes` and write
`mockImplementation` directly — see the 409 test in `test/tools/workPackageWrites.test.ts`.

## Fixtures

Shared response bodies live in `test/fixtures/*.json`, imported with an import
attribute:

```typescript
import workPackage from "../fixtures/workPackage.json" with { type: "json" };
```

## Live tests

`test-live/` runs against a real instance and only when `OPENPROJECT_URL` and
`OPENPROJECT_API_KEY` are set — `npm run test:live`. Keep it read-only smoke
coverage. Never move a live test into `test/`, and never let a `test/` file read
those env vars.

## Commands

```bash
npm test                                   # all 16 files, ~2s
npx vitest run test/tools/time.test.ts     # one file
npx tsc --noEmit                           # types only
```
