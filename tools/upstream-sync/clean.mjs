#!/usr/bin/env node
// Copies the upstream editor repo into this repo, keeping only application code.
//
// Usage:
//   UPSTREAM_VENDOR=<name> node tools/upstream-sync/clean.mjs --source <upstream checkout> --target <repo root>
//
// UPSTREAM_VENDOR is the editor's name (set as a GitHub repository variable). Every
// vendor-specific pattern below is derived from it at run time, so no vendor names
// are stored in this repository.
//
// Rules, in order:
//   1. Only allowlisted top-level files and folders are copied. Anything else
//      (tool folders, agent instruction files, env files, lockfiles, workflows) is dropped.
//   2. Vendor runtime files inside src/ are dropped or replaced.
//   3. Vendor packages are removed from package.json; vendor lines from bunfig.toml.
//   4. vite.config.ts, README.md and the error reporter come from ./overlay.
//   5. Files the editor hosts on its own storage are repointed to /media/<file>.
//   6. If any vendor reference survives, the script fails and nothing is committed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY = path.join(HERE, "overlay");

// ---- configuration ---------------------------------------------------------------

// Top-level entries copied from upstream. Everything else is dropped.
const ALLOW_TOP = new Set([
  "src",
  "public",
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  "eslint.config.js",
  "components.json",
  "bunfig.toml",
  ".gitignore",
  ".prettierrc",
  ".prettierignore",
]);

// Paths in the target that a sync never deletes or overwrites.
const PROTECTED_TARGET = new Set([".git", ".github", "tools", "node_modules", "dist", "_upstream", "bun.lock"]);

// Files dropped even inside allowlisted folders (the editor's SSR wrapper; unused by the static build).
const DROP_PATHS = new Set(["src/server.ts", "src/lib/error-capture.ts", "public/.htaccess"]);

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".html", ".md", ".toml", ".txt", ".yml", ".yaml"]);

// ---- helpers ---------------------------------------------------------------------

function fail(msg) {
  console.error(`::error::upstream-sync: ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (k) => {
    const i = a.indexOf(k);
    if (i === -1 || !a[i + 1]) fail(`missing ${k}`);
    return path.resolve(a[i + 1]);
  };
  return { source: get("--source"), target: get("--target") };
}

const posix = (p) => p.split(path.sep).join("/");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function walk(dir, root = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, root, out);
    else out.push(posix(path.relative(root, full)));
  }
  return out;
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// ---- vendor patterns (built from UPSTREAM_VENDOR) --------------------------------

const vendor = (process.env.UPSTREAM_VENDOR ?? "").trim().toLowerCase();
if (!/^[a-z][a-z0-9-]{2,}$/.test(vendor)) fail("set the UPSTREAM_VENDOR repository variable to the editor's name");

const Vendor = vendor[0].toUpperCase() + vendor.slice(1);
const storageTag = `__${vendor[0]}${vendor.length - 2}${vendor.at(-1)}`; // editor's asset-storage path prefix
const RE = {
  any: new RegExp(`${esc(vendor)}|${esc(storageTag)}`, "i"),
  name: new RegExp(esc(vendor), "i"),
  pkg: new RegExp(`^(@${esc(vendor)}\\.dev/|${esc(vendor)})`, "i"),
  reporterPath: new RegExp(`(["'][./@\\w-]*/)${esc(vendor)}-error-reporting(["'])`, "g"),
  reporterName: new RegExp(`\\breport${esc(Vendor)}Error\\b`, "g"),
  storageUrl: new RegExp(`/${esc(storageTag)}/assets-v1/[0-9a-f-]+/([^"'\`\\s)]+)`, "gi"),
  commentLine: /^\s*(\/\/|#|\*|\/\*|<!--)/,
};
const isVendorPackage = (name) => RE.pkg.test(name) || name === "nitro";

// ---- steps -----------------------------------------------------------------------

function clearTarget(target) {
  for (const entry of fs.readdirSync(target)) {
    if (!PROTECTED_TARGET.has(entry)) fs.rmSync(path.join(target, entry), { recursive: true, force: true });
  }
}

function copySource(source, target) {
  const dropped = new Set();
  let copied = 0;
  for (const f of walk(source)) {
    const top = f.split("/")[0];
    if (!ALLOW_TOP.has(top)) {
      dropped.add(top);
      continue;
    }
    if (DROP_PATHS.has(f) || RE.name.test(f) || /(^|\/)\.env(\.|$)/.test(f)) {
      dropped.add(f);
      continue;
    }
    copyFile(path.join(source, f), path.join(target, f));
    copied++;
  }
  return { copied, dropped: [...dropped].sort() };
}

function applyOverlay(target) {
  for (const f of walk(OVERLAY)) copyFile(path.join(OVERLAY, f), path.join(target, f));
}

function cleanPackageJson(target) {
  const p = path.join(target, "package.json");
  if (!fs.existsSync(p)) fail("package.json missing upstream");
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  let removed = 0;
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (isVendorPackage(name)) {
        delete pkg[field][name];
        removed++;
      }
    }
  }
  pkg.name = "drayspo";
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  return removed;
}

function cleanBunfig(target) {
  const p = path.join(target, "bunfig.toml");
  if (!fs.existsSync(p)) return;
  const kept = [];
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    if (RE.any.test(line)) {
      while (kept.length && /^\s*#/.test(kept.at(-1))) kept.pop(); // drop its explanatory comment too
      continue;
    }
    kept.push(line);
  }
  fs.writeFileSync(p, kept.join("\n"));
}

function rewriteAssetJson(target) {
  const dir = path.join(target, "src/assets");
  if (!fs.existsSync(dir)) return [];
  const needed = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".asset.json"))) {
    const p = path.join(dir, f);
    const meta = JSON.parse(fs.readFileSync(p, "utf8"));
    const name = meta.original_filename ?? f.replace(/\.asset\.json$/, "");
    fs.writeFileSync(p, JSON.stringify({ url: `/media/${name}`, original_filename: name, content_type: meta.content_type }, null, 2) + "\n");
    needed.push(name);
  }
  return needed;
}

function rewriteSource(target) {
  const needed = [];
  for (const f of walk(target)) {
    if (PROTECTED_TARGET.has(f.split("/")[0]) || !TEXT_EXT.has(path.extname(f))) continue;
    const p = path.join(target, f);
    const before = fs.readFileSync(p, "utf8");
    let s = before
      .replace(RE.reporterPath, "$1report-error$2")
      .replace(RE.reporterName, "reportError")
      .replace(RE.storageUrl, (_, name) => {
        needed.push(decodeURIComponent(name));
        return `/media/${name}`;
      });
    s = s
      .split("\n")
      .filter((line) => !(RE.commentLine.test(line) && RE.any.test(line)))
      .join("\n");
    if (s !== before) fs.writeFileSync(p, s);
  }
  return needed;
}

function checkMedia(target, names) {
  const missing = [...new Set(names)].filter((n) => !fs.existsSync(path.join(target, "public/media", n)));
  if (missing.length) {
    fail(`upstream uses files from the editor's own storage. Add them to tools/upstream-sync/overlay/public/media/: ${missing.join(", ")}`);
  }
}

function checkLeftovers(target) {
  const hits = [];
  for (const f of walk(target)) {
    if (PROTECTED_TARGET.has(f.split("/")[0])) continue;
    if (RE.any.test(f)) hits.push(`${f} (file name)`);
    if (!TEXT_EXT.has(path.extname(f))) continue;
    fs.readFileSync(path.join(target, f), "utf8")
      .split("\n")
      .forEach((line, i) => RE.any.test(line) && hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`));
  }
  if (hits.length) {
    console.error(hits.join("\n"));
    fail(`${hits.length} vendor reference(s) left after cleaning — add a rule to tools/upstream-sync/clean.mjs`);
  }
}

// ---- main ------------------------------------------------------------------------

const { source, target } = parseArgs();
if (!fs.existsSync(path.join(source, "package.json"))) fail(`no package.json in ${source}`);

clearTarget(target);
const { copied, dropped } = copySource(source, target);
applyOverlay(target);
const removedPkgs = cleanPackageJson(target);
cleanBunfig(target);
checkMedia(target, [...rewriteAssetJson(target), ...rewriteSource(target)]);
checkLeftovers(target);

console.log(`upstream-sync: copied ${copied} files, dropped ${dropped.length} path(s), removed ${removedPkgs} package(s)`);
console.log("upstream-sync: clean — no vendor references remain");
