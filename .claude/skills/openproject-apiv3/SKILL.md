---
name: openproject-apiv3
description: Use when writing or debugging code that talks to OpenProject — building filters, paginating, PATCHing a work package, logging time, reading HAL responses, or diagnosing a 401/403/404/409 from the instance.
---

# OpenProject APIv3

The instance's conventions are unusual in specific, non-guessable ways. Check this
before hand-rolling a request; every trap below has already cost a bug once.

## Request basics

All HTTP goes through `OpenProjectClient.request` in `src/client.ts` — never call
`fetch` from a tool. It prefixes `/api/v3`, authenticates, applies a 30s timeout,
blocks non-GET when `config.readOnly`, and converts a failed response into
`OpenProjectError` with a human message from `describeHttpError`.

**A personal API key is HTTP Basic, username `apikey`** — `Authorization: Basic
base64("apikey:" + key)`. `Bearer` is for OAuth2 access tokens only; a personal key
from `/my/access_token` sent as `Bearer` returns 401 `Unauthenticated`, which reads
as a bad key and sends you off regenerating it forever. This cost a bug once.

## The traps

**Filters are a URL-encoded JSON array**, one object per filter:

```typescript
[{ assignee: { operator: "=", values: ["me"] } }]
```

**Open and closed are operators, not values.** There is no status named "open":

```typescript
{ status: { operator: "o", values: [] } }   // any open status
{ status: { operator: "c", values: [] } }   // any closed status
```

Other operators in use: `**` full-text search, `>d` date-after. See `statusFilter`
and `buildSearchFilters` in `src/tools/workPackages.ts`.

**`offset` is a 1-based page number**, not a record offset. `pageSize` is items per
page. Passing `offset: 25` skips 24 *pages*.

**PATCH requires the current `lockVersion`.** Read the resource, copy its
`lockVersion` into the body, then PATCH. A stale value returns 409, which
`describeHttpError` rewrites to "Read the resource again and retry."

```typescript
const current = await client.request("GET", `/work_packages/${id}`);
await client.request("PATCH", `/work_packages/${id}`, {
  body: { lockVersion: current.lockVersion, ...fields, _links: links },
});
```

**Time entry hours are ISO 8601 durations.** 2.5 hours is `PT2H30M`. Use
`toIsoDuration` from `src/tools/time.ts`; do not send a number.

**Comments are activities**: `POST /work_packages/{id}/activities` with
`{ comment: { raw: "..." } }`. Rich-text fields are always `{ raw: string }` — this
holds for `description` and `comment` on both read and write.

**Assignable people come from `/projects/{id}/available_assignees`.** `/users`
requires admin and will 403 for a normal account. `resolveUserHref` falls back to
`/principals` only when there is no project.

**Collections put members in `_embedded.elements`**, with `total` and `count` at the
root. `client.collection` already unwraps this — use it instead of `request` for any
list endpoint.

## Reading responses

Never return a HAL resource to the agent. `src/hal.ts` flattens them:
`linkTitle(hal, "status")` pulls the human name out of `_links`, `linkId(hal, "parent")`
pulls the trailing id out of an href. Use the existing `flattenWorkPackage`,
`flattenProject`, `flattenNotification`, `flattenActivity`, `flattenNamed`, or add a
new `flatten*` beside them.

Every flattened object carries a `url` built from `config.url` so the agent can link
a human to the record.

## Writes: fields vs `_links`

Scalars (`subject`, `startDate`, `percentageDone`) are top-level fields. Anything
that references another resource (`type`, `status`, `priority`, `assignee`, `parent`,
`activity`, `workPackage`) is an `_links` entry holding an absolute API path:

```typescript
_links: { status: { href: "/api/v3/statuses/9" } }
```

`{ href: null }` clears a link. `buildPayload` in `src/tools/workPackageFields.ts`
does this split — extend it rather than assembling `_links` in a tool.

## Error status meanings

| Status | Means | `describeHttpError` says |
|---|---|---|
| 401 | API key rejected | regenerate at `{url}/my/access_token` |
| 403 | Account lacks the permission | the body's message, or a permission note |
| 404 | Missing **or not visible to you** | not found (or not visible) |
| 409 | Stale `lockVersion` | re-read the resource and retry |

## Common mistakes

| Mistake | Fix |
|---|---|
| `filters=status=open` | JSON array with the `o` operator |
| `offset: 50` to skip 50 records | `offset` is a page number |
| PATCH without `lockVersion` | GET first, copy it |
| `hours: 2.5` | `toIsoDuration(2.5)` → `PT2H30M` |
| `description: "text"` | `description: { raw: "text" }` |
| Listing via `/users` | `/projects/{id}/available_assignees` |
| Reading `body.elements` | `body._embedded.elements`, or use `client.collection` |

## Projects the user can write to

`GET /projects` with `{ user_action: { operator: "=", values: ["work_packages/create"] } }`
lists only projects where the user may create work packages, and it paginates and
combines with `{ name_and_identifier: { operator: "~", values: [text] } }` for
search. `/work_packages/available_projects` answers the same question but takes no
filters, so it cannot search a long list. An older instance may reject
`user_action` with 400; `writableProjects` callers fall back to a typed identifier.
