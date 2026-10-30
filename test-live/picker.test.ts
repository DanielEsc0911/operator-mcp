import { describe, expect, it } from "vitest";
import { writableProjects } from "../src/credentials.js";

const url = process.env.OPENPROJECT_URL;
const apiKey = process.env.OPENPROJECT_API_KEY;

describe.skipIf(!url || !apiKey)("live project picker", () => {
  it("accepts the work_packages/create filter, with and without a query", async () => {
    const search = writableProjects({ url: url!, apiKey: apiKey! });
    const all = await search("");
    expect(all.total).toBeGreaterThanOrEqual(all.projects.length);
    if (all.projects.length === 0) return;

    const { identifier } = all.projects[0];
    const narrowed = await search(identifier);
    expect(narrowed.projects.map((project) => project.identifier)).toContain(identifier);
    expect(narrowed.total).toBeLessThanOrEqual(all.total);
  });
});
