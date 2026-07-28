import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OpenProjectClient } from "../src/client.js";
import { ConfigError, ReadOnlyError, OpenProjectError } from "../src/errors.js";
import type { Config } from "../src/config.js";

const config: Config = {
  profile: "acme",
  url: "https://op.acme.com",
  apiKey: "secret",
  conventionsPath: "/tmp/conventions.md",
  readOnly: false,
};

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("sends a bearer token to the versioned api path", async () => {
    fetchMock.mockResolvedValue(respond({ id: 1 }));
    await new OpenProjectClient(config).request("GET", "/users/me");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe("https://op.acme.com/api/v3/users/me");
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(init.method).toBe("GET");
  });

  it("serializes a json body", async () => {
    fetchMock.mockResolvedValue(respond({ id: 1 }));
    await new OpenProjectClient(config).request("POST", "/work_packages", { body: { subject: "Hi" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ subject: "Hi" });
  });

  it("drops undefined query values", async () => {
    fetchMock.mockResolvedValue(respond({}));
    await new OpenProjectClient(config).request("GET", "/projects", { query: { pageSize: 5, offset: undefined } });

    expect(fetchMock.mock.calls[0][0].toString()).toBe("https://op.acme.com/api/v3/projects?pageSize=5");
  });

  it("returns null for 204 responses", async () => {
    fetchMock.mockResolvedValue(respond(null, 204));
    expect(await new OpenProjectClient(config).request("POST", "/notifications/read_ian")).toBeNull();
  });

  it("throws ConfigError when credentials are missing", async () => {
    const client = new OpenProjectClient({ ...config, url: "", apiKey: "" });
    await expect(client.request("GET", "/users/me")).rejects.toBeInstanceOf(ConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks every non-GET method in read-only mode before any request", async () => {
    const client = new OpenProjectClient({ ...config, readOnly: true });
    await expect(client.request("POST", "/work_packages", { body: {} })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(client.request("PATCH", "/work_packages/1", { body: {} })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(client.request("DELETE", "/work_packages/1")).rejects.toBeInstanceOf(ReadOnlyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows GET in read-only mode", async () => {
    fetchMock.mockResolvedValue(respond({ id: 1 }));
    await new OpenProjectClient({ ...config, readOnly: true }).request("GET", "/users/me");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps an error status to an OpenProjectError", async () => {
    fetchMock.mockResolvedValue(respond({ _embedded: { errors: [{ message: "Subject can't be blank" }] } }, 422));
    const error = await new OpenProjectClient(config).request("POST", "/work_packages", { body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(OpenProjectError);
    expect(error.status).toBe(422);
    expect(error.message).toBe("Subject can't be blank");
  });

  it("explains a network failure with the instance url", async () => {
    fetchMock.mockRejectedValue(new TypeError("getaddrinfo ENOTFOUND"));
    await expect(new OpenProjectClient(config).request("GET", "/users/me")).rejects.toThrow(
      "Cannot reach https://op.acme.com: getaddrinfo ENOTFOUND",
    );
  });
});

describe("collection", () => {
  it("encodes filters and sort as json query parameters", async () => {
    fetchMock.mockResolvedValue(respond({ total: 2, count: 2, _embedded: { elements: [{ id: 1 }, { id: 2 }] } }));

    const result = await new OpenProjectClient(config).collection("/work_packages", {
      filters: [{ status: { operator: "o", values: [] } }],
      pageSize: 25,
      sortBy: [["dueDate", "asc"]],
    });

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get("filters")).toBe('[{"status":{"operator":"o","values":[]}}]');
    expect(url.searchParams.get("sortBy")).toBe('[["dueDate","asc"]]');
    expect(url.searchParams.get("pageSize")).toBe("25");
    expect(result).toEqual({ total: 2, count: 2, elements: [{ id: 1 }, { id: 2 }] });
  });

  it("omits the filters parameter when there are none", async () => {
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0, _embedded: { elements: [] } }));
    await new OpenProjectClient(config).collection("/projects", {});
    expect((fetchMock.mock.calls[0][0] as URL).searchParams.has("filters")).toBe(false);
  });

  it("tolerates a collection with no embedded elements", async () => {
    fetchMock.mockResolvedValue(respond({ total: 0, count: 0 }));
    expect((await new OpenProjectClient(config).collection("/projects", {})).elements).toEqual([]);
  });
});

describe("me", () => {
  it("resolves identity once and caches it", async () => {
    fetchMock.mockResolvedValue(respond({ id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" }));
    const client = new OpenProjectClient(config);

    expect(await client.me()).toEqual({ id: 12, name: "Daniel Escalona", email: "daescalona@proton.me" });
    await client.me();

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
