const PROJECT_NAMES = [
  "Plataforma de Gestión Documental y Archivo Institucional del Ministerio",
  "Portal Ciudadano de Servicios en Línea y Atención al Contribuyente",
  "Modernización de la Infraestructura de Red y Seguridad Perimetral",
];
const STATUSES = ["Nuevo", "En progreso", "En revisión", "Pendiente", "Culminado"];
const SUBJECT =
  "Revisar y actualizar el módulo de reportes mensuales para el área de administración y finanzas";

function wp(id: number, percentageDone: number, status = STATUSES[id % 4]) {
  const project = id % PROJECT_NAMES.length;
  return {
    _type: "WorkPackage",
    id,
    lockVersion: 3,
    subject: `${SUBJECT} ${id}`.slice(0, 85),
    percentageDone,
    startDate: "2026-10-01",
    dueDate: `2026-11-${String(1 + (id % 28)).padStart(2, "0")}`,
    createdAt: "2026-09-20T08:00:00Z",
    updatedAt: "2026-10-31T09:14:02Z",
    _links: {
      self: { href: `/api/v3/work_packages/${id}` },
      type: { href: "/api/v3/types/1", title: "Tarea" },
      status: { href: `/api/v3/statuses/${id % 4}`, title: status },
      priority: { href: "/api/v3/priorities/2", title: "Normal" },
      project: { href: `/api/v3/projects/${project + 1}`, title: PROJECT_NAMES[project] },
      assignee: { href: "/api/v3/users/12", title: "Daniel Escalona" },
    },
  };
}

const page = (elements: unknown[], total = elements.length) => ({ total, count: elements.length, _embedded: { elements } });

export const ASSIGNED = Array.from({ length: 46 }, (_, i) => wp(1000 + i, i < 39 ? 100 : 20 + i));
export const ASSIGNED_PAGE = page(ASSIGNED);

export const NOTIFICATIONS = Array.from({ length: 50 }, (_, i) => ({
  _type: "Notification",
  id: 500 - i,
  reason: ["mentioned", "commented", "assigned", "watched"][i % 4],
  readIAN: false,
  createdAt: `2026-10-31T09:${String(i % 60).padStart(2, "0")}:00Z`,
  _links: {
    project: { href: "/api/v3/projects/1", title: PROJECT_NAMES[0] },
    actor: { href: "/api/v3/users/5", title: "Ana María Rodríguez" },
    resource: { href: `/api/v3/work_packages/${1000 + (i % 30)}`, title: `${SUBJECT} ${1000 + (i % 30)}`.slice(0, 85) },
  },
}));
export const NOTIFICATIONS_PAGE = page(NOTIFICATIONS);

export const TIME_ENTRIES = Array.from({ length: 25 }, (_, i) => ({
  hours: "PT1H30M",
  spentOn: `2026-10-${String(30 - (i % 20)).padStart(2, "0")}`,
  comment: { raw: "Revisión del módulo y reunión de coordinación con el equipo" },
  _links: {
    workPackage: { href: `/api/v3/work_packages/${1000 + i}`, title: `${SUBJECT} ${1000 + i}`.slice(0, 85) },
  },
}));
export const TIME_ENTRIES_PAGE = page(TIME_ENTRIES);

export const ACTIVITIES = Array.from({ length: 60 }, (_, i) => ({
  _type: "Activity::Comment",
  id: i + 1,
  comment: { raw: "Se revisó el avance con el equipo y se acordó continuar con la siguiente fase. ".repeat(12) },
  details: [],
  createdAt: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T10:00:00Z`,
  _links: { user: { href: "/api/v3/users/5", title: "Ana María Rodríguez" } },
}));
export const ACTIVITIES_PAGE = page(ACTIVITIES);

export const SEARCH_PAGE = page(ASSIGNED.slice(0, 20), 46);
export const ME = { id: 12, name: "Daniel Escalona", email: "daniel@example.com" };
