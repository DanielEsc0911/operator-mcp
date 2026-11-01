import { segment, type OpenProjectClient } from "./client.js";
import { flattenNamed, linkHref } from "./hal.js";

export type MetaKind = "types" | "statuses" | "priorities" | "activities" | "versions";

type Named = { id: number; name: string };

const PATHS: Record<MetaKind, string> = {
  types: "/types",
  statuses: "/statuses",
  priorities: "/priorities",
  activities: "/time_entries/activities",
  versions: "/versions",
};

const SINGULAR: Record<MetaKind, string> = {
  types: "type",
  statuses: "status",
  priorities: "priority",
  activities: "activity",
  versions: "version",
};

const cache = new Map<string, Named[]>();

export function clearMetadataCache(): void {
  cache.clear();
}

function pathFor(kind: MetaKind, project?: string): string {
  return (kind === "types" || kind === "versions") && project ? `/projects/${segment(project)}${PATHS[kind]}` : PATHS[kind];
}

export async function listMetadata(
  client: OpenProjectClient,
  kind: MetaKind,
  project?: string,
  options: { fresh?: boolean } = {},
): Promise<Named[]> {
  const path = pathFor(kind, project);
  const key = `${client.config.profile}:${client.config.url}${path}`;
  const cached = options.fresh ? undefined : cache.get(key);
  if (cached) return cached;

  const { elements } = await client.collectAll(path);
  const named = elements.map(flattenNamed);
  cache.set(key, named);
  return named;
}

function isNumeric(value: string | number): boolean {
  return /^\d+$/.test(String(value));
}

export async function resolveHref(
  client: OpenProjectClient,
  kind: MetaKind,
  value: string | number,
  project?: string,
): Promise<string> {
  const base = `/api/v3${PATHS[kind]}`;
  if (isNumeric(value)) return `${base}/${value}`;

  const needle = String(value).trim().toLowerCase();
  const find = (list: Named[]) => list.find((entry) => entry.name.toLowerCase() === needle);
  let entries = await listMetadata(client, kind, project);
  let match = find(entries);
  if (!match) {
    entries = await listMetadata(client, kind, project, { fresh: true });
    match = find(entries);
  }
  if (!match) {
    throw new Error(
      `No ${SINGULAR[kind]} named "${value}". Available: ${entries.map((entry) => entry.name).join(", ")}`,
    );
  }
  return `${base}/${match.id}`;
}

export async function resolveId(
  client: OpenProjectClient,
  kind: MetaKind,
  value: string | number,
  project?: string,
): Promise<string> {
  const href = await resolveHref(client, kind, value, project);
  return href.slice(href.lastIndexOf("/") + 1);
}

export async function resolveUserHref(
  client: OpenProjectClient,
  value: string | number,
  project?: string,
): Promise<string> {
  if (value === "me") return `/api/v3/users/${(await client.me()).id}`;
  if (isNumeric(value)) return `/api/v3/users/${value}`;

  const path = project ? `/projects/${segment(project)}/available_assignees` : "/principals";
  const { elements } = await client.collectAll(path);
  const needle = String(value).trim().toLowerCase();
  const matches = elements.filter(
    (user) => String(user.name ?? "").toLowerCase() === needle || String(user.email ?? "").toLowerCase() === needle,
  );
  if (matches.length > 1) {
    const listed = matches.map((user) => `${user.name} (id ${user.id})`).join(", ");
    throw new Error(`"${value}" matches several users: ${listed}. Use the numeric id.`);
  }
  if (!matches.length) throw new Error(`No user matching "${value}". Use list_users to see who is available.`);
  return linkHref(matches[0], "self") ?? `/api/v3/users/${matches[0].id}`;
}

export async function resolveProjectId(client: OpenProjectClient, value: string | number): Promise<string> {
  if (isNumeric(value)) return String(value);

  const { elements } = await client.collectAll("/projects");
  const needle = String(value).trim().toLowerCase();
  const match = elements.find(
    (project) => String(project.identifier).toLowerCase() === needle || String(project.name ?? "").toLowerCase() === needle,
  );
  if (!match) {
    const known = elements.map((project) => `${project.identifier} (${project.name})`).join(", ");
    throw new Error(`No project "${value}". Available: ${known}`);
  }
  return String(match.id);
}
