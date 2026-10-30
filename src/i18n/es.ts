import type { Catalog } from "./en.js";

const usage = (version: string) => `operator-mcp ${version} — un servidor MCP para OpenProject

Uso:
  operator-mcp                   Inicia el servidor MCP por stdio (lo que ejecuta tu agente)
  operator-mcp setup             Guarda las credenciales de un perfil y registra tus agentes
  operator-mcp install           Registra OPerator en los agentes que hay en este equipo
  operator-mcp doctor            Revisa el perfil, la conexión y el registro de los agentes
  operator-mcp --help, -h        Muestra este mensaje
  operator-mcp --version, -v     Muestra la versión

Opciones:
  --profile <nombre>             Perfil de credenciales (por defecto: "default")
  --lang <en|es>                 Idioma de setup, install y doctor (por defecto: el de tu sistema)
  --non-interactive              setup: sin preguntas; la clave sale de OPENPROJECT_API_KEY
  --url <url>                    setup: la dirección de tu instancia de OpenProject
  --yes                          install: registra todos los agentes encontrados sin preguntar

Entorno:
  OPENPROJECT_URL, OPENPROJECT_API_KEY, OPENPROJECT_PROFILE, OPENPROJECT_DEFAULT_PROJECT,
  OPENPROJECT_CONVENTIONS_PATH, OPENPROJECT_READ_ONLY=1, OPENPROJECT_ALLOW_DELETE=1,
  OPENPROJECT_ALLOW_INSECURE_HTTP=1, OPERATOR_LANG=es

Documentación: https://github.com/DanielEsc0911/operator-mcp#readme
`;

export const es: Catalog = {
  usage,
  unknownCommand: (command: string) => `no existe el comando "${command}". Prueba: operator-mcp --help`,
  nodeTooOld: (min: number, current: string) =>
    `operator-mcp necesita Node ${min} o posterior; este es Node ${current}. Actualiza Node y vuelve a intentarlo.`,
  and: "y",
  done: "listo",
  fail: "falló",

  setupTitle: "configuración",
  facts: { profile: "Perfil", config: "Carpeta", version: "Versión" },
  lineCheck: "Comprobando",
  lineOpen: "Línea abierta",
  lineOpenDetail: (who: string, count: number) => `${who} · ${count} ${count === 1 ? "proyecto" : "proyectos"}`,
  urlQuestion: "¿Dónde está tu OpenProject?",
  urlExample: "p. ej. openproject.acme.com",
  urlRequired: "Falta la dirección de la instancia, por ejemplo openproject.acme.com",
  keyQuestion: "Tu clave de API.",
  keyHint: (url: string) =>
    `Créala en ${url}/my/access_tokens\n  (en versiones antiguas: Mi cuenta → Token de acceso). No sale de este equipo.`,
  tryAgain: "¿Lo intentas de nuevo? [S/n] ",
  existing: "Este perfil ya está conectado:",
  keepIt: "¿Mantienes esta conexión? [S/n] ",
  saved: "Guardado",
  manual: "Manual",
  manualNew: "tus normas de la casa",
  manualKept: "se mantienen tus convenciones",
  projectQuestion: "Proyecto por defecto, para cuando no nombres ninguno",
  projectNone: "Ninguno",
  noWritableProjects: "No hay proyectos donde puedas crear paquetes de trabajo; por ahora, sin proyecto por defecto.",
  searchHint: "↑↓ mover · escribe para buscar · Enter elegir",
  searchPlaceholder: "escribe un nombre o identificador",
  searching: "buscando…",
  noMatches: "sin coincidencias",
  projectIdentifier: "Identificador del proyecto",
  nextNonInteractive: "Siguiente paso: operator-mcp install --yes",
  aborted: "Configuración cancelada. No se guardó nada.",
  needUrl: "La configuración sin preguntas necesita --url u OPENPROJECT_URL.",
  needKey: "La configuración sin preguntas lee la clave de OPENPROJECT_API_KEY; defínela y vuelve a intentarlo.",

  selectHint: "↑↓ mover · Enter elegir",
  multiHint: "↑↓ mover · Espacio marcar · Enter confirmar",
  confirm: "Confirmar",
  typedHint: "Enter acepta · escribe números para marcar o desmarcar · todos · ninguno",
  typedAll: /^(all|todos)$/,
  typedNone: /^(none|ninguno)$/,
  noneOption: "ninguno",

  agentsQuestion: "¿En qué agentes conecto OPerator?",
  noAgent: "No encontré ningún agente en este equipo.",
  byHand: "Registra OPerator a mano en el tuyo:",
  nothingRegistered: "No se registró nada.",
  patchingIn: "Conectando",
  added: "añadido",
  updated: "actualizado",
  addYourself: "Añádelo tú:",
  notInstalled: (names: string) => `No instalados aquí: ${names}.`,
  installLater: (command: string) => `Cuando instales uno, ejecuta: ${command} install`,

  checkAnyTime: "Revisa la línea cuando quieras:",
  restartThenAsk: (who: string) => `Reinicia ${who} y pregunta:`,
  yourAgent: "tu agente",
  question: "¿qué tengo pendiente?",
  patchedThrough: "Ya tienes línea.",
  almostThere: "Casi listo. Corrige primero las líneas con ✗.",
  answersFrom: "Responde con tus paquetes de trabajo reales:",
  example: [
    "#1284  Error  En curso  Arreglar el bucle de redirección del login",
    "#1301  Tarea  Nueva     Migrar la exportación de facturas",
    "#1312  Tarea  Nueva     Revisar la auditoría de accesos del T3",
  ],

  doctorTitle: (profile: string) => `doctor · perfil ${profile}`,
  lineTest: "Diagnóstico",
  lineTestDetail: "haciendo las comprobaciones",
  fromEnvironment: "URL y clave desde el entorno",
  noConfigFile: (path: string) => `No hay archivo de configuración en ${path}`,
  run: (command: string) => `Ejecuta: ${command}`,
  thenRun: (command: string) => `Después ejecuta: ${command}`,
  sharedFile: (path: string) => `Otros usuarios pueden leer ${path}`,
  incomplete: (path: string) => `${path} no tiene URL o clave de API`,
  configFile: (path: string) => `Configuración en ${path}`,
  reachable: (url: string) => `${url} responde`,
  unreachable: (url: string) => `No se puede conectar con ${url}`,
  checkNetwork: "Revisa la dirección y tu red, y vuelve a ejecutar doctor",
  keyAccepted: (who: string) => `Clave de API aceptada — ${who}`,
  agentRuns: (label: string, command: string) => `${label} ejecuta: ${command}`,
  agentMissing: (label: string, name: string) => `${label} no tiene la entrada "${name}"`,
};
