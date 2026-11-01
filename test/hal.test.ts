import { describe, expect, it } from "vitest";
import workPackage from "./fixtures/workPackage.json" with { type: "json" };
import notification from "./fixtures/notification.json" with { type: "json" };
import {
  linkTitle, linkId, flattenWorkPackage, flattenProject, flattenNotification, flattenNamed,
} from "../src/hal.js";

const BASE = "https://op.acme.com";

describe("link helpers", () => {
  it("reads a link title", () => {
    expect(linkTitle(workPackage, "status")).toBe("In progress");
  });

  it("reads a numeric id out of an href", () => {
    expect(linkId(workPackage, "assignee")).toBe(12);
  });

  it("returns undefined for a missing link", () => {
    expect(linkTitle(workPackage, "responsible")).toBeUndefined();
    expect(linkId(workPackage, "responsible")).toBeUndefined();
  });

  it("returns undefined for a null link, which OpenProject uses for unset references", () => {
    const unassigned = { _links: { assignee: { href: null as unknown as string } } };
    expect(linkId(unassigned, "assignee")).toBeUndefined();
  });
});

describe("flattenWorkPackage", () => {
  const flat = flattenWorkPackage(workPackage, BASE);

  it("lifts link titles to plain fields", () => {
    expect(flat).toMatchObject({
      id: 1234,
      subject: "Fix login redirect",
      type: "Bug",
      status: "In progress",
      priority: "High",
      project: "Website",
      assignee: "Ada Lovelace",
      parent: 1200,
      dueDate: "2026-08-03",
      percentageDone: 40,
    });
  });

  it("builds a browser url", () => {
    expect(flat.url).toBe("https://op.acme.com/work_packages/1234");
  });

  it("omits detail fields by default so list results stay small", () => {
    expect(flat).not.toHaveProperty("description");
    expect(flat).not.toHaveProperty("lockVersion");
    expect(flat).not.toHaveProperty("author");
  });

  it("includes detail fields on request", () => {
    const detailed = flattenWorkPackage(workPackage, BASE, { detail: true });
    expect(detailed).toMatchObject({ author: "Ana Ruiz", lockVersion: 7 });
    expect(detailed.description).toContain("Users land on /dashboard");
  });

  it("emits no _links", () => {
    expect(JSON.stringify(flat)).not.toContain("_links");
  });
});

describe("flattenNotification", () => {
  const flat = flattenNotification(notification);

  it("flattens to the fields an agent triages on", () => {
    expect(flat).toMatchObject({
      id: 88,
      reason: "mentioned",
      read: false,
      project: "Website",
      actor: "Ana Ruiz",
      workPackageId: 1234,
      workPackageSubject: "Fix login redirect",
    });
    expect(flat.url).toBeUndefined();
  });

  it("names a resource that is not a work package", () => {
    const wiki = { ...notification, _links: { ...notification._links, resource: { href: "/api/v3/wiki_pages/4", title: "Onboarding" } } };
    const flatWiki = flattenNotification(wiki);
    expect(flatWiki.workPackageId).toBeUndefined();
    expect(flatWiki.resource).toBe("Onboarding");
  });
});

describe("flattenProject and flattenNamed", () => {
  const project = {
    id: 3, name: "Website", identifier: "website", active: true,
    description: { raw: "Public site" }, _links: {},
  };

  it("flattens a project without its description, which bloats long lists", () => {
    expect(flattenProject(project, BASE)).toEqual({
      id: 3, name: "Website", identifier: "website", active: true,
      url: "https://op.acme.com/projects/website",
    });
  });

  it("reduces metadata resources to id and name", () => {
    expect(flattenNamed({ id: 7, name: "Bug", _links: {} })).toEqual({ id: 7, name: "Bug" });
  });

  it("keeps isClosed on statuses, since status names don't say which ones are closed", () => {
    expect(flattenNamed({ id: 18, name: "Done", isClosed: false, _links: {} })).toEqual({ id: 18, name: "Done", isClosed: false });
  });
});
