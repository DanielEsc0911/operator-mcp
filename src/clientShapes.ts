import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { commandLine, editJson, readJson } from "./clientFiles.js";

export type Runner = (command: string, args: string[]) => void;

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
  entry: (home: string, name: string) => string[] | null;
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
        settings.mcpServers = { ...settings.mcpServers, [name]: { command, args } };
      }),
    entry: (home, name) => commandLine(readJson(file(home)).mcpServers?.[name]),
    manual: ({ name, command, args }) => `// ${shown}\n${JSON.stringify({ mcpServers: { [name]: { command, args } } }, null, 2)}`,
  };
}

export function opencodeClient(id: string, label: string, relative: string, schema?: string): Client {
  const file = (home: string) => join(home, relative);
  const spawn = (command: string, args: string[]) => ({ type: "local", command: [command, ...args], enabled: true });
  return {
    id,
    label,
    configPath: file,
    detect: (home) => existsSync(dirname(file(home))),
    register: ({ home, name, command, args }) =>
      editJson(file(home), (config) => {
        if (schema) config.$schema ??= schema;
        config.mcp = { ...config.mcp, [name]: spawn(command, args) };
      }),
    entry: (home, name) => commandLine(readJson(file(home)).mcp?.[name]),
    manual: ({ name, command, args }) => `// ~/${relative}\n${JSON.stringify({ mcp: { [name]: spawn(command, args) } }, null, 2)}`,
  };
}
