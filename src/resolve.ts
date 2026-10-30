import { segment, type OpenProjectClient } from "./client.js";
import { flattenNamed } from "./hal.js";

export type MetaKind = "types" | "statuses" | "priorities" | "activities";

type Named = { id: number; name: string };

const PATHS: Record<MetaKind, string> = {
  types: "/types",
  statuses: "/statuses",
  priorities: "/priorities",
  activities: "/time_entries/activities",
};

const SINGULAR: Record<MetaKind, string> = {
  types: "type",
  statuses: "status",
  priorities: "priority",
  activities: "activity",
};

const cache = new Map<string, Named[]>();

export function clearMetadataCache(): void {
  cache.clear();
}

function pathFor(kind: MetaKind, project?: string): string {
  return kind === "types" && project ? `/projects/${segment(project)}/types` : PATHS[kind];
}

export async function listMetadata(client: OpenProjectClient, kind: MetaKind, project?: string): Promise<Named[]> {
  const path = pathFor(kind, project);
  const key = `${client.config.url}${path}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { elements } = await client.collection(path, { pageSize: 200 });
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

  const entries = await listMetadata(client, kind, project);
  const needle = String(value).trim().toLowerCase();
  const match = entries.find((entry) => entry.name.toLowerCase() === needle);
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
  const { elements } = await client.collection(path, { pageSize: 200 });
  const needle = String(value).trim().toLowerCase();
  const match = elements.find(
    (user) => String(user.name ?? "").toLowerCase() === needle || String(user.email ?? "").toLowerCase() === needle,
  );
  if (!match) throw new Error(`No user matching "${value}". Use list_users to see who is available.`);
  return `/api/v3/users/${match.id}`;
}
