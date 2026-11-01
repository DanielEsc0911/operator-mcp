# Hardening — Progress

**Spec:** `docs/superpowers/specs/2026-11-01-hardening-design.md`
**Plan:** `docs/superpowers/plans/2026-11-01-hardening.md`
**Branch:** `feat/hardening` (baseline `25dc5c2`)

Each chunk runs as one fresh agent. The agent ticks its rows here and appends a short hand-off
note for the next agent: what was done, what deviated from the plan and why, and anything left
open, with the commit range.

| Step | Status | Notes |
|---|---|---|
| Field test with agy (93 s → 24 s) | done | `briefing`, lean lists, `<>d` fix — `25dc5c2` |
| Review triage (44 points + 6) | done | Rulings in spec §3, deferrals in §4 |
| Spec + plan | done | |
| Chunk 1 — Safety and the manual (1a–1g) | todo | |
| Chunk 2 — Agent tools (2a–2i) | todo | |
| Chunk 3 — Install, setup, CLI, doctor (3a–3f) | todo | |
| Chunk 4 — Release, testing infra, final gate (4a–4f) | todo | |

## Hand-off notes

### Triage (orchestrator, 2026-11-01)

- Live instance facts: only "Traspasado" has `isClosed: true`; "Culminado" (100 %) and
  "Rechazado" count as open. `updatedAt` rejects `>d`; `<>d` with `["YYYY-MM-DD", ""]` works.
- agy reads tool schemas from its cache in `~/.gemini/antigravity-cli/mcp/openproject/` and its
  server entry lives in `~/.gemini/config/mcp_config.json` (points at `~/.local/bin/operator-mcp`,
  the released binary). Do not edit the user's agent configs.
- Never touch the user's real OpenProject instance from a chunk. Live checks go to Docker.
