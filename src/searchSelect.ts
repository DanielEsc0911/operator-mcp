import { t } from "./i18n/index.js";
import { hint, listen, move, summary, type Input, type Key, type Option } from "./select.js";
import { displayWidth, fit, pad, type Output, type Style } from "./ui.js";

export type Page = { total: number; rows: Option[] };
export type Search = (query: string) => Promise<Page>;

type State = Page & { query: string; searching: boolean; cursor: number };

const DEBOUNCE_MS = 150;

const isTyping = (text: string | undefined, key: Key) => !!text && !key.ctrl && !key.meta && /^[^\x00-\x1f\x7f]+$/u.test(text);

function queryLine({ query, rows, searching }: State, s: Style): string {
  const caret = s.accent("▏");
  const typed = query ? `${query}${caret}` : `${caret}${s.muted(t().searchPlaceholder)}`;
  const status = searching ? t().searching : rows.length === 0 ? t().noMatches : "";
  return `  ${s.accent("/")} ${typed}${status ? `  ${s.muted(status)}` : ""}`;
}

function frame(question: string, none: string, state: State, out: Output, s: Style): string[] {
  const rows = [{ label: none }, ...state.rows];
  const width = Math.max(...rows.map(({ label }) => displayWidth(label)));
  const lines = [`  ${s.bold(question)}`, queryLine(state, s)];
  rows.forEach(({ label, hint: note }, index) => {
    const pointer = index === state.cursor ? s.accent("›") : " ";
    lines.push(`  ${pointer} ${note ? `${pad(label, width)}  ${s.muted(note)}` : label}`);
  });
  const more = state.total > state.rows.length ? [`${state.rows.length}/${state.total}`] : [];
  lines.push(`    ${s.muted(hint([...more, ...t().searchHint.split(" · ")], out))}`);
  return lines.map((line) => fit(line, out));
}

function edit(query: string, key: Key, text: string): string {
  if (key.name === "escape") return "";
  if (key.name === "backspace") return query.slice(0, -1);
  return isTyping(text, key) ? query + text : query;
}

export async function searchSelect(
  input: Input,
  out: Output,
  s: Style,
  question: string,
  none: string,
  search: Search,
  first: Page,
): Promise<Option | undefined> {
  const state: State = { ...first, query: "", searching: false, cursor: 0 };
  let timer: NodeJS.Timeout | undefined;

  const settle = (query: string, page: Page, repaint: () => void) => {
    if (query !== state.query) return;
    Object.assign(state, page, { searching: false });
    repaint();
  };
  const refresh = (repaint: () => void) => {
    clearTimeout(timer);
    state.cursor = 0;
    state.searching = state.query !== "";
    if (!state.searching) return Object.assign(state, first);
    const query = state.query;
    timer = setTimeout(() => {
      search(query).then(
        (page) => settle(query, page, repaint),
        () => settle(query, { total: 0, rows: [] }, repaint),
      );
    }, DEBOUNCE_MS);
  };

  const chosen = await listen(input, out, () => frame(question, none, state, out, s), (key, text, repaint) => {
    if (key.name === "return" || key.name === "enter") return { row: state.rows[state.cursor - 1] };
    if (key.name === "up" || key.name === "down") return void (state.cursor = move(state.cursor, key, state.rows.length + 1));
    const query = edit(state.query, key, text);
    if (query === state.query) return;
    state.query = query;
    refresh(repaint);
  }).finally(() => clearTimeout(timer));
  summary(out, s, question, chosen.row?.label ?? none);
  return chosen.row;
}
