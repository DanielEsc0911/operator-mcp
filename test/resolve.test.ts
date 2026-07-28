import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OpenProjectClient } from "../src/client.js";
import { listMetadata, resolveHref, resolveId, resolveUserHref, clearMetadataCache } from "../src/resolve.js";
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
    fetchMock.mockResolvedValue(respond(STATUSES));
    await expect(resolveHref(client(), "statuses", "Doing")).rejects.toThrow(
      'No status named "Doing". Available: In progress',
    );
  });
});

describe("resolveId", () => {
  it("returns the trailing id of the href", async () => {
    fetchMock.mockResolvedValue(respond(TYPES));
    expect(await resolveId(client(), "types", "Bug")).toBe("7");
  });
});

describe("resolveUserHref", () => {
  it("turns 'me' into the authenticated user", async () => {
    fetchMock.mockResolvedValue(respond({ id: 12, name: "Daniel Escalona", email: "d@e.me" }));
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

  it("explains when nobody matches", async () => {
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0, _embedded: { elements: [] } }));
    await expect(resolveUserHref(client(), "Nobody", "website")).rejects.toThrow('No user matching "Nobody"');
  });
});
