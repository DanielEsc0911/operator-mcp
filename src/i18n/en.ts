const usage = (version: string) => `operator-mcp ${version} — an MCP server for OpenProject

Usage:
  operator-mcp                   Start the MCP server on stdio (what your agent runs)
  operator-mcp setup             Store credentials for a profile and register your agents
  operator-mcp install           Register OPerator with the agents found on this machine
  operator-mcp doctor            Check the profile, the connection and agent registrations
  operator-mcp --help, -h        Show this message
  operator-mcp --version, -v     Print the version

Options:
  --profile <name>               Credential profile to use (default: "default")
  --lang <en|es>                 Language for setup, install and doctor (default: from your locale)
  --non-interactive              setup: no prompts; key from OPENPROJECT_API_KEY
  --url <url>                    setup: the OpenProject instance URL
  --yes                          install: register every detected agent without asking

Environment:
  OPENPROJECT_URL, OPENPROJECT_API_KEY, OPENPROJECT_PROFILE, OPENPROJECT_DEFAULT_PROJECT,
  OPENPROJECT_CONVENTIONS_PATH, OPENPROJECT_READ_ONLY=1, OPENPROJECT_ALLOW_DELETE=1,
  OPENPROJECT_ALLOW_INSECURE_HTTP=1, OPERATOR_LANG=es

Docs: https://github.com/DanielEsc0911/operator-mcp#readme
`;

export const en = {
  usage,
  unknownCommand: (command: string) => `unknown command "${command}". Try: operator-mcp --help`,
  nodeTooOld: (min: number, current: string) => `operator-mcp needs Node ${min} or newer; this is Node ${current}. Upgrade Node and retry.`,
  and: "and",
  done: "done",
  fail: "fail",

  setupTitle: "setup",
  facts: { profile: "Profile", config: "Config", version: "Version" },
  lineCheck: "Line check",
  lineOpen: "Line's open",
  lineOpenDetail: (who: string, count: number) => `${who} · ${count} ${count === 1 ? "project" : "projects"}`,
  urlQuestion: "Where does your OpenProject live?",
  urlExample: "e.g. openproject.acme.com",
  urlRequired: "An instance address is required, like openproject.acme.com",
  keyQuestion: "Your API key.",
  keyHint: (url: string) => `Make one at ${url}/my/access_tokens\n  (older instances: My account → Access token). It stays on this machine.`,
  tryAgain: "Try again? [Y/n] ",
  existing: "This profile is already connected:",
  keepIt: "Keep this connection? [Y/n] ",
  saved: "Saved",
  manual: "Manual",
  manualNew: "your house rules",
  manualKept: "existing conventions kept",
  projectQuestion: "Default project, for when you don't name one",
  projectNone: "None",
  projectOther: "Other — type an identifier",
  projectIdentifier: "Project identifier",
  nextNonInteractive: "Next: operator-mcp install --yes",
  aborted: "Setup cancelled. Nothing was saved.",
  needUrl: "Non-interactive setup needs --url or OPENPROJECT_URL.",
  needKey: "Non-interactive setup reads the key from OPENPROJECT_API_KEY; set it and retry.",

  selectHint: "↑↓ move · Enter choose",
  multiHint: "↑↓ move · Space select · Enter confirm",
  confirm: "Confirm",
  typedHint: "Enter accepts · type numbers to switch one off or on · all · none",
  typedAll: /^(all|todos)$/,
  typedNone: /^(none|ninguno)$/,
  noneOption: "none",

  agentsQuestion: "Which agents should OPerator patch into?",
  noAgent: "No agent found on this machine.",
  byHand: "Register OPerator by hand in yours:",
  nothingRegistered: "Nothing registered.",
  patchingIn: "Patching in",
  added: "added",
  updated: "updated",
  addYourself: "Add it yourself:",
  notInstalled: (names: string) => `Not installed here: ${names}.`,
  installLater: (command: string) => `Install one later, then run: ${command} install`,

  checkAnyTime: "Check the line any time:",
  restartThenAsk: (who: string) => `Restart ${who}, then ask:`,
  yourAgent: "your agent",
  question: "what's on my plate?",
  patchedThrough: "You're patched through.",
  almostThere: "Almost there. Fix the ✗ lines above first.",
  answersFrom: "It answers from your real work packages:",
  example: [
    "#1284  Bug   In progress  Fix login redirect loop",
    "#1301  Task  New          Migrate invoice export",
    "#1312  Task  New          Review Q3 access audit",
  ],

  doctorTitle: (profile: string) => `doctor · profile ${profile}`,
  lineTest: "Line test",
  lineTestDetail: "running the doctor's checks",
  fromEnvironment: "URL and key from the environment",
  noConfigFile: (path: string) => `No config file at ${path}`,
  run: (command: string) => `Run: ${command}`,
  thenRun: (command: string) => `Then run: ${command}`,
  sharedFile: (path: string) => `Config file ${path} is readable by other users`,
  incomplete: (path: string) => `${path} has no URL or API key`,
  configFile: (path: string) => `Config file ${path}`,
  reachable: (url: string) => `${url} is reachable`,
  unreachable: (url: string) => `Cannot reach ${url}`,
  checkNetwork: "Check the URL and your network, then run doctor again",
  keyAccepted: (who: string) => `API key accepted — ${who}`,
  agentRuns: (label: string, command: string) => `${label} runs: ${command}`,
  agentMissing: (label: string, name: string) => `${label} has no "${name}" entry`,
};

export type Catalog = typeof en;
