# Checklist for Mirador

A [Mirador](https://github.com/sodre90/mirador) canvas plugin: the steps of the agent's work, in a tab beside the canvas, which the agent and the user tick as they go.

- `checklist` publishes the steps, in sections; each item is the agent's, the user's or both of theirs to do.
- `update_checklist` ticks, rewords, hands over, adds or takes out items by id.
- The user's ticks reach the agent with their next message. A checklist the user dismissed stays dismissed until the agent publishes a new one.

Mirador installs it by itself at its first start, and it can be removed in Settings → Plugins like any plugin. To install it by hand, add `https://github.com/sodre90/mirador-checklist.git` there.

## Developing

```bash
bun install
bun run build       # the view, into dist/view.js
bun run typecheck
bun run test        # unit tests, with Mirador's host code from the checkout in MIRADOR_DIR
scripts/e2e.sh      # e2e in a Mirador test host from MIRADOR_DIR, with Mirador's Playwright
```

`MIRADOR_DIR` is Mirador's checkout, by default `../visualized-claude-sessions`. `mirador/api.ts` is a copy of the plugin API types Mirador doesn't publish yet.

Releases: bump `version` in `plugin.json`, commit, and tag the commit `v<version>`. Mirador installs the newest release and offers newer ones as updates.
