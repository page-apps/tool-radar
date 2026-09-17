export interface Tool {
  id: string;
  name: string;
  website: string;
  repository: string | null;
  why?: string;
  interests?: string[];
}

export interface ToolPreferences {
  interests?: string[];
  summaryStyle?: string;
  english?: string;
  maxHighlightsPerTool?: number;
}

export interface ToolConfig {
  preferences?: ToolPreferences;
  tools: Tool[];
}

export interface Release {
  tag: string;
  name: string;
  url: string;
  publishedAt: string | null;
  highlights: string[];
}

export interface ReleasesState {
  updatedAt: string;
  releases: Record<string, Release | null>;
}

export interface ToolSummary { id: string; tag: string; summary: string }

export interface SummariesState {
  generatedAt: string;
  source: string;
  tools: ToolSummary[];
}

export interface ScheduleConfig {
  enabled: boolean;
  timezone: string;
  runTime: string;
  cron: string;
  agent: string;
  model: string;
  description?: string;
  lastRunAt?: string | null;
}

export interface RadarData {
  tools: ToolConfig;
  releases: ReleasesState;
  summaries: SummariesState;
  schedule: ScheduleConfig;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function parseToolConfig(input: unknown): ToolConfig {
  if (typeof input !== "object" || input === null) throw new Error("data/tools.json is not an object.");
  const record = input as Record<string, unknown>;
  const rawTools = record.tools;
  if (!Array.isArray(rawTools)) throw new Error("data/tools.json is missing the tools array.");
  const tools: Tool[] = rawTools.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) throw new Error(`data/tools.json tool #${index + 1} is not an object.`);
    const tool = entry as Record<string, unknown>;
    const id = asString(tool.id);
    const name = asString(tool.name);
    const website = asString(tool.website);
    if (!id || !name || !website) throw new Error(`data/tools.json tool #${index + 1} is missing id, name or website.`);
    return {
      id,
      name,
      website,
      repository: asString(tool.repository),
      why: asString(tool.why) ?? undefined,
      interests: Array.isArray(tool.interests) ? tool.interests.filter((item): item is string => typeof item === "string") : undefined
    };
  });
  const preferences = (typeof record.preferences === "object" && record.preferences !== null ? record.preferences : {}) as ToolPreferences;
  return { preferences, tools };
}

export function parseReleasesState(input: unknown): ReleasesState {
  if (typeof input !== "object" || input === null) throw new Error("data/releases.json is not an object.");
  const record = input as Record<string, unknown>;
  const releases: Record<string, Release | null> = {};
  const rawReleases = typeof record.releases === "object" && record.releases !== null ? record.releases as Record<string, unknown> : {};
  for (const [id, value] of Object.entries(rawReleases)) {
    if (value === null) { releases[id] = null; continue; }
    if (typeof value !== "object") throw new Error(`data/releases.json entry ${id} is malformed.`);
    const release = value as Record<string, unknown>;
    const tag = asString(release.tag);
    const url = asString(release.url);
    if (!tag || !url) throw new Error(`data/releases.json entry ${id} is missing tag or url.`);
    releases[id] = {
      tag,
      name: asString(release.name) ?? tag,
      url,
      publishedAt: asString(release.publishedAt),
      highlights: Array.isArray(release.highlights) ? release.highlights.filter((item): item is string => typeof item === "string") : []
    };
  }
  return { updatedAt: asString(record.updatedAt) ?? "", releases };
}

export function parseSummariesState(input: unknown): SummariesState {
  if (typeof input !== "object" || input === null) throw new Error("data/summaries.json is not an object.");
  const record = input as Record<string, unknown>;
  const rawTools = Array.isArray(record.tools) ? record.tools : [];
  const tools: ToolSummary[] = rawTools.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) throw new Error(`data/summaries.json entry #${index + 1} is malformed.`);
    const summary = entry as Record<string, unknown>;
    const id = asString(summary.id);
    const tag = asString(summary.tag);
    const text = asString(summary.summary);
    if (!id || !tag || !text) throw new Error(`data/summaries.json entry #${index + 1} is missing id, tag or summary.`);
    return { id, tag, summary: text };
  });
  return { generatedAt: asString(record.generatedAt) ?? "", source: asString(record.source) ?? "pending", tools };
}

export function parseScheduleConfig(input: unknown): ScheduleConfig {
  if (typeof input !== "object" || input === null) throw new Error("data/schedule.json is not an object.");
  const record = input as Record<string, unknown>;
  const timezone = asString(record.timezone);
  const runTime = asString(record.runTime);
  const cron = asString(record.cron);
  const agent = asString(record.agent);
  if (!timezone || !runTime || !cron || !agent) throw new Error("data/schedule.json is missing timezone, runTime, cron or agent.");
  return {
    enabled: record.enabled === true,
    timezone,
    runTime,
    cron,
    agent,
    model: asString(record.model) ?? "",
    description: asString(record.description) ?? undefined,
    lastRunAt: asString(record.lastRunAt)
  };
}

export function parseRadarData(raw: { tools: unknown; releases: unknown; summaries: unknown; schedule: unknown }): RadarData {
  return {
    tools: parseToolConfig(raw.tools),
    releases: parseReleasesState(raw.releases),
    summaries: parseSummariesState(raw.summaries),
    schedule: parseScheduleConfig(raw.schedule)
  };
}
