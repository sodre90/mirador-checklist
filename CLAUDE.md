# Checklist for Mirador

A Mirador canvas plugin (plugin API 3). See README.md for what it does and how to run it.

- Bun and TypeScript everywhere, strict; imports carry their `.ts`/`.tsx` extensions. React 19 for the view.
- `bun run typecheck`, `bun run test` and `scripts/e2e.sh` before every commit. Tests run Mirador's code from the checkout
  in `MIRADOR_DIR`; the e2e uses Mirador's Playwright, which runs on Node: no Bun APIs in `e2e/`.
- `checklist.ts` is pure; `host.ts` wires it to Mirador's canvas; `view/` draws the item in Mirador's sandboxed canvas frame.
- Names over comments: keep comments for a genuine "why" that a name can't carry.
- Every change comes with tests: logic gets unit tests, and what the user sees gets e2e coverage.
- Words the user or the agent reads: plain words and sentence case.
- Commits: authored by the owner only, `perdos <erdos.peter.bme@gmail.com>`, with no AI attribution or trailers. One
  plain sentence saying what the user gets.
- Releases: bump `version` in `plugin.json` and tag the commit `v<version>`; Mirador refuses a tag that doesn't match.
