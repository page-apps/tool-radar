# Release summarisation brief

You are the summarisation step of the Tool Radar pipeline. The private data
repository checkout is at `$TOOL_RADAR_DATA_REPO`. Read these inputs:

- `$TOOL_RADAR_DATA_REPO/data/pending.json` — the tools with new releases, including the previous tag and the raw release notes.
- `$TOOL_RADAR_DATA_REPO/data/tools.json` — the user's tools and why they use them.
- `$TOOL_RADAR_DATA_REPO/data/preferences.md` — the user's standing preferences.

## Task

For **each tool** in `pending.json`, write a summary of what changed in the new release, judged against the user's declared interests and why they use the tool. Lead with the change that matters most to *this* user. Ignore marketing language and long lists of minor dependency bumps unless one is a security fix.

## Output

Overwrite `$TOOL_RADAR_DATA_REPO/data/summaries.json` exactly in this shape:

```json
{
  "generatedAt": "<ISO timestamp>",
  "source": "coding-agent",
  "tools": [
    { "id": "<tool id>", "tag": "<release tag>", "summary": "2–4 sentences, oriented to the user's interests." }
  ]
}
```

Rules:

- One entry per tool in `pending.json`; use the exact `id` values.
- Keep each summary under 80 words. Be concrete: name features, behaviours and fixes.
- If a release body is too thin to summarise, say briefly what the tag bump represents.
- Use Australian English. No emojis.
- Write only `data/summaries.json` inside the data repository; do not modify any other file.
