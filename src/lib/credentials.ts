const APP_ID = "tool-radar";
const APP_KEY = `repo-apps:app-credentials:v1:${encodeURIComponent(APP_ID)}`;
const SHARED_KEY = "repo-apps:credentials:v1";
const REPOSITORY_HINT = "page-apps/tool-radar-data";

interface CredentialEnvelope {
  version: 1;
  scope: "app";
  appId: string;
  credential: { kind: "pat"; token: string; createdAt: string };
}

interface SharedEnvelope {
  version: 1;
  scope: "shared";
  credential: { kind: "pat"; token: string; createdAt: string; account?: string };
  apps: Record<string, { connectedAt: string; repositoryHint?: string }>;
}

function normalise(token: string): string {
  const value = token.trim();
  if (!value || /\s/.test(value)) throw new Error("Enter a GitHub personal access token without spaces.");
  return value;
}

function appEnvelope(raw: string | null): CredentialEnvelope | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CredentialEnvelope>;
    if (value.version !== 1 || value.scope !== "app" || value.appId !== APP_ID || value.credential?.kind !== "pat" ||
      typeof value.credential.token !== "string" || typeof value.credential.createdAt !== "string") return null;
    return value as CredentialEnvelope;
  } catch { return null; }
}

function sharedEnvelope(raw: string | null): SharedEnvelope | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SharedEnvelope>;
    if (value.version !== 1 || value.scope !== "shared" || value.credential?.kind !== "pat" ||
      typeof value.credential.token !== "string" || typeof value.credential.createdAt !== "string" ||
      typeof value.apps !== "object" || value.apps === null) return null;
    return value as SharedEnvelope;
  } catch { return null; }
}

export class CredentialVault {
  #memoryToken: string | null = null;

  hasShared(): boolean { return sharedEnvelope(localStorage.getItem(SHARED_KEY)) !== null; }
  prepare(token: string): string { return normalise(token); }
  sharedToken(): string {
    const shared = sharedEnvelope(localStorage.getItem(SHARED_KEY));
    if (!shared) throw new Error("No Page Apps shared PAT is available in this browser.");
    return shared.credential.token;
  }

  restore(): string | null {
    if (this.#memoryToken) return this.#memoryToken;
    const session = appEnvelope(sessionStorage.getItem(APP_KEY));
    if (session) return session.credential.token;
    const persistent = appEnvelope(localStorage.getItem(APP_KEY));
    if (persistent) return persistent.credential.token;
    const shared = sharedEnvelope(localStorage.getItem(SHARED_KEY));
    return shared?.apps[APP_ID] ? shared.credential.token : null;
  }

  connect(token: string, persistence: "memory" | "session" | "local"): string {
    const clean = normalise(token);
    this.disconnect(false);
    if (persistence === "memory") this.#memoryToken = clean;
    else {
      const envelope: CredentialEnvelope = { version: 1, scope: "app", appId: APP_ID, credential: { kind: "pat", token: clean, createdAt: new Date().toISOString() } };
      (persistence === "session" ? sessionStorage : localStorage).setItem(APP_KEY, JSON.stringify(envelope));
    }
    return clean;
  }

  useShared(): string {
    const token = this.sharedToken();
    const shared = sharedEnvelope(localStorage.getItem(SHARED_KEY));
    if (shared) {
      shared.apps[APP_ID] = { connectedAt: new Date().toISOString(), repositoryHint: REPOSITORY_HINT };
      localStorage.setItem(SHARED_KEY, JSON.stringify(shared));
    }
    return token;
  }

  disconnect(removeRegistration = true): void {
    this.#memoryToken = null;
    sessionStorage.removeItem(APP_KEY);
    localStorage.removeItem(APP_KEY);
    if (!removeRegistration) return;
    const shared = sharedEnvelope(localStorage.getItem(SHARED_KEY));
    if (shared?.apps[APP_ID]) {
      delete shared.apps[APP_ID];
      localStorage.setItem(SHARED_KEY, JSON.stringify(shared));
    }
  }
}
