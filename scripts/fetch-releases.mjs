#!/usr/bin/env node
/**
 * Deterministic release-fetch pipeline.
 *
 * Reads data/tools.json from the private data repository checkout
 * (TOOL_RADAR_DATA_REPO, an absolute path outside this project), fetches the
 * latest published release for every tool from the official GitHub release
 * feed, and writes:
 *
 *   data/releases.json  – full latest-release state (input to the site reader)
 *   data/pending.json   – only when there are new releases; the compact brief
 *                         handed to the coding agent for summarisation
 *
 * No language model is involved in this step. The coding agent only runs when
 * pending.json is non-empty (see scripts/run-agent.sh and the GitHub workflow).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);

function dataRepo() {
  const value = process.env.TOOL_RADAR_DATA_REPO;
  if (!value) throw new Error("Set TOOL_RADAR_DATA_REPO to the absolute path of the tool-radar-data checkout.");
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved)) throw new Error("TOOL_RADAR_DATA_REPO must be an absolute path.");
  if (!resolved.startsWith(projectRoot + path.sep)) return resolved;
  throw new Error("The private data checkout must live outside the public tool-radar project.");
}

const dataDir = () => path.join(dataRepo(), "data");
const pendingFile = () => path.join(dataDir(), "pending.json");
const snapshotFile = () => path.join(dataDir(), "snapshot.json");
const releasesFile = () => path.join(dataDir(), "releases.json");

const now = () => new Date().toISOString();

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function ghHeaders() {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "tool-radar-pipeline",
    "x-github-api-version": "2022-11-28"
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

/** Fetch the newest non-prerelease, non-draft release of a repository. */
async function fetchLatestRelease(repository) {
  const url = `https://api.github.com/repos/${repository}/releases/latest`;
  const response = await fetch(url, { headers: ghHeaders() });
  if (response.status === 404) return null; // no releases published yet
  if (!response.ok) throw new Error(`${repository}: GitHub API returned ${response.status}`);
  const release = await response.json();
  return {
    repository,
    tag: release.tag_name,
    name: release.name || release.tag_name,
    url: release.html_url,
    publishedAt: release.published_at,
    body: release.body ?? ""
  };
}

function pickHighlights(release, maxHighlights) {
  // Deterministic: take the first N bullet lines from the release body.
  const bullets = (release.body ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+/.test(line) && line.replace(/^[-*+]\s+/, "").length > 12)
    .map((line) => line.replace(/^[-*+]\s+/, "").slice(0, 200));
  return bullets.slice(0, maxHighlights);
}

async function main() {
  const toolsFile = path.join(dataDir(), "tools.json");
  const config = await readJson(toolsFile, null);
  if (!config) throw new Error(`data/tools.json is missing or invalid JSON in ${dataRepo()}.`);
  const maxHighlights = config.preferences?.maxHighlightsPerTool ?? 3;
  const snapshot = await readJson(snapshotFile(), {});

  await mkdir(dataDir(), { recursive: true });

  const results = [];
  const newlyReleased = [];

  for (const tool of config.tools) {
    let release = null;
    if (tool.repository) {
      try {
        release = await fetchLatestRelease(tool.repository);
      } catch (error) {
        console.warn(`[warn] ${error.message}; keeping previous state for ${tool.id}.`);
        release = snapshot[tool.id] ?? null;
      }
    }
    if (release) {
      release.highlights = pickHighlights(release, maxHighlights);
      const previous = snapshot[tool.id];
      if (previous && previous.tag !== release.tag) {
        newlyReleased.push({ tool, previous, release });
      }
    }
    results.push({ tool, release });
  }

  const releasesMap = Object.fromEntries(
    results.map(({ tool, release }) => [tool.id, release
      ? { tag: release.tag, name: release.name, url: release.url, publishedAt: release.publishedAt, highlights: release.highlights }
      : null])
  );

  // Idempotent writes: when nothing changed, keep the existing files (and
  // their timestamps) so quiet nights produce no commits.
  const existingReleases = await readJson(releasesFile(), null);
  const existingSnapshot = await readJson(snapshotFile(), null);
  const changed = JSON.stringify(releasesMap) !== JSON.stringify(existingSnapshot ?? {});

  if (changed || !existingReleases) {
    await writeFile(releasesFile(), JSON.stringify({ updatedAt: now(), releases: releasesMap }, null, 2) + "\n");
  }

  if (newlyReleased.length > 0) {
    const pending = {
      generatedAt: now(),
      preferences: config.preferences ?? {},
      tools: newlyReleased.map(({ tool, previous, release }) => ({
        id: tool.id,
        name: tool.name,
        website: tool.website,
        repository: tool.repository,
        why: tool.why ?? "",
        interests: tool.interests ?? [],
        previousTag: previous.tag,
        release: {
          tag: release.tag,
          name: release.name,
          url: release.url,
          publishedAt: release.publishedAt,
          body: release.body.slice(0, 8000)
        }
      }))
    };
    await writeFile(pendingFile(), JSON.stringify(pending, null, 2) + "\n");
    console.log(`tool-radar: ${newlyReleased.length} new release(s) detected → data/pending.json`);
    console.log(newlyReleased.map(({ tool, previous, release }) => `  - ${tool.name}: ${previous.tag} → ${release.tag}`).join("\n"));
  } else {
    // Nothing new: remove any stale pending brief so the agent step is skipped.
    await writeFile(pendingFile(), "").catch(() => {});
    console.log("tool-radar: no new releases; coding agent not needed.");
  }

  // Update the snapshot only after a successful run, and only when changed.
  if (changed || !existingSnapshot) {
    await writeFile(snapshotFile(), JSON.stringify(releasesMap, null, 2) + "\n");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
