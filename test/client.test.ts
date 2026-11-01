import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OpenProjectClient, segment } from "../src/client.js";
import { ConfigError, ReadOnlyError, OpenProjectError } from "../src/errors.js";
import type { Config } from "../src/config.js";

const config: Config = {
  profile: "acme",
  url: "https://op.acme.com",
  apiKey: "secret",
  conventionsPath: "/tmp/conventions.md",
  readOnly: false,
  allowDelete: false,
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

describe("segment", () => {
  it("turns a traversal into one encoded path segment", () => {
    expect(segment("../../users/me")).toBe("..%2F..%2Fusers%2Fme");
  });
});

describe("request url", () => {
  it("keeps the path of a sub-path install", async () => {
    fetchMock.mockResolvedValue(respond({ id: 1 }));
    await new OpenProjectClient({ ...config, url: "https://acme.com/openproject" }).request("GET", "/users/me");
    expect(fetchMock.mock.calls[0][0].toString()).toBe("https://acme.com/openproject/api/v3/users/me");
  });

  it("refuses a path that climbs out of the api root, before any request", async () => {
    const client = new OpenProjectClient({ ...config, url: "https://acme.com/openproject" });
    await expect(client.request("GET", "/../../admin")).rejects.toThrow(/outside https:\/\/acme.com\/openproject\/api\/v3/);
    await expect(client.request("GET", "https://evil.example/x")).rejects.toThrow(/relative to \/api\/v3/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("request", () => {
  it("authenticates the versioned api path as basic apikey:<key>", async () => {
    fetchMock.mockResolvedValue(respond({ id: 1 }));
    await new OpenProjectClient(config).request("GET", "/users/me");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe("https://op.acme.com/api/v3/users/me");
    const [scheme, credentials] = init.headers.Authorization.split(" ");
    expect(scheme).toBe("Basic");
    expect(Buffer.from(credentials, "base64").toString()).toBe("apikey:secret");
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
    fetchMock.mockResolvedValue(respond({ id: 12, name: "Ada Lovelace", email: "ada@example.com" }));
    const client = new OpenProjectClient(config);

    expect(await client.me()).toEqual({ id: 12, name: "Ada Lovelace", email: "ada@example.com" });
    await client.me();

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("response integrity", () => {
  const html = () => new Response("<html>Sign in</html>", { status: 200, headers: { "Content-Type": "text/html" } });

  it("warns that a write may have happened when a 2xx answer is not JSON", async () => {
    fetchMock.mockResolvedValue(html());
    const client = new OpenProjectClient(config);
    await expect(client.request("POST", "/work_packages", { body: {} })).rejects.toThrow(/non-JSON page.*write may already have happened/);
  });

  it("uses plainer text for a GET", async () => {
    fetchMock.mockResolvedValue(html());
    const client = new OpenProjectClient(config);
    const error = await client.request("GET", "/statuses").catch((e) => e);
    expect(error.message).toContain("non-JSON page");
    expect(error.message).not.toContain("write may");
  });

  it("accepts an empty 204 and an empty 200", async () => {
    const client = new OpenProjectClient(config);
    fetchMock.mockResolvedValueOnce(respond(null, 204));
    expect(await client.request("POST", "/notifications/read_ian")).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
    expect(await client.request("POST", "/notifications/read_ian")).toBeNull();
  });

  it("warns that a write may have happened when a non-GET times out", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const client = new OpenProjectClient(config);
    await expect(client.request("POST", "/work_packages", { body: {} })).rejects.toThrow(/did not answer.*write may already have happened/);
    await expect(client.request("GET", "/statuses")).rejects.toThrow(/Cannot reach/);
  });
});

describe("collectAll", () => {
  const page = (ids: number[], total: number) => ({ total, count: ids.length, _embedded: { elements: ids.map((id) => ({ id })) } });
  const run = (fetchMock: ReturnType<typeof vi.fn>) => {
    vi.stubGlobal("fetch", fetchMock);
    return new OpenProjectClient({ profile: "t", url: "https://op.acme.com", apiKey: "k", conventionsPath: "/x", readOnly: false }).collectAll("/projects");
  };
  afterEach(() => vi.unstubAllGlobals());

  it("pages until it has everything", async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page([1, 2], 3))))
      .mockResolvedValueOnce(new Response(JSON.stringify(page([3], 3))));
    const result = await run(mock);

    expect(result.elements.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(result.truncated).toBe(false);
    expect((mock.mock.calls[1][0] as URL).searchParams.get("offset")).toBe("2");
    expect((mock.mock.calls[1][0] as URL).searchParams.get("pageSize")).toBe("100");
  });

  it("stops at 2,000 items and says so", async () => {
    const full = Array.from({ length: 100 }, (_, i) => i);
    const mock = vi.fn(async () => new Response(JSON.stringify(page(full, 5_000))));
    const result = await run(mock);

    expect(result.elements).toHaveLength(2_000);
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(5_000);
  });
});
