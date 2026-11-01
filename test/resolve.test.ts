import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OpenProjectClient } from "../src/client.js";
import { listMetadata, resolveHref, resolveId, resolveUserHref, resolveProjectId, clearMetadataCache } from "../src/resolve.js";
import type { Config } from "../src/config.js";

const config: Config = {
  profile: "test", url: "https://op.acme.com", apiKey: "secret",
  conventionsPath: "/nonexistent", readOnly: false,
};

const TYPES = { total: 2, count: 2, _embedded: { elements: [{ id: 1, name: "Task" }, { id: 7, name: "Bug" }] } };
const STATUSES = { total: 1, count: 1, _embedded: { elements: [{ id: 7, name: "In progress" }] } };

let fetchMock: ReturnType<typeof vi.fn>;

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  clearMetadataCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function client() {
  return new OpenProjectClient(config);
}

describe("listMetadata", () => {
  it("reduces each resource to id and name", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    expect(await listMetadata(client(), "types")).toEqual([{ id: 1, name: "Task" }, { id: 7, name: "Bug" }]);
  });

  it("maps activities to the time entry endpoint", async () => {
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0, _embedded: { elements: [] } }));
    await listMetadata(client(), "activities");
    expect((fetchMock.mock.lastCall![0] as URL).pathname).toBe("/api/v3/time_entries/activities");
  });

  it("scopes types to a project when one is given", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    await listMetadata(client(), "types", "website");
    expect((fetchMock.mock.lastCall![0] as URL).pathname).toBe("/api/v3/projects/website/types");
  });

  it("caches across calls", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    const shared = client();
    await listMetadata(shared, "types");
    await listMetadata(shared, "types");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("resolveHref", () => {
  it("accepts a numeric id without any lookup", async () => {
    expect(await resolveHref(client(), "types", 7)).toBe("/api/v3/types/7");
    expect(await resolveHref(client(), "types", "7")).toBe("/api/v3/types/7");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a name, case-insensitively", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    expect(await resolveHref(client(), "types", "bug")).toBe("/api/v3/types/7");
  });

  it("uses the time entry path for activities", async () => {
    fetchMock.mockResolvedValue(respond({ total: 1, count: 1, _embedded: { elements: [{ id: 3, name: "Development" }] } }));
    expect(await resolveHref(client(), "activities", "Development")).toBe("/api/v3/time_entries/activities/3");
  });

  it("lists the valid options when a name does not match", async () => {
    fetchMock.mockImplementation(async () => respond(STATUSES));
    await expect(resolveHref(client(), "statuses", "Doing")).rejects.toThrow(
      'No status named "Doing". Available: In progress',
    );
  });
});

describe("resolveHref staleness", () => {
  it("refetches once on a miss, so a value created after the cache was filled resolves", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(STATUSES))
      .mockResolvedValueOnce(respond({ total: 2, count: 2, _embedded: { elements: [{ id: 7, name: "In progress" }, { id: 9, name: "Blocked" }] } }));
    await resolveHref(client(), "statuses", "In progress");
    expect(await resolveHref(client(), "statuses", "  BLOCKED ")).toBe("/api/v3/statuses/9");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the cache per profile", async () => {
    fetchMock.mockImplementation(async () => respond(STATUSES));
    await listMetadata(client(), "statuses");
    await listMetadata(new OpenProjectClient({ ...config, profile: "other" }), "statuses");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("resolveId", () => {
  it("returns the trailing id of the href", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    expect(await resolveId(client(), "types", "Bug")).toBe("7");
  });
});

describe("resolveUserHref me", () => {
  it("accepts Me in any case", async () => {
    fetchMock.mockImplementation(async () => respond({ id: 12, name: "Ada", email: "a@b.c" }));
    expect(await resolveUserHref(client(), " Me ")).toBe("/api/v3/users/12");
  });
});

describe("resolveUserHref", () => {
  it("turns 'me' into the authenticated user", async () => {
    fetchMock.mockResolvedValue(respond({ id: 12, name: "Ada Lovelace", email: "ada@example.com" }));
    expect(await resolveUserHref(client(), "me")).toBe("/api/v3/users/12");
  });

  it("accepts a numeric id directly", async () => {
    expect(await resolveUserHref(client(), 12)).toBe("/api/v3/users/12");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks a name up among a project's assignable people", async () => {
    fetchMock.mockResolvedValue(respond({
      total: 1, count: 1,
      _embedded: { elements: [{ id: 5, name: "Ana Ruiz", email: "ana@acme.com" }] },
    }));
    expect(await resolveUserHref(client(), "Ana Ruiz", "website")).toBe("/api/v3/users/5");
    expect((fetchMock.mock.lastCall![0] as URL).pathname).toBe("/api/v3/projects/website/available_assignees");
  });

  it("matches on email too", async () => {
    fetchMock.mockResolvedValue(respond({
      total: 1, count: 1,
      _embedded: { elements: [{ id: 5, name: "Ana Ruiz", email: "ana@acme.com" }] },
    }));
    expect(await resolveUserHref(client(), "ana@acme.com", "website")).toBe("/api/v3/users/5");
  });

  it("uses the match's own self link, so groups and placeholders resolve", async () => {
    fetchMock.mockResolvedValue(respond({
      total: 1, count: 1,
      _embedded: { elements: [{ id: 8, name: "Dev Team", _links: { self: { href: "/api/v3/groups/8" } } }] },
    }));
    expect(await resolveUserHref(client(), "dev team", "website")).toBe("/api/v3/groups/8");
  });

  it("refuses an ambiguous name and lists the candidates with ids", async () => {
    fetchMock.mockResolvedValue(respond({
      total: 2, count: 2,
      _embedded: { elements: [{ id: 5, name: "Ana Ruiz" }, { id: 6, name: "Ana Ruiz" }] },
    }));
    await expect(resolveUserHref(client(), "Ana Ruiz", "website")).rejects.toThrow(
      'matches several users: Ana Ruiz (id 5), Ana Ruiz (id 6). Use the numeric id.',
    );
  });

  it("explains when nobody matches", async () => {
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0, _embedded: { elements: [] } }));
    await expect(resolveUserHref(client(), "Nobody", "website")).rejects.toThrow('No user matching "Nobody"');
  });
});

describe("resolveProjectId", () => {
  const PROJECTS = { total: 1, count: 1, _embedded: { elements: [{ id: 3, identifier: "website", name: "Website" }] } };

  it("passes a numeric id through without a request", async () => {
    expect(await resolveProjectId(client(), "3")).toBe("3");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const notFound = () => new Response(JSON.stringify({ message: "nope" }), { status: 404, headers: { "Content-Type": "application/json" } });
  const lookup = (url: URL) => (url.pathname === "/api/v3/projects" ? respond(PROJECTS) : notFound());

  it("resolves an identifier with a single request", async () => {
    fetchMock.mockImplementation(async () => respond({ id: 3, identifier: "website" }));
    expect(await resolveProjectId(client(), "website")).toBe("3");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][0] as URL).pathname).toBe("/api/v3/projects/website");
  });

  it("falls back to scanning names when the identifier is a 404", async () => {
    fetchMock.mockImplementation(async (url: URL) => lookup(url));
    expect(await resolveProjectId(client(), "WEBSITE")).toBe("3");
  });

  it("lists the projects it knows when nothing matches", async () => {
    fetchMock.mockImplementation(async (url: URL) => lookup(url));
    await expect(resolveProjectId(client(), "nope")).rejects.toThrow('No project "nope". Available: website (Website)');
  });
});
