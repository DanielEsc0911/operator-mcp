import type { Client } from "./clients.js";
import { selfCommand } from "./clients.js";
import { t } from "./i18n/index.js";
import { card, type Output, type Style } from "./ui.js";

export function listed(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} ${t().and} ${names.at(-1)}` : names.join("");
}

export function outro(out: Output, s: Style, agents: Client[], healthy: boolean): void {
  const text = t();
  const who = agents.length > 0 ? listed(agents.map((client) => client.label)) : text.yourAgent;
  out.write("\n");
  card(out, s, [
    s.bold(healthy ? text.patchedThrough : text.almostThere),
    "",
    text.restartThenAsk(who),
    `  ${s.accent(text.question)}`,
    "",
    s.muted(text.answersFrom),
    ...text.example.map((line) => `  ${line}`),
    "",
    `${s.muted(text.checkAnyTime)}  ${selfCommand()} doctor`,
  ]);
  out.write("\n");
}
