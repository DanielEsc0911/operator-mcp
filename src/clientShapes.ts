import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { commandLine, editJson, readJson } from "./clientFiles.js";

export type Runner = (command: string, args: string[]) => string;

export type Target = {
  home: string;
  name: string;
  command: string;
  args: string[];
  run: Runner;
};

export type Client = {
  id: string;
  label: string;
  configPath: (home: string) => string;
  detect: (home: string) => boolean;
  register: (target: Target) => void;
  entry: (home: string, name: string, run?: Runner) => string[] | null;
  manual: (target: Target) => string;
};

export function mcpServersClient(id: string, label: string, path: (home: string) => string | null, shown: string): Client {
  const file = (home: string) => path(home) ?? "";
  return {
    id,
    label,
    configPath: file,
    detect: (home) => path(home) !== null && existsSync(dirname(file(home))),
    register: ({ home, name, command, args }) =>
      editJson(file(home), (settings) => {
        const servers = settings.mcpServers ?? {};
        settings.mcpServers = { ...servers, [name]: { ...servers[name], command, args } };
      }),
    entry: (home, name) => commandLine(readJson(file(home)).mcpServers?.[name]),
    manual: ({ name, command, args }) => `// ${shown}\n${JSON.stringify({ mcpServers: { [name]: { command, args } } }, null, 2)}`,
  };
}

export function opencodeClient(id: string, label: string, dir: string, base: string, schema?: string): Client {
  const file = (home: string) => {
    const jsonc = join(home, dir, `${base}.jsonc`);
    return existsSync(jsonc) ? jsonc : join(home, dir, `${base}.json`);
  };
  const spawn = (command: string, args: string[]) => ({ type: "local", command: [command, ...args], enabled: true });
  return {
    id,
    label,
    configPath: file,
    detect: (home) => existsSync(join(home, dir)),
    register: ({ home, name, command, args }) =>
      editJson(file(home), (config) => {
        if (schema) config.$schema ??= schema;
        const mcp = config.mcp ?? {};
        config.mcp = { ...mcp, [name]: { enabled: true, ...mcp[name], type: "local", command: [command, ...args] } };
      }),
    entry: (home, name) => commandLine(readJson(file(home)).mcp?.[name]),
    manual: ({ name, command, args }) => `// ~/${dir}/${base}.json\n${JSON.stringify({ mcp: { [name]: spawn(command, args) } }, null, 2)}`,
  };
}
