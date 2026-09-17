import { parseRadarData, type RadarData } from "./domain";

const OWNER = "page-apps";
const NAME = "tool-radar-data";
const BRANCH = "main";

interface GitHubFile {
  type: string;
  content?: string;
  encoding?: string;
}

function decodeBase64(value: string): string {
  const bytes = Uint8Array.from(atob(value.replace(/\n/g, "")), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class PrivateRadarRepository {
  readonly #token: string;
  constructor(token: string) { this.#token = token; }

  async #request(path: string): Promise<Response> {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.#token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      cache: "no-store"
    });
    if (response.ok) return response;
    if (response.status === 401) throw new Error("GitHub did not accept this PAT. Check that it is active and copied in full.");
    if (response.status === 403 || response.status === 404) throw new Error(`This PAT needs Contents: read access to ${OWNER}/${NAME}.`);
    throw new Error(`GitHub returned ${response.status} while loading the private radar data.`);
  }

  async verify(): Promise<string> {
    const [accountResponse, repositoryResponse] = await Promise.all([
      this.#request("/user"),
      this.#request(`/repos/${OWNER}/${NAME}`)
    ]);
    const account = await accountResponse.json() as { login?: unknown };
    if (typeof account.login !== "string" || !account.login) throw new Error("GitHub did not return an account for this PAT.");
    const repository = await repositoryResponse.json() as { private?: unknown };
    if (repository.private !== true) throw new Error(`${OWNER}/${NAME} is not a private repository.`);
    return account.login;
  }

  async #jsonFile(path: string): Promise<unknown> {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await this.#request(`/repos/${OWNER}/${NAME}/contents/${encodedPath}?ref=${encodeURIComponent(BRANCH)}`);
    const file = await response.json() as GitHubFile;
    if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") throw new Error(`The private repository path ${path} is not a readable file.`);
    try { return JSON.parse(decodeBase64(file.content)); }
    catch { throw new Error(`The private repository path ${path} does not contain valid JSON.`); }
  }

  async radarData(): Promise<RadarData> {
    return parseRadarData({
      tools: await this.#jsonFile("data/tools.json"),
      releases: await this.#jsonFile("data/releases.json"),
      summaries: await this.#jsonFile("data/summaries.json"),
      schedule: await this.#jsonFile("data/schedule.json")
    });
  }
}
