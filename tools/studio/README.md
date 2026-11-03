# Drayspo Studio

A small desktop app for editing drayspo.com: profile, sections, thoughts, projects, experience, skills, theme colors, your Apple Music playlist, and a live "now playing".

```
 Studio (your PC)
   ├─ edit ──► local draft  (~/.drayspo-studio/draft.json, autosaved)
   ├─ Preview ─► the real site on http://127.0.0.1:4321 with your draft
   ├─ Save draft to GitHub ─► content branch: content/draft.json   (never shipped)
   ├─ Publish ─► content/live.json  +  runs "Publish to drayspo.com"
   └─ Now playing ─► now-playing branch: now-playing.json  (read by the site every minute)
```

Nothing reaches the live site until you press **Publish**. The publish workflow validates the content against the site's schema before building, so a bad edit fails the build instead of breaking the page.

## Security

- The site is static, so there's no endpoint anyone could post changes to. Every write goes through the GitHub API.
- Studio only connects with a token that belongs to the repo owner (`draymcfarlane`) and can push to the repo. A token from any other account is rejected.
- The token lives in your system keychain (Windows Credential Manager), never in a file in the repo.
- The preview server listens on `127.0.0.1` only, so other devices on your network can't see it.
- Keep 2FA on your GitHub account, and give the token an expiry date.

## One-time setup (Windows)

1. **Add these files to the Drayspo repo** (your clone in `~/Downloads/drayspo-repo`). The sync workflow never touches `tools/` or `.github/`, so they're safe:
   - `tools/studio/` (this folder)
   - `tools/content/validate.ts`
   - `.github/workflows/publish.yml` (replaces the current one)

   Then commit and push to `main`.

2. **Install the tools Studio uses.** In PowerShell, not MSYS2:
   - Python 3.12 from python.org. Tick "Add python.exe to PATH". It includes tkinter, which the window needs.
   - Git for Windows, if `git --version` doesn't work in PowerShell.
   - Bun: `powershell -c "irm bun.sh/install.ps1 | iex"`

   Check with `python --version`, `git --version` and `bun --version`.

3. **Create a GitHub token.** Go to GitHub, then Settings › Developer settings › Fine-grained tokens › Generate new token, and set:
   - Repository access: **Only select repositories**, then pick **Drayspo**.
   - Permissions: **Contents: Read and write** and **Actions: Read and write**. Metadata (read) is added automatically.
   - An expiry date. Put a reminder in your calendar for before it runs out.

4. **Run Studio.** Double-click `tools/studio/start-studio.bat`. The first run creates a virtual environment and installs the dependencies. Paste the token when asked.

   On its first connection, Studio creates the `content` branch from the current site's `default.json`. From then on, the content branch is where your content lives.

## Everyday use

- **Edit** in the tabs. Every change is autosaved locally, and the status line shows whether the draft is saved to GitHub and whether it matches the live site.
- **Preview** builds and opens the real site with your draft. The first time takes a minute, because it downloads the site code and installs its packages. After that, press Preview again after an edit to refresh it.
- **Save draft to GitHub** backs up your draft and lets you continue on another computer. It does not change the live site.
- **Publish** saves the draft, marks it live, runs the publish workflow, and tells you when drayspo.com has updated.
- **Thoughts:** use *Estimate minutes from post* for the read time (about 200 words a minute), and *Set link from title* to give the post a readable link (`#thoughts/<id>`).
- **Music:** paste a playlist link from Apple Music (Share › Copy Link). *Start syncing Apple Music* reads what's playing in the Apple Music app every few seconds and updates the site when the song changes. Album art and the song link come from Apple's public search. When you pause for more than 90 seconds, or close Studio, the site switches to "Not listening right now".
- **Sections:** tick to show or hide sections, and use the arrows to reorder them. When the site's code gains new fields or sections (after a Lovable change), Studio adds them to your draft automatically, with new sections hidden, and lists them in the log.
- **Advanced:** the whole content file as JSON, for anything the tabs don't cover.

## Notes

- Content is now owned by Studio. Use Lovable for design and code changes. On publish, Lovable's `default.json` is replaced by `content/live.json`.
- The content branch keeps full history, so you can roll back any edit from GitHub. The now-playing branch keeps only the current song, so no listening history is stored.
- GitHub caches the now-playing file for up to 5 minutes, so a new song can take a few minutes to appear on the site.
- Settings such as the preview port are in `~/.drayspo-studio/settings.json`.
