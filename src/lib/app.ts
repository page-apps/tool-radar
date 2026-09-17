import { CredentialVault } from "./credentials";
import { PrivateRadarRepository } from "./repository";
import type { RadarData, Release, Tool } from "./domain";

const vault = new CredentialVault();
const state: { account: string | null; data: RadarData | null; repository: PrivateRadarRepository | null } = {
  account: null, data: null, repository: null
};

const $ = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing UI element: ${selector}`);
  return node;
};

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installPrompt: InstallPromptEvent | null = null;
const installButton = document.querySelector<HTMLButtonElement>("[data-install]");
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
  installButton?.removeAttribute("hidden");
});
installButton?.addEventListener("click", () => {
  if (!installPrompt) return;
  void installPrompt.prompt().then(() => installPrompt?.userChoice).finally(() => {
    installPrompt = null;
    installButton.setAttribute("hidden", "");
  });
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton?.setAttribute("hidden", "");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const appBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/`;
    void navigator.serviceWorker.register(`${appBase}service-worker.js`, { scope: appBase })
      .catch((error) => console.warn("Tool Radar could not enable offline mode.", error));
  });
}

const dateFormatter = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });const timeFormatter = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney", timeZoneName: "short" });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character] ?? character);
const shortDate = (value: string | null) => (value ? dateFormatter.format(new Date(value)) : "unknown date");

function setStatus(label: string, detail: string, tone: "idle" | "working" | "ready" | "error" = "idle"): void {
  $("[data-status-label]").textContent = label;
  $("[data-status-detail]").textContent = detail;
  $("[data-status]").setAttribute("data-tone", tone);
}

function showConnected(connected: boolean): void {
  document.querySelectorAll<HTMLElement>("[data-locked]").forEach((element) => element.toggleAttribute("hidden", connected));
  $("[data-reader]").toggleAttribute("hidden", !connected);
  $("[data-disconnect]").toggleAttribute("hidden", !connected);
  $("[data-connect]").toggleAttribute("hidden", connected);
}

function releaseFor(tool: Tool): Release | null {
  return state.data?.releases.releases[tool.id] ?? null;
}

function summaryFor(tool: Tool): string | null {
  const release = releaseFor(tool);
  const summary = state.data?.summaries.tools.find((entry) => entry.id === tool.id) ?? null;
  if (!summary || !release || summary.tag !== release.tag) return null;
  return summary.summary;
}

function toolCard(tool: Tool): string {
  const release = releaseFor(tool);
  const summary = summaryFor(tool);
  const interests = [...new Set([...(tool.interests ?? []), ...(state.data?.tools.preferences?.interests ?? [])])].slice(0, 4);
  return `<article class="tool-card" data-tool="${escapeHtml(tool.id)}" data-search="${escapeHtml(`${tool.name} ${tool.why ?? ""} ${(tool.interests ?? []).join(" ")}`.toLowerCase())}">
    <header class="tool-byline">
      <h2><a href="${escapeHtml(tool.website)}" target="_blank" rel="noreferrer">${escapeHtml(tool.name)}</a></h2>
      <span class="tool-why">${escapeHtml(tool.why ?? "")}</span>
    </header>
    ${release
      ? `<p class="release-line"><span class="tag">${escapeHtml(release.tag)}</span> · <span class="date">${escapeHtml(shortDate(release.publishedAt))}</span> · <a href="${escapeHtml(release.url)}" target="_blank" rel="noreferrer">release notes</a></p>`
      : `<p class="release-line empty">${tool.repository ? "No published release found yet." : "No public release feed configured."}</p>`}
    ${summary ? `<span class="summary-label">Why it matters to you</span><p class="summary">${escapeHtml(summary)}</p>` : ""}
    ${release?.highlights.length ? `<ul class="highlights">${release.highlights.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
    ${interests.length ? `<ul class="chips">${interests.map((interest) => `<li>${escapeHtml(interest)}</li>`).join("")}</ul>` : ""}
  </article>`;
}

function renderRadar(data: RadarData): void {
  state.data = data;
  document.title = `Tool Radar · ${data.tools.tools.length} tools`;
  const latest = state.data.releases.updatedAt;
  $("[data-radar-updated]").textContent = latest
    ? `Radar updated ${timeFormatter.format(new Date(latest))} · summaries by ${state.data.summaries.source === "fallback" ? "deterministic fallback" : state.data.summaries.source === "coding-agent" ? "coding agent" : "—"}`
    : "The deterministic pipeline has not run yet.";
  const schedule = state.data.schedule;
  $("[data-schedule]").innerHTML = `
    <p class="eyebrow">Scheduled task</p>
    <p><strong>${schedule.enabled ? "Enabled" : "Paused"}</strong> · ${escapeHtml(schedule.runTime)} ${escapeHtml(schedule.timezone)} · cron <code>${escapeHtml(schedule.cron)}</code> · agent <code>${escapeHtml(schedule.agent)}${schedule.model ? ` (${escapeHtml(schedule.model)})` : ""}</code></p>
    <p class="muted">${escapeHtml(schedule.description ?? "The coding agent runs only when a tool has a new release since the last snapshot.")}</p>`;
  $("[data-tools]").innerHTML = state.data.tools.tools.map(toolCard).join("");
  $("[data-count]").textContent = String(state.data.tools.tools.length);
}

async function connect(token: string): Promise<void> {
  setStatus("Connecting to GitHub", "Checking account and read access to the private data repository", "working");
  const repository = new PrivateRadarRepository(token);
  const account = await repository.verify();
  const data = await repository.radarData();
  state.repository = repository;
  state.account = account;
  showConnected(true);
  renderRadar(data);
  setStatus(`Connected as ${account}`, `Private data · ${data.tools.tools.length} tools · releases ${data.releases.updatedAt ? shortDate(data.releases.updatedAt) : "not fetched yet"}`, "ready");
}

function openDialog(): void {
  const dialog = $<HTMLDialogElement>("[data-connect-dialog]");
  $("[data-shared-option]").toggleAttribute("hidden", !vault.hasShared());
  $("[data-connect-error]").textContent = "";
  dialog.showModal();
}

async function attempt(action: () => Promise<void>): Promise<void> {
  try { await action(); }
  catch (error) {
    const message = error instanceof Error ? error.message : "The private reader could not connect.";
    setStatus("Connection failed", message, "error");
    $("[data-connect-error]").textContent = message;
    if (!$<HTMLDialogElement>("[data-connect-dialog]").open) openDialog();
  }
}

document.querySelectorAll<HTMLElement>("[data-connect]").forEach((button) => button.addEventListener("click", openDialog));
$("[data-dialog-close]").addEventListener("click", () => $<HTMLDialogElement>("[data-connect-dialog]").close());
$("[data-token-toggle]").addEventListener("click", () => {
  const input = $<HTMLInputElement>("[data-token]");
  input.type = input.type === "password" ? "text" : "password";
  $("[data-token-toggle]").textContent = input.type === "password" ? "Show" : "Hide";
});
$("[data-token-form]").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $<HTMLInputElement>("[data-token]");
  const persistence = $<HTMLInputElement>('input[name="persistence"]:checked').value as "memory" | "session" | "local";
  void attempt(async () => {
    const token = vault.prepare(input.value);
    await connect(token);
    vault.connect(token, persistence);
    input.value = "";
    $<HTMLDialogElement>("[data-connect-dialog]").close();
  });
});
$("[data-use-shared]").addEventListener("click", () => void attempt(async () => {
  const token = vault.useShared();
  await connect(token);
  $<HTMLDialogElement>("[data-connect-dialog]").close();
}));
$("[data-disconnect]").addEventListener("click", () => {
  vault.disconnect();
  state.account = null; state.data = null; state.repository = null;
  showConnected(false);
  setStatus("Private reader", "Connect a fine-grained PAT to load your tool radar", "idle");
});
$("[data-search]").addEventListener("input", () => {
  const query = $<HTMLInputElement>("[data-search]").value.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll<HTMLElement>("[data-tool]").forEach((card) => {
    const matches = !query || (card.dataset.search?.includes(query) ?? false);
    card.toggleAttribute("hidden", !matches);
    if (matches) visible += 1;
  });
  $("[data-filter-count]").textContent = `${visible} of ${state.data?.tools.tools.length ?? 0}`;
});

showConnected(false);
const restored = vault.restore();
if (restored) void attempt(() => connect(restored));
else setStatus("Private reader", "Connect a fine-grained PAT to load your tool radar", "idle");
