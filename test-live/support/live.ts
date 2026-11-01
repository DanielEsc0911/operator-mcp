import { OpenProjectClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

export const url = process.env.OPENPROJECT_URL;
export const apiKey = process.env.OPENPROJECT_API_KEY;
export const project = process.env.OPENPROJECT_TEST_PROJECT ?? "operator-live";
export const configured = Boolean(url && apiKey);

export const liveConfig = (): Config => ({
  profile: "live",
  url: url!,
  apiKey: apiKey!,
  conventionsPath: "/nonexistent/conventions.md",
  readOnly: false,
  allowDelete: true,
  defaultProject: project,
});

export const liveClient = () => new OpenProjectClient(liveConfig());

export const stamp = () => `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Everything created through here is deleted by cleanup(); call it from afterAll. */
export function fixtures(client: OpenProjectClient) {
  const created: { path: string }[] = [];

  return {
    async workPackage(subject: string, extra: Record<string, unknown> = {}) {
      const [type] = (await client.collection("/types", {})).elements;
      const wp = await client.request("POST", `/projects/${project}/work_packages`, {
        body: { subject, ...extra, _links: { type: { href: `/api/v3/types/${type.id}` }, ...(extra._links as object | undefined) } },
      });
      created.push({ path: `/work_packages/${wp.id}` });
      return wp;
    },
    async version(name: string) {
      const version = await client.request("POST", "/versions", {
        body: { name, _links: { definingProject: { href: `/api/v3/projects/${(await client.request("GET", `/projects/${project}`)).id}` } } },
      });
      created.push({ path: `/versions/${version.id}` });
      return version;
    },
    async cleanup() {
      for (const { path } of created.reverse()) await client.request("DELETE", path).catch(() => undefined);
      created.length = 0;
    },
  };
}
