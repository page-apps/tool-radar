#!/usr/bin/env bash
# Exit 0 when the data repo's pending.json is non-empty (new releases exist).
set -euo pipefail
: "${TOOL_RADAR_DATA_REPO:?Set TOOL_RADAR_DATA_REPO to the private data checkout}"
pending="$TOOL_RADAR_DATA_REPO/data/pending.json"
if [[ -s "$pending" ]]; then
  exit 0
fi
exit 1
