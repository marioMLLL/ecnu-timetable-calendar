const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");

assert.equal(manifest.manifest_version, 3, "extension must use Manifest V3");
assert.equal(manifest.version, packageJson.version, "manifest and package versions must match");

for (const file of [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "background.js",
  "api-hook.js",
  "content.js",
  "lib/schedule-core.js",
  "lib/mobile-payload.js",
  "lib/subscription-config.js",
  "lib/subscription-client.js",
  "vendor/qrcode.js",
  "vendor/lz-string.min.js",
  "mobile/index.html",
  "mobile/mobile.css",
  "mobile/mobile.js",
  "README.md",
  "THIRD-PARTY-NOTICES.md",
  "LICENSE"
]) {
  assert.ok(fs.existsSync(path.join(root, file)), `missing required file: ${file}`);
}

assert.equal(manifest.background?.service_worker, "background.js", "subscription sync requires a background service worker");
assert.ok(manifest.permissions.includes("alarms"), "subscription sync requires alarms permission");

for (const ignoredPath of [
  "worker/.wrangler/",
  "worker/.dev.vars",
  "worker/.dev.vars.*",
  ".env",
  ".env.*",
  "!.env.example"
]) {
  assert.ok(gitignore.split(/\r?\n/).includes(ignoredPath), `.gitignore must contain ${ignoredPath}`);
}

const publicSources = ["popup.js", "api-hook.js", "content.js", "README.md", "mobile/mobile.js"]
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
assert.doesNotMatch(publicSources, /__access_token|SESSION=|pstsid|dataId=\d+/i, "possible credential or user-specific identifier found");

const ignoredDirectories = new Set([".git", ".wrangler", "dist", "node_modules"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".jsonc", ".md", ".mjs", ".sh", ".yaml", ".yml"]);

function repositoryTextFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...repositoryTextFiles(entryPath));
    else if (entry.name === ".gitignore" || textExtensions.has(path.extname(entry.name))) result.push(entryPath);
  }
  return result;
}

const repositoryText = repositoryTextFiles(root)
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

for (const [label, pattern] of [
  ["Wrangler OAuth access token", /cfoac_[A-Za-z0-9._-]+/],
  ["Wrangler OAuth credential", /(?:oauth_token|refresh_token)\s*=\s*["'][^"']+["']/i],
  ["literal Cloudflare API token", /CLOUDFLARE_API_TOKEN\s*[:=]\s*["'][^"'$<{][^"']*["']/],
  ["literal bearer token", /Authorization\s*:\s*Bearer\s+[A-Za-z0-9_-]{16,}/i],
  ["real calendar subscription URL", /https:\/\/calendar\.ycping\.top\/v1\/feeds\/[A-Za-z0-9_-]{20,}\.ics/i],
  ["school session cookie", /(?:^|[;\s])(?:SESSION|JSESSIONID)=[^;\s]+/im]
]) {
  assert.doesNotMatch(repositoryText, pattern, `${label} must not be committed`);
}

console.log("project validation passed");
