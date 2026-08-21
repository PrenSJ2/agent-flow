# Attribution

**tare console** is a fork of [Agent Flow](https://github.com/patoles/agent-flow)
by Simon Patole, used under the Apache License 2.0.

It is renamed because Agent Flow's `TRADEMARK.md` withholds the name and logos
from redistribution — Apache-2.0 §6 grants no trademark rights. That policy is
respected here: this fork does not use the Agent Flow name or marks to identify
itself.

## What this fork changes

- **Skills and Memory panels**, reading the local `tare` console API — the
  capability graph, and what usage has taught it about itself. Neither is
  derivable from an agent event stream, which is why they live here rather than
  being contributed upstream.
- **Session tab colours** matching the user's iTerm2 tabs, ported from
  `tabcolor.zsh` — the same FNV-1a hash over the git repo basename into the same
  palette, so a session and its terminal tab read as one workspace.
- **Its own discovery directory** (`~/.claude/tare-console`) and hook marker, so
  it coexists with an upstream install instead of fighting it over the same
  files and hooks.

Upstream is tracked as the `upstream` git remote. Merging their improvements is
the intended workflow, not divergence:

    git fetch upstream && git merge upstream/main

The original LICENSE, CLA.md and TRADEMARK.md are retained unmodified.
