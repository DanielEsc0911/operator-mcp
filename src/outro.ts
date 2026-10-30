import type { Client } from "./clients.js";
import { selfCommand } from "./clients.js";
import { card, type Output, type Style } from "./ui.js";

const EXAMPLE = [
  "#1284  Bug   In progress  Fix login redirect loop",
  "#1301  Task  New          Migrate invoice export",
  "#1312  Task  New          Review Q3 access audit",
];

export function listed(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join("");
}

export function outro(out: Output, s: Style, agents: Client[], healthy: boolean): void {
  const who = agents.length > 0 ? listed(agents.map((client) => client.label)) : "your agent";
  out.write("\n");
  card(out, s, [
    s.bold(healthy ? "You're patched through." : "Almost there. Fix the ✗ lines above first."),
    "",
    `Restart ${who}, then ask:`,
    `  ${s.accent("what's on my plate?")}`,
    "",
    s.muted("It answers from your real work packages:"),
    ...EXAMPLE.map((line) => `  ${line}`),
    "",
    `${s.muted("Check the line any time:")}  ${selfCommand()} doctor`,
  ]);
  out.write("\n");
}
