export type HalLink = { href?: string | null; title?: string | null };

export type HalResource = {
  _links?: Record<string, HalLink | HalLink[] | undefined>;
  [key: string]: unknown;
};

function link(hal: HalResource, rel: string): HalLink | undefined {
  const value = hal._links?.[rel];
  return Array.isArray(value) ? value[0] : value;
}

export function linkTitle(hal: HalResource, rel: string): string | undefined {
  return link(hal, rel)?.title ?? undefined;
}

export function linkId(hal: HalResource, rel: string): number | undefined {
  const match = /\/(\d+)$/.exec(link(hal, rel)?.href ?? "");
  return match ? Number(match[1]) : undefined;
}

function raw(value: unknown): string | undefined {
  const text = (value as { raw?: string } | undefined)?.raw;
  return text ? text : undefined;
}

export function flattenWorkPackage(
  wp: HalResource,
  baseUrl: string,
  options: { includeDescription?: boolean } = {},
): Record<string, unknown> {
  return {
    id: wp.id,
    subject: wp.subject,
    type: linkTitle(wp, "type"),
    status: linkTitle(wp, "status"),
    priority: linkTitle(wp, "priority"),
    project: linkTitle(wp, "project"),
    assignee: linkTitle(wp, "assignee"),
    author: linkTitle(wp, "author"),
    parent: linkId(wp, "parent"),
    startDate: wp.startDate ?? undefined,
    dueDate: wp.dueDate ?? undefined,
    percentageDone: wp.percentageDone ?? undefined,
    lockVersion: wp.lockVersion,
    createdAt: wp.createdAt,
    updatedAt: wp.updatedAt,
    url: `${baseUrl}/work_packages/${wp.id}`,
    ...(options.includeDescription ? { description: raw(wp.description) ?? "" } : {}),
  };
}

export function flattenProject(project: HalResource, baseUrl: string): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    identifier: project.identifier,
    active: project.active,
    description: raw(project.description),
    url: `${baseUrl}/projects/${project.identifier}`,
  };
}

export function flattenNotification(notification: HalResource, baseUrl: string): Record<string, unknown> {
  const href = link(notification, "resource")?.href ?? "";
  const isWorkPackage = href.includes("/work_packages/");
  return {
    id: notification.id,
    reason: notification.reason,
    read: notification.readIAN,
    project: linkTitle(notification, "project"),
    actor: linkTitle(notification, "actor"),
    workPackageId: isWorkPackage ? linkId(notification, "resource") : undefined,
    workPackageSubject: isWorkPackage ? linkTitle(notification, "resource") : undefined,
    resource: isWorkPackage ? undefined : linkTitle(notification, "resource"),
    createdAt: notification.createdAt,
    url: isWorkPackage
      ? `${baseUrl}/work_packages/${linkId(notification, "resource")}`
      : `${baseUrl}/notifications`,
  };
}

export function flattenActivity(activity: HalResource): Record<string, unknown> {
  return {
    id: activity.id,
    type: activity._type,
    user: linkTitle(activity, "user"),
    comment: raw(activity.comment),
    details: (activity.details as { raw?: string }[] | undefined)?.map((detail) => detail.raw).filter(Boolean),
    createdAt: activity.createdAt,
  };
}

export function flattenNamed(resource: HalResource): { id: number; name: string } {
  return { id: resource.id as number, name: resource.name as string };
}
