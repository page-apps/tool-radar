import { defineConfig } from "astro/config";

const [owner = "local", repository = "tool-radar"] = (process.env.GITHUB_REPOSITORY ?? "local/tool-radar").split("/");
const onGitHubPages = process.env.GITHUB_ACTIONS === "true";
const isUserSite = repository === `${owner}.github.io`;

export default defineConfig({
  output: "static",
  site: onGitHubPages ? `https://${owner}.github.io` : "http://localhost:4321",
  base: onGitHubPages && !isUserSite ? `/${repository}` : "/",
  vite: {
    preview: { allowedHosts: true },
    dev: { allowedHosts: true }
  }
});
