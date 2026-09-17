#!/usr/bin/env bash
# Summarisation step. Runs ONLY when the private data repository's
# data/pending.json is non-empty, i.e. the deterministic pipeline found new
# releases since the last snapshot.
#
# The coding agent (default: opencode) runs with the data repository as its
# working directory so every path it touches stays inside its own project —
# non-interactive runs auto-reject external-directory access. If the agent is
# unavailable, or it fails to cover every pending release, a deterministic
# fallback writes summaries so the reader always has valid data.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${TOOL_RADAR_DATA_REPO:?Set TOOL_RADAR_DATA_REPO to the private data checkout}"

if [[ -f "$project_root/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$project_root/.env"
  set +a
fi

agent="${RADAR_AGENT:-opencode}"
model="${RADAR_MODEL:-}"

if ! bash "$project_root/scripts/has-new-releases.sh"; then
  echo "tool-radar: nothing new; skipping coding agent."
  exit 0
fi

echo "tool-radar: new releases detected; summarising with ${agent}."

run_agent() {
  if ! command -v "$agent" >/dev/null 2>&1; then
    echo "tool-radar: ${agent} not found."
    return 1
  fi
  cd "$TOOL_RADAR_DATA_REPO"
  local prompt
  prompt="$(cat "$project_root/prompts/summarize-release.md")"
  if [[ -n "$model" ]]; then
    "$agent" run --model "$model" "$prompt"
  else
    "$agent" run "$prompt"
  fi
}

if run_agent && node "$project_root/scripts/verify-summaries.mjs"; then
  echo "tool-radar: coding agent summaries verified."
  exit 0
fi

echo "tool-radar: agent output missing or incomplete; using deterministic fallback."
exec node "$project_root/scripts/fallback-summaries.mjs"
