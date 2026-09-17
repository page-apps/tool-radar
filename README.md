# Tool Radar

A public GitHub Pages reader for a private release-tracking radar of your
favourite tools. The pattern matches `page-apps/ai-kol-insights`: the public
repository ships only the reader shell, prompts and schemas; all personal data
lives in the private `page-apps/tool-radar-data` repository.

## Privacy boundary

```text
scheduled pipeline (GitHub Actions, or locally with pnpm fetch:releases)
  -> deterministic fetch from each tool's official GitHub release feed
  -> only when a release is NEW: coding agent summarises it against your preferences
  -> commits releases/summaries/state to the private tool-radar-data repository

public page-apps/tool-radar Pages shell
  -> asks the owner for a fine-grained PAT at runtime
  -> verifies read access to the fixed private repository
  -> fetches and validates tools/releases/summaries/schedule JSON in the browser
```

The public Pages artifact contains no tools list, no preferences, no release
state and no PAT.

## Data files (private repository)

| File | Purpose |
| --- | --- |
| `data/tools.json` | Your favourite tools and what you care about in each |
| `data/preferences.md` | Standing preferences for release summaries |
| `data/schedule.json` | Scheduled task configuration (timezone, run time, agent, model) |
| `data/releases.json` | Latest release per tool, fetched deterministically |
| `data/summaries.json` | Coding-agent summaries, written only on new releases |
| `data/snapshot.json` | Last-seen release tags (diff baseline) |
| `data/pending.json` | Non-empty only while new releases await summarisation |

## The deterministic/agent split

1. `scripts/fetch-releases.mjs` — no model. Reads `data/tools.json` from the
   private checkout (`TOOL_RADAR_DATA_REPO`), fetches each tool's latest
   official release from the GitHub API, extracts bullet highlights, and diffs
   against `data/snapshot.json`.
2. `scripts/has-new-releases.sh` — if nothing changed, the pipeline stops. No
   agent, no commit.
3. `scripts/run-agent.sh` — runs only on new releases. `opencode run` receives
   `data/pending.json` plus your preferences and rewrites
   `data/summaries.json`. A deterministic fallback keeps the data valid if the
   agent is unavailable.

Tools without a public GitHub repository (for example T3 Code) set
`"repository": null` and are skipped by the fetch.

## Local pipeline

```sh
pnpm install
export TOOL_RADAR_DATA_REPO=/absolute/path/to/tool-radar-data
pnpm fetch:releases   # deterministic release check
pnpm agent            # coding agent, only runs if there is something new
pnpm dev              # browse the reader shell
```

The data checkout must be an absolute path outside this project.

## Scheduled task

The scheduled workflow lives in the private data repository
(`tool-radar-data/.github/workflows/pipeline.yml`) so it can commit refreshed
data with the built-in `GITHUB_TOKEN` — no pipeline PAT is required. It runs
nightly at 06:00 Australia/Sydney (and on demand), checks out this public
project for the pipeline scripts, runs the deterministic fetch, invokes the
coding agent only when needed, and pushes to the private repository. Configure
in the private repository:

- Secret `OPENCODE_API_KEY` (coding agent; without it the deterministic
  fallback summaries are used)
- Optional variable `RADAR_MODEL` (model passed to `opencode run`)

The private data repository also mirrors the schedule in `data/schedule.json`
so the reader shows what is configured.

## Browser reader

The deployed reader accepts either an app-specific PAT or the shared Page Apps
PAT already registered in that browser (same scheme as the other page-apps
readers). The narrow credential is a fine-grained, expiring token limited to
`page-apps/tool-radar-data` with **Contents: read**. Session storage is the
default.

## GitHub setup

1. Create public `page-apps/tool-radar` and private `page-apps/tool-radar-data`.
2. Push this project to the public repository and enable **Settings → Pages →
   GitHub Actions**.
3. Push the private data project to the private repository. Do not enable
   Pages there. The repository starts with an empty state; the first pipeline
   run fills `releases.json`, `snapshot.json` and the summaries.
4. Create the browser PAT described above. The browser reader never needs
   write access, and the Pages build never needs any credential.
