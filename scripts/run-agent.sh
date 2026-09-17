#!/usr/bin/env bash
# Summarisation step. Runs ONLY when the private data repository's
# data/pending.json is non-empty, i.e. the deterministic pipeline found new
# releases since the last snapshot.
#
# The coding agent (default: opencode) receives the pending brief plus the
# user's preferences and writes per-tool summaries into data/summaries.json,
# which the public reader loads. If the agent is unavailable we fall back to
# the deterministic highlight extraction so the site always has data.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

: "${TOOL_RADAR_DATA_REPO:?Set TOOL_RADAR_DATA_REPO to the private data checkout}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

agent="${RADAR_AGENT:-opencode}"
model="${RADAR_MODEL:-}"

if ! bash scripts/has-new-releases.sh; then
  echo "tool-radar: nothing new; skipping coding agent."
  exit 0
fi

echo "tool-radar: new releases detected; summarising with ${agent}."
if ! command -v "$agent" >/dev/null 2>&1; then
  echo "tool-radar: ${agent} not found; using deterministic fallback."
  exec node scripts/fallback-summaries.mjs
fi

if [[ -n "$model" ]]; then
  "$agent" run --model "$model" "$(cat prompts/summarize-release.md)" || exec node scripts/fallback-summaries.mjs
else
  "$agent" run "$(cat prompts/summarize-release.md)" || exec node scripts/fallback-summaries.mjs
fi
