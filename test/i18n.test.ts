import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { detectLang, t, useLang } from "../src/i18n/index.js";
import { en } from "../src/i18n/en.js";
import { es } from "../src/i18n/es.js";

describe("detectLang", () => {
  it("prefers --lang, then OPERATOR_LANG, LC_ALL, LC_MESSAGES, LANG, then the system locale", () => {
    expect(detectLang(["--lang", "es"], { OPERATOR_LANG: "en" })).toBe("es");
    expect(detectLang([], { OPERATOR_LANG: "es", LANG: "en_US.UTF-8" })).toBe("es");
    expect(detectLang([], { LC_ALL: "en_GB.UTF-8", LANG: "es_ES.UTF-8" })).toBe("en");
    expect(detectLang([], { LC_MESSAGES: "es_MX.UTF-8", LANG: "en_US.UTF-8" })).toBe("es");
    expect(detectLang([], { LANG: "es_AR.UTF-8" })).toBe("es");
    expect(detectLang([], {}, "es-CL")).toBe("es");
    expect(detectLang([], {}, "de-DE")).toBe("en");
  });

  it("falls back to English for anything that is not Spanish", () => {
    expect(detectLang(["--lang", "fr"], {})).toBe("en");
    expect(detectLang([], { LANG: "C" }, "es-ES")).toBe("en");
  });
});

describe("catalogs", () => {
  it("translate every key", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it("keep the outro example columns aligned", () => {
    for (const catalog of [en, es]) {
      const titleColumns = catalog.example.map((line) => line.lastIndexOf(line.split(/ {2,}/)[3]));
      expect(new Set(titleColumns).size).toBe(1);
    }
  });
});

describe("runCli --lang", () => {
  it("prints the Spanish usage", async () => {
    let out = "";
    const streams = { stdin: process.stdin, stdout: { write: (chunk: string) => ((out += chunk), true) }, stderr: process.stderr } as any;
    expect(await runCli(["--help", "--lang", "es"], streams)).toBe(0);
    useLang("en");
    expect(out).toContain("Uso:");
    expect(out).toContain("--lang <en|es>");
    expect(t()).toBe(en);
  });
});
