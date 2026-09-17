#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const dist = resolve("dist");
const manifest = JSON.parse(await readFile(join(dist, "manifest.webmanifest"), "utf8"));
for (const field of ["id", "name", "short_name", "start_url", "scope", "display", "theme_color", "background_color"]) {
  if (typeof manifest[field] !== "string" || !manifest[field]) throw new Error(`PWA manifest is missing ${field}.`);
}
if (manifest.start_url !== "./" || manifest.scope !== "./" || manifest.display !== "standalone") throw new Error("PWA scope, start URL, or display mode is unsafe for GitHub Pages.");
if (!Array.isArray(manifest.icons)) throw new Error("PWA manifest has no icons.");

const expectedIcons = new Map([
  ["icons/icon-192.png", [192, 192]],
  ["icons/icon-512.png", [512, 512]],
  ["icons/icon-maskable-512.png", [512, 512]],
]);
for (const [path, [width, height]] of expectedIcons) {
  const entry = manifest.icons.find((icon) => icon.src === path);
  if (!entry) throw new Error(`PWA manifest is missing ${path}.`);
  const file = await readFile(join(dist, path));
  if (file.toString("ascii", 1, 4) !== "PNG" || file.readUInt32BE(16) !== width || file.readUInt32BE(20) !== height) throw new Error(`${path} has invalid PNG dimensions.`);
}
if (!manifest.icons.some((icon) => String(icon.purpose).split(/\s+/).includes("maskable"))) throw new Error("PWA manifest has no maskable icon.");

const html = await readFile(join(dist, "index.html"), "utf8");
const worker = await readFile(join(dist, "service-worker.js"), "utf8");
const clientScripts = await Promise.all((await readdir(join(dist, "_astro"))).filter((file) => file.endsWith(".js")).map((file) => readFile(join(dist, "_astro", file), "utf8")));
if (!html.includes("manifest.webmanifest") || !html.includes("apple-touch-icon.png") || !clientScripts.some((script) => script.includes("service-worker.js"))) throw new Error("Built page is missing PWA discovery or registration metadata.");
if (!worker.includes("url.origin !== self.location.origin")) throw new Error("Service worker must exclude cross-origin private API requests from caching.");
console.info(`Validated installable PWA manifest, service worker, and ${expectedIcons.size} required icons.`);
