#!/usr/bin/env node
/**
 * Exits 0 only when data/summaries.json covers every pending release with a
 * matching tag. Guards the coding-agent step: a silently unproductive agent
 * run falls back to deterministic summaries.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const dataRepo = process.env.TOOL_RADAR_DATA_REPO;
if (!dataRepo || !path.isAbsolute(dataRepo)) throw new Error("Set TOOL_RADAR_DATA_REPO to an absolute path.");
const read = async (name) => JSON.parse(await readFile(path.join(dataRepo, "data", name), "utf8"));

const pending = await read("pending.json");
const summaries = await read("summaries.json");

const byId = new Map(summaries.tools.map((entry) => [entry.id, entry]));
const missing = pending.tools.filter((entry) => {
  const summary = byId.get(entry.id);
  return !summary || summary.tag !== entry.release.tag || !summary.summary?.trim();
});

if (missing.length > 0) {
  console.error(`tool-radar: summaries missing for: ${missing.map((entry) => entry.id).join(", ")}`);
  process.exit(1);
}
console.log(`tool-radar: ${pending.tools.length} summarie(s) verified.`);
