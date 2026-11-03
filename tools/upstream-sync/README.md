# Upstream sync and publishing

The site is designed in an external editor, which keeps its own GitHub repo (the
"upstream"). This repo never syncs with the editor directly: a workflow pulls the
upstream, keeps only the application code, and commits that here.

## Workflows

| Workflow | When | What it does |
|---|---|---|
| **Sync from upstream** (`.github/workflows/sync-upstream.yml`) | Every 6 hours, or Actions → Run workflow | Checks out the upstream repo, runs `clean.mjs`, installs, tests and builds. Only if all of that passes does it commit the result to `main`. |
| **Publish to drayspo.com** (`.github/workflows/publish.yml`) | Manual only | Builds `main` and deploys `dist/client` to GitHub Pages on the custom domain `drayspo.com`. |

## Repository settings used

| Name | Kind | Value |
|---|---|---|
| `UPSTREAM_REPO` | Variable | `owner/repo` of the editor's repo |
| `UPSTREAM_VENDOR` | Variable | The editor's name (all cleanup patterns are derived from it, so it never appears in this repo) |
| `UPSTREAM_BRANCH` | Variable (optional) | Branch to pull; defaults to `main` |
| `UPSTREAM_TOKEN` | Secret (if upstream is private) | Fine-grained token with read-only Contents access to the upstream repo |

## What `clean.mjs` keeps and removes

- **Keeps only** these top-level entries: `src/`, `public/`, `package.json`, `tsconfig.json`,
  `vitest.config.ts`, `eslint.config.js`, `components.json`, `bunfig.toml`, `.gitignore`,
  `.prettierrc`, `.prettierignore`. Everything else upstream (tool folders, instruction
  files, workflows, lockfiles, env files) is dropped.
- **Drops** the editor's server wrapper (`src/server.ts`, `src/lib/error-capture.ts`),
  `public/.htaccess`, any file named after the vendor, and any `.env*` file.
- **Removes** the vendor's packages (and `nitro`) from `package.json`, and vendor lines
  from `bunfig.toml`. `bun.lock` is maintained here, not copied.
- **Replaces** `vite.config.ts`, `README.md` and the error reporter with the files in
  `overlay/`.
- **Repoints** files hosted on the editor's own storage to `/media/<file>`. Put those
  files in `overlay/public/media/`; the sync stops and names any that are missing.
- **Fails without committing** if any vendor reference survives, or if tests or the
  build fail. The run log names the file and line.

## Files in `overlay/`

Copied over the cleaned code on every sync: `vite.config.ts`, `README.md`,
`src/lib/report-error.ts`, and anything in `public/media/`.
