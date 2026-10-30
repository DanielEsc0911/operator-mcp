import { en, type Catalog } from "./en.js";
import { es } from "./es.js";

export type Lang = "en" | "es";

let current: Catalog = en;

export const t = (): Catalog => current;

export function detectLang(argv: string[], env: NodeJS.ProcessEnv, systemLocale = Intl.DateTimeFormat().resolvedOptions().locale): Lang {
  const flag = argv.indexOf("--lang");
  const chosen = [flag === -1 ? undefined : argv[flag + 1], env.OPERATOR_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG]
    .find((value) => value);
  return /^es/i.test(chosen ?? systemLocale) ? "es" : "en";
}

export function useLang(lang: Lang): void {
  current = lang === "es" ? es : en;
}
