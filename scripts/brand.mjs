import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const BRAND = new URL("../docs/brand/", import.meta.url).pathname;
const OUT = join(BRAND, "assets");

const PALETTE = {
  light: { base: "#16131F", ground: "#FBF6EC", signal: "#FFB020", patch: "#0C7D73", muted: "#6E6A7C" },
  dark: { base: "#FBF6EC", ground: "#16131F", signal: "#FFB020", patch: "#2EC4B6", muted: "#9A96A8" },
};
const TAGLINE = "Your agent, patched through to OpenProject.";
const LINE_TWO = "It reads your work, updates your tasks, and follows your team’s rules.";
const JACK_SPACING = 36;
const TEXT_FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

const grid = readFileSync(join(BRAND, "seed/op.grid"), "utf8").replace(/\n$/, "").split("\n");
const wordmark = parseWordmark(readFileSync(join(BRAND, "seed/wordmark.svg"), "utf8"));

function parseWordmark(svg) {
  const [x, y, width, height] = svg.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  return { x, y, width, height, d: svg.match(/ d="([^"]+)"/)[1] };
}

function runsOf(role) {
  const steps = [];
  grid.forEach((row, y) => {
    for (const match of row.matchAll(new RegExp(`${role}+`, "g"))) {
      steps.push(`M${match.index} ${y}h${match[0].length}v1h-${match[0].length}z`);
    }
  });
  return steps.join("");
}

function mark(colors) {
  return [
    `<path fill="${colors.base}" d="${runsOf("b")}"/>`,
    `<path fill="${colors.signal}" d="${runsOf("a")}"/>`,
    `<path fill="${colors.patch}" d="${runsOf("t")}"/>`,
  ].join("");
}

function placedMark(colors, x, y, size) {
  return `<g transform="translate(${x} ${y}) scale(${size / 16})" shape-rendering="crispEdges">${mark(colors)}</g>`;
}

function placedWordmark(color, x, y, height) {
  const scale = height / wordmark.height;
  const shift = `translate(${x - wordmark.x * scale} ${y - wordmark.y * scale}) scale(${round(scale)})`;
  return `<path fill="${color}" transform="${shift}" d="${wordmark.d}"/>`;
}

function wordmarkWidth(height) {
  return Math.round((wordmark.width * height) / wordmark.height);
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function svg(width, height, body, label) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">\n` +
    `<title>${label}</title>\n${body}\n</svg>\n`
  );
}

function text(content, x, y, size, color, weight = 400) {
  return `<text x="${x}" y="${y}" font-family="${TEXT_FONT}" font-size="${size}" font-weight="${weight}" fill="${color}">${content}</text>`;
}

const THEMABLE = { base: "currentColor", signal: "var(--op-signal, #FFB020)", patch: "var(--op-patch, #2EC4B6)" };

function markSvg(colors) {
  return svg(16, 16, `<g shape-rendering="crispEdges">${mark(colors)}</g>`, "Op, the OPerator mascot");
}

function favicon() {
  const colors = PALETTE.dark;
  const body = `<rect width="16" height="16" rx="3" fill="${colors.ground}"/>` + `<g shape-rendering="crispEdges">${mark(colors)}</g>`;
  return svg(16, 16, body, "OPerator");
}

function lockup(colors) {
  const size = 64;
  const gap = 18;
  const letters = 40;
  const width = size + gap + wordmarkWidth(letters);
  const body = placedMark(colors, 0, 0, size) + placedWordmark(colors.base, size + gap, (size - letters) / 2 + 2, letters);
  return svg(width, size, body, "OPerator");
}

function switchboard(colors, x, y, columns, lit) {
  const jacks = [];
  for (let column = 0; column < columns; column++) {
    const cx = x + column * JACK_SPACING;
    const isLit = lit.includes(column);
    jacks.push(`<circle cx="${cx}" cy="${y}" r="7" fill="${isLit ? colors.signal : "none"}" stroke="${isLit ? colors.signal : colors.muted}" stroke-width="2"/>`);
  }
  return jacks.join("");
}

function patchCable(colors, fromX, toX, y, sag) {
  return `<path d="M${fromX} ${y}C${fromX} ${y + sag} ${toX} ${y + sag} ${toX} ${y}" fill="none" stroke="${colors.patch}" stroke-width="4" stroke-linecap="round"/>`;
}

function inkedRows() {
  const inked = grid.map((row, index) => (row.trim() ? index : -1)).filter((index) => index >= 0);
  return { first: inked[0], last: inked.at(-1) };
}

function banner(colors, width, height, markSize, letters, [headline, subline]) {
  const cell = markSize / 16;
  const { first, last } = inkedRows();
  const markY = Math.round(height / 2 - ((first + last + 1) / 2) * cell);
  const left = 96;
  const textX = left + markSize + 64;
  const headlineY = letters + 30 + headline.size;
  const sublineY = headlineY + Math.round(subline.size * 1.7);
  const lampsY = sublineY + 44;
  const top = Math.round((height - lampsY - 8) / 2);
  const body = [
    `<rect width="${width}" height="${height}" fill="${colors.ground}"/>`,
    placedMark(colors, left, markY, markSize),
    placedWordmark(colors.base, textX, top, letters),
    text(headline.content, textX, top + headlineY, headline.size, headline.color, headline.weight),
    text(subline.content, textX, top + sublineY, subline.size, subline.color, subline.weight),
    patchCable(colors, textX + 7 + JACK_SPACING, textX + 7 + 4 * JACK_SPACING, top + lampsY, 34),
    switchboard(colors, textX + 7, top + lampsY, 8, [1, 4]),
  ].join("\n");
  return svg(width, height, body, `OPerator — ${TAGLINE}`);
}

function hero(colors) {
  return banner(colors, 1280, 400, 256, 96, [
    { content: TAGLINE, size: 34, color: colors.base, weight: 500 },
    { content: LINE_TWO, size: 22, color: colors.muted },
  ]);
}

function socialCard() {
  const colors = PALETTE.dark;
  return banner(colors, 1200, 630, 256, 112, [
    { content: TAGLINE, size: 34, color: colors.base, weight: 500 },
    { content: "MCP server · npx operator-mcp", size: 24, color: colors.signal },
  ]);
}

const outputs = {
  "mark/op.svg": markSvg(THEMABLE),
  "mark/op-light.svg": markSvg(PALETTE.light),
  "mark/op-dark.svg": markSvg(PALETTE.dark),
  "lockup/horizontal-light.svg": lockup(PALETTE.light),
  "lockup/horizontal-dark.svg": lockup(PALETTE.dark),
  "hero/readme-hero-light.svg": hero(PALETTE.light),
  "hero/readme-hero-dark.svg": hero(PALETTE.dark),
  "social/card.svg": socialCard(),
  "favicon/favicon.svg": favicon(),
  "terminal/op.cells": grid.join("\n") + "\n",
};

for (const [path, content] of Object.entries(outputs)) {
  const target = join(OUT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
process.stdout.write(`wrote ${Object.keys(outputs).length} brand assets to ${OUT}\n`);
