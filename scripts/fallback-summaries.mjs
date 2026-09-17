#!/usr/bin/env node
/**
 * Fallback used only when the coding agent cannot run: copies the
 * deterministically extracted highlights into summaries.json so the site
 * still renders fresh release information.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataRepo = process.env.TOOL_RADAR_DATA_REPO;
if (!dataRepo || !path.isAbsolute(dataRepo)) throw new Error("Set TOOL_RADAR_DATA_REPO to an absolute path.");
const pendingFile = path.join(dataRepo, "data", "pending.json");
const summariesFile = path.join(dataRepo, "data", "summaries.json");

const pending = JSON.parse(await readFile(pendingFile, "utf8"));
const summaries = {
  generatedAt: new Date().toISOString(),
  source: "fallback",
  tools: pending.tools.map((entry) => ({
    id: entry.id,
    tag: entry.release.tag,
    summary: (entry.release.body ?? "")
      .split("\n")
      .filter((line) => /^[-*+]\s+/.test(line.trim()))
      .slice(0, 3)
      .map((line) => line.trim().replace(/^[-*+]\s+/, ""))
      .join(" ")
  }))
};
await writeFile(summariesFile, JSON.stringify(summaries, null, 2) + "\n");
console.log("tool-radar: wrote fallback summaries.");
