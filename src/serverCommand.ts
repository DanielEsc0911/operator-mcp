import { basename, join } from "node:path";
import { version } from "./server.js";

export type ServerCommand = { command: string; args: string[] };

export type Runtime = { versions: Partial<Record<string, string>>; execPath: string; platform?: NodeJS.Platform };

export function serverName(profile: string): string {
  return profile === "default" ? "openproject" : `openproject-${profile}`;
}

// Under `bunx` execPath is bun itself, which would be registered with no script.
// Only the compiled binary is its own server.
function isCompiledBinary({ versions, execPath }: Runtime): boolean {
  return Boolean(versions.bun) && !/^bunx?(\.exe)?$/i.test(basename(execPath));
}

export function serverCommand(profile: string, runtime: Runtime = process, pinned = version): ServerCommand {
  const flag = profile === "default" ? [] : ["--profile", profile];
  if (isCompiledBinary(runtime)) return { command: runtime.execPath, args: flag };
  const npx = ["npx", "-y", `operator-mcp@${pinned}`, ...flag];
  return runtime.platform === "win32" ? { command: "cmd", args: ["/c", ...npx] } : { command: "npx", args: npx.slice(1) };
}

export function selfCommand(runtime: Runtime = process): string {
  return isCompiledBinary(runtime) ? "operator-mcp" : "npx operator-mcp";
}

export function desktopConfigPath(
  home: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return null;
}
