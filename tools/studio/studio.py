"""
Drayspo Studio - a small desktop editor for drayspo.com.

How it works (no server needed):
  * Your content lives in the Drayspo repo on a separate "content" branch:
      content/draft.json  - what you are working on (never shipped)
      content/live.json   - what the site is built from (written only by Publish)
  * Preview runs the real site on http://127.0.0.1:<port> using your local draft.
  * Publish copies draft -> live and starts the "Publish to drayspo.com" workflow.
  * Now playing (Apple Music) is written to a one-commit "now-playing" branch that
    the site reads every minute, so songs never trigger a rebuild.

Security: every write goes through the GitHub API with a fine-grained token that
only you hold (stored in your OS keychain, never on disk), and Studio refuses to
connect unless that token belongs to the repo owner and can push to the repo.
"""

from __future__ import annotations

import asyncio
import base64
import copy
import datetime as dt
import hashlib
import json
import os
import platform
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import tkinter as tk
import urllib.parse
import webbrowser
from pathlib import Path
from tkinter import colorchooser, filedialog, messagebox, simpledialog, ttk

import keyring
import requests

import resume_pdf

APP = "Drayspo Studio"
KEYRING_SERVICE = "drayspo-studio"
HOME = Path.home() / ".drayspo-studio"
SETTINGS_FILE = HOME / "settings.json"
DRAFT_FILE = HOME / "draft.json"
RESUME_DRAFT = HOME / "resume-draft.pdf"
RESUME_DRAFT_PATH, RESUME_LIVE_PATH = "content/resume-draft.pdf", "content/resume.pdf"
OWNER_NAME = "Dray McFarlane"  # used when the content has no name
PHOTO_DIR = HOME / "media"     # hero photo drafts, named holo-photo.<ext>
PHOTO_TYPES = {b"\x89PNG": ".png", b"\xff\xd8\xff": ".jpg", b"RIFF": ".webp"}
MAX_PHOTO = 6 * 1024 * 1024
STATE_FILE = HOME / "state.json"
SITE_DIR = HOME / "site"

DEFAULT_SETTINGS = {
    "owner": "draymcfarlane",
    "repo": "Drayspo",
    "site_branch": "main",
    "content_branch": "content",
    "now_playing_branch": "now-playing",
    "publish_workflow": "publish.yml",
    "preview_port": 4321,
}

SECTION_LABELS = {
    "hero": "Home", "about": "About", "experience": "Experience", "projects": "Projects",
    "github": "GitHub", "music": "Music", "thoughts": "Thoughts", "skills": "Skills", "contact": "Contact",
}

# Colors match the site's dark theme.
BG, PANEL, FIELD, TEXT, MUTED, PRIMARY, ACCENT = "#0B0B14", "#16131F", "#1E1B2B", "#F5F5F7", "#A9A6BC", "#7C3AED", "#F472B6"


# --------------------------------------------------------------------------- utilities

def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return copy.deepcopy(fallback)


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def dumps(data) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def fingerprint(data) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:60] or "post"


def estimate_minutes(text: str) -> int:
    return max(1, round(len(re.findall(r"\S+", text)) / 200))


def git_blob_sha(data: bytes) -> str:
    """The sha GitHub reports for a file with these bytes (skips re-uploading unchanged files)."""
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def find_resume_link(cfg: dict) -> dict | None:
    """Same rule as the site's findResumeLink(): a 'resume/cv/pdf' label or a .pdf URL."""
    for link in cfg.get("content", {}).get("links", []):
        if re.search(r"resume|cv|pdf", link.get("label", ""), re.I) or re.search(r"\.pdf($|\?)", link.get("url", ""), re.I):
            return link
    return None


def merge_missing(target, source, hidden_sections=None):
    """Add keys the site's code has but your content doesn't (e.g. after a Lovable change).
    New sections are added hidden, so nothing appears on the page until you switch it on."""
    added = []
    if not isinstance(target, dict) or not isinstance(source, dict):
        return added
    for k, v in source.items():
        if k not in target:
            target[k] = copy.deepcopy(v)
            added.append(k)
        elif isinstance(v, dict):
            added += [f"{k}.{a}" for a in merge_missing(target[k], v)]
    lay, slay = target.get("layout"), source.get("layout")
    if isinstance(lay, dict) and isinstance(slay, dict):
        src_order = slay.get("sectionOrder", [])
        for n, sid in enumerate(src_order):
            order = lay.setdefault("sectionOrder", [])
            if sid in order:
                continue
            before = next((p for p in reversed(src_order[:n]) if p in order), None)
            order.insert(order.index(before) + 1 if before else 0, sid)
            lay.setdefault("hiddenSections", []).append(sid)
            added.append(f"section {sid}")
    return added


def ensure_shape(cfg: dict) -> dict:
    """Fill in sections Studio edits, so older content still works."""
    c = cfg.setdefault("content", {})
    for key in ("experience", "projects", "skills", "links", "thoughts"):
        c.setdefault(key, [])
    music = c.setdefault("music", {})
    music.setdefault("playlistUrl", "")
    music.setdefault("playlistName", "")
    music.setdefault("nowPlaying", None)
    layout = cfg.setdefault("layout", {})
    layout.setdefault("sectionOrder", [])
    layout.setdefault("hiddenSections", [])
    return cfg


# --------------------------------------------------------------------------- GitHub API

class GitHubError(Exception):
    pass


class GitHub:
    """The small slice of the GitHub REST API that Studio needs."""

    def __init__(self, token: str, owner: str, repo: str):
        self.owner, self.repo = owner, repo
        self.s = requests.Session()
        self.s.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "drayspo-studio",
        })

    def _url(self, path: str) -> str:
        return f"https://api.github.com/repos/{self.owner}/{self.repo}{path}"

    def _req(self, method: str, url: str, ok=(200, 201, 204), **kw):
        r = self.s.request(method, url, timeout=20, **kw)
        if r.status_code not in ok:
            try:
                msg = r.json().get("message", r.text)
            except ValueError:
                msg = r.text
            raise GitHubError(f"{method} {url.split('/repos/')[-1]} -> {r.status_code}: {msg}")
        return r

    def verify_owner(self) -> str:
        """Only the repo owner, with push access, may connect."""
        me = self._req("GET", "https://api.github.com/user").json()["login"]
        if me.lower() != self.owner.lower():
            raise GitHubError(f"This token belongs to '{me}', not '{self.owner}'. Studio only accepts the owner's token.")
        repo = self._req("GET", self._url("")).json()
        if not repo.get("permissions", {}).get("push"):
            raise GitHubError("This token can't write to the repo. Give it Contents: Read and write.")
        return me

    def branch_exists(self, branch: str) -> bool:
        r = self.s.get(self._url(f"/branches/{urllib.parse.quote(branch)}"), timeout=20)
        if r.status_code == 404:
            return False
        if r.status_code != 200:
            raise GitHubError(f"Checking branch {branch} -> {r.status_code}")
        return True

    def get_json(self, branch: str, path: str):
        """Returns (data, sha) or (None, None) if the file doesn't exist."""
        r = self.s.get(self._url(f"/contents/{path}"), params={"ref": branch}, timeout=20)
        if r.status_code == 404:
            return None, None
        if r.status_code != 200:
            raise GitHubError(f"Reading {branch}:{path} -> {r.status_code}")
        body = r.json()
        raw = base64.b64decode(body["content"]).decode("utf-8")
        return json.loads(raw), body["sha"]

    def put_json(self, branch: str, path: str, data, sha: str | None, message: str) -> str:
        payload = {"message": message, "branch": branch,
                   "content": base64.b64encode(dumps(data).encode()).decode()}
        if sha:
            payload["sha"] = sha
        r = self._req("PUT", self._url(f"/contents/{path}"), json=payload)
        return r.json()["content"]["sha"]

    def get_bytes(self, branch: str, path: str):
        """Returns (bytes, sha) or (None, None). Works for files over 1 MB too."""
        r = self.s.get(self._url(f"/contents/{path}"), params={"ref": branch}, timeout=30)
        if r.status_code == 404:
            return None, None
        if r.status_code != 200:
            raise GitHubError(f"Reading {branch}:{path} -> {r.status_code}")
        sha = r.json()["sha"]
        raw = self.s.get(self._url(f"/contents/{path}"), params={"ref": branch}, timeout=60,
                         headers={"Accept": "application/vnd.github.raw+json"})
        if raw.status_code != 200:
            raise GitHubError(f"Downloading {branch}:{path} -> {raw.status_code}")
        return raw.content, sha

    def put_bytes(self, branch: str, path: str, data: bytes, message: str) -> None:
        """Upload a file unless GitHub already has exactly these bytes."""
        r = self.s.get(self._url(f"/contents/{path}"), params={"ref": branch}, timeout=30)
        sha = r.json().get("sha") if r.status_code == 200 else None
        if sha == git_blob_sha(data):
            return
        payload = {"message": message, "branch": branch, "content": base64.b64encode(data).decode()}
        if sha:
            payload["sha"] = sha
        self._req("PUT", self._url(f"/contents/{path}"), json=payload)

    def replace_branch(self, branch: str, files: dict[str, object], message: str) -> None:
        """Make `branch` a single parentless commit holding exactly `files`."""
        tree = []
        for path, data in files.items():
            blob = self._req("POST", self._url("/git/blobs"), json={"content": dumps(data), "encoding": "utf-8"}).json()
            tree.append({"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        t = self._req("POST", self._url("/git/trees"), json={"tree": tree}).json()
        c = self._req("POST", self._url("/git/commits"), json={"message": message, "tree": t["sha"], "parents": []}).json()
        r = self.s.patch(self._url(f"/git/refs/heads/{branch}"), json={"sha": c["sha"], "force": True}, timeout=20)
        if r.status_code in (404, 422):
            self._req("POST", self._url("/git/refs"), json={"ref": f"refs/heads/{branch}", "sha": c["sha"]})
        elif r.status_code != 200:
            raise GitHubError(f"Updating {branch} -> {r.status_code}: {r.text[:200]}")

    def dispatch(self, workflow: str, ref: str) -> None:
        self._req("POST", self._url(f"/actions/workflows/{workflow}/dispatches"), json={"ref": ref})

    def latest_run(self, workflow: str):
        runs = self._req("GET", self._url(f"/actions/workflows/{workflow}/runs"), params={"per_page": 1}).json()
        return (runs.get("workflow_runs") or [None])[0]


# --------------------------------------------------------------------------- Apple Music

class NowPlayingReader:
    """Reads the current track from Apple Music on this computer."""

    def __init__(self):
        self.system = platform.system()
        self._mc = None
        if self.system == "Windows":
            for mod in ("winrt.windows.media.control", "winsdk.windows.media.control"):
                try:
                    self._mc = __import__(mod, fromlist=["GlobalSystemMediaTransportControlsSessionManager"])
                    break
                except ImportError:
                    continue

    @property
    def supported(self) -> bool:
        return self.system == "Darwin" or self._mc is not None

    def why_unsupported(self) -> str:
        if self.system == "Windows":
            return "Install the Windows media package: pip install -r requirements.txt"
        return "Now playing works on Windows (Apple Music app) and macOS (Music app)."

    def read(self):
        """Returns {'isPlaying', 'title', 'artist', 'album'} or None if nothing is open."""
        if self.system == "Darwin":
            return self._read_mac()
        if self._mc is not None:
            return asyncio.run(self._read_windows())
        return None

    def _read_mac(self):
        script = ('if application "Music" is running then\n'
                  'tell application "Music"\n'
                  'if player state is stopped then return "stopped"\n'
                  'return (player state as text) & "\\n" & name of current track & "\\n" & artist of current track & "\\n" & album of current track\n'
                  'end tell\nend if\nreturn "stopped"')
        out = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=10).stdout.strip()
        if not out or out == "stopped":
            return None
        state, title, artist, album = (out.split("\n") + ["", "", "", ""])[:4]
        return {"isPlaying": state == "playing", "title": title, "artist": artist, "album": album}

    async def _read_windows(self):
        mgr = await self._mc.GlobalSystemMediaTransportControlsSessionManager.request_async()
        sessions = [s for s in mgr.get_sessions() if any(k in (s.source_app_user_model_id or "").lower() for k in ("applemusic", "itunes"))]
        if not sessions:
            return None
        s = sessions[0]
        props = await s.try_get_media_properties_async()
        playing = int(s.get_playback_info().playback_status) == 4  # 4 = Playing
        return {"isPlaying": playing, "title": props.title or "", "artist": props.artist or "", "album": props.album_title or ""}


_art_cache: dict[str, tuple[str, str]] = {}


def lookup_track(title: str, artist: str) -> tuple[str, str]:
    """Album art and Apple Music link from Apple's public search API (no login)."""
    key = f"{artist}|{title}".lower()
    if key in _art_cache:
        return _art_cache[key]
    art, url = "", ""
    try:
        r = requests.get("https://itunes.apple.com/search",
                         params={"term": f"{artist} {title}", "entity": "song", "limit": 1}, timeout=10)
        hit = (r.json().get("results") or [None])[0]
        if hit:
            art = (hit.get("artworkUrl100") or "").replace("100x100bb", "600x600bb")
            url = hit.get("trackViewUrl") or ""
    except (requests.RequestException, ValueError):
        pass
    _art_cache[key] = (art, url)
    return art, url


# --------------------------------------------------------------------------- local preview

class Preview:
    """Runs the real site from a local copy of the repo, using your draft content."""

    def __init__(self, settings: dict, log):
        self.settings, self.log = settings, log
        self.proc: subprocess.Popen | None = None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.settings['preview_port']}/"

    @property
    def running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def _run(self, *cmd, cwd=None):
        self.log("$ " + " ".join(cmd))
        r = subprocess.run(list(cmd), cwd=cwd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout).strip()[-1500:] or f"{cmd[0]} failed")
        return r.stdout

    def check_tools(self):
        missing = [t for t in ("git", "bun") if shutil.which(t) is None]
        if missing:
            raise RuntimeError("Preview needs " + " and ".join(missing) + " installed and on your PATH. See the README.")

    def sync_code(self):
        """Clone or fast-forward the site code (public repo, no token needed)."""
        s = self.settings
        repo_url = f"https://github.com/{s['owner']}/{s['repo']}.git"
        if not (SITE_DIR / ".git").exists():
            SITE_DIR.parent.mkdir(parents=True, exist_ok=True)
            self._run("git", "clone", "--depth", "1", "--branch", s["site_branch"], repo_url, str(SITE_DIR))
        else:
            self._run("git", "-C", str(SITE_DIR), "fetch", "--depth", "1", "origin", s["site_branch"])
            self._run("git", "-C", str(SITE_DIR), "reset", "--hard", f"origin/{s['site_branch']}")
        lock = SITE_DIR / "bun.lock"
        stamp = SITE_DIR / "node_modules" / ".studio-lock"
        lock_hash = hashlib.sha256(lock.read_bytes()).hexdigest() if lock.exists() else "none"
        if not stamp.exists() or stamp.read_text() != lock_hash:
            self._run("bun", "install", cwd=str(SITE_DIR))
            stamp.parent.mkdir(exist_ok=True)
            stamp.write_text(lock_hash)

    def validate(self, path: Path) -> str:
        script = SITE_DIR / "tools" / "content" / "validate.ts"
        if not script.exists():
            return "Skipped validation (tools/content/validate.ts isn't in the repo yet)."
        r = subprocess.run(["bun", str(script), str(path)], cwd=str(SITE_DIR), capture_output=True, text=True)
        if r.returncode != 0:
            raise ValueError((r.stderr or r.stdout).strip())
        return r.stdout.strip()

    def write_content(self, data: dict) -> str:
        target = SITE_DIR / "src" / "config" / "default.json"
        tmp = HOME / "preview-check.json"
        save_json(tmp, data)
        msg = self.validate(tmp)
        save_json(target, data)  # the dev server hot-reloads this
        return msg

    def start(self):
        if self.running:
            return
        port = str(self.settings["preview_port"])
        flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        self.log(f"Starting preview on {self.url}")
        self.proc = subprocess.Popen(["bun", "run", "dev", "--host", "127.0.0.1", "--port", port, "--strictPort"],
                                     cwd=str(SITE_DIR), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     creationflags=flags, start_new_session=os.name != "nt")
        for _ in range(120):
            if self.proc.poll() is not None:
                raise RuntimeError(f"The preview server stopped. Is port {port} already in use?")
            try:
                if requests.get(self.url, timeout=1).status_code < 500:
                    return
            except requests.RequestException:
                pass
            time.sleep(0.5)
        raise RuntimeError("The preview server didn't start within 60 seconds.")

    def stop(self):
        if not self.running:
            return
        if os.name == "nt":
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(self.proc.pid)], capture_output=True)
        else:
            import signal
            try:
                os.killpg(self.proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        self.proc = None


# --------------------------------------------------------------------------- widgets

class TagEntry(ttk.Frame):
    """Comma-separated tags with a live chip preview."""

    def __init__(self, master, on_change=None):
        super().__init__(master, style="Panel.TFrame")
        self.var = tk.StringVar()
        self.entry = ttk.Entry(self, textvariable=self.var)
        self.entry.pack(fill="x")
        self.chips = tk.Frame(self, bg=PANEL)
        self.chips.pack(fill="x", pady=(6, 0))
        self.on_change = on_change
        self.var.trace_add("write", lambda *_: self._changed())

    def get(self) -> list[str]:
        seen, out = set(), []
        for t in (p.strip() for p in self.var.get().split(",")):
            if t and t.lower() not in seen:
                seen.add(t.lower())
                out.append(t)
        return out

    def set(self, tags):
        self.var.set(", ".join(tags or []))

    def _changed(self):
        for w in self.chips.winfo_children():
            w.destroy()
        for t in self.get():
            tk.Label(self.chips, text=t, bg="#2A2250", fg=TEXT, padx=10, pady=2, font=("Segoe UI", 9)).pack(side="left", padx=(0, 6))
        if self.on_change:
            self.on_change()


class ListEditor(ttk.Frame):
    """A master/detail editor for a list of records (posts, projects, jobs, skills)."""

    def __init__(self, master, app, path: list[str], fields, title_key: str, new_item, sort_key=None, extra=None):
        super().__init__(master, style="TFrame")
        self.app, self.path, self.fields, self.title_key = app, path, fields, title_key
        self.new_item, self.sort_key = new_item, sort_key
        self.index: int | None = None
        self.loading = False

        left = ttk.Frame(self, style="TFrame")
        left.pack(side="left", fill="y", padx=(0, 16))
        self.lb = tk.Listbox(left, width=34, height=22, bg=PANEL, fg=TEXT, selectbackground=PRIMARY,
                             highlightthickness=0, borderwidth=0, activestyle="none", font=("Segoe UI", 10))
        self.lb.pack(fill="y", expand=True)
        self.lb.bind("<<ListboxSelect>>", lambda e: self._select())
        bar = ttk.Frame(left, style="TFrame")
        bar.pack(fill="x", pady=(8, 0))
        ttk.Button(bar, text="Add", command=self._add).pack(side="left")
        ttk.Button(bar, text="Delete", command=self._delete).pack(side="left", padx=6)
        if not sort_key:
            ttk.Button(bar, text="↑", width=3, command=lambda: self._move(-1)).pack(side="left")
            ttk.Button(bar, text="↓", width=3, command=lambda: self._move(1)).pack(side="left", padx=4)

        self.form = ttk.Frame(self, style="Panel.TFrame", padding=18)
        self.form.pack(side="left", fill="both", expand=True)
        self.widgets = {}
        for row, (key, label, kind) in enumerate(fields):
            ttk.Label(self.form, text=label, style="Panel.TLabel").grid(row=row, column=0, sticky="nw", pady=6, padx=(0, 12))
            if kind == "multiline":
                w = tk.Text(self.form, height=9 if key == "body" else 4, wrap="word", bg=FIELD, fg=TEXT,
                            insertbackground=TEXT, relief="flat", font=("Segoe UI", 10), padx=8, pady=6)
                w.bind("<<Modified>>", lambda e, w=w: (w.edit_modified(False), self._changed()))
            elif kind == "tags":
                w = TagEntry(self.form, on_change=self._changed)
            elif kind == "int":
                w = ttk.Spinbox(self.form, from_=1, to=120, width=6, command=self._changed)
                w.bind("<KeyRelease>", lambda e: self._changed())
            else:
                w = ttk.Entry(self.form)
                w.bind("<KeyRelease>", lambda e: self._changed())
            w.grid(row=row, column=1, sticky="nsew", pady=6)
            self.widgets[key] = (w, kind)
        self.form.columnconfigure(1, weight=1)
        if extra:
            extra(self, len(fields))
        self.refresh()

    # data access
    def items(self) -> list:
        node = self.app.draft
        for p in self.path:
            node = node[p]
        return node

    def label(self, item) -> str:
        t = item.get(self.title_key) or "(untitled)"
        if "date" in item and item.get("date"):
            return f"{item['date'][:10]}  {t}"
        return t

    def refresh(self):
        if self.sort_key:
            self.items().sort(key=self.sort_key, reverse=True)
        self.lb.delete(0, "end")
        for it in self.items():
            self.lb.insert("end", self.label(it))
        if self.items():
            self.index = min(self.index or 0, len(self.items()) - 1)
            self.lb.selection_set(self.index)
            self._load(self.items()[self.index])
        else:
            self.index = None
            self._load({})

    def _select(self):
        sel = self.lb.curselection()
        if sel:
            self.index = sel[0]
            self._load(self.items()[self.index])

    def _load(self, item: dict):
        self.loading = True
        for key, (w, kind) in self.widgets.items():
            v = item.get(key, "")
            if kind == "multiline":
                w.delete("1.0", "end")
                w.insert("1.0", "\n".join(v) if isinstance(v, list) else str(v or ""))
            elif kind == "tags":
                w.set(v if isinstance(v, list) else [])
            else:
                w.delete(0, "end")
                w.insert(0, "" if v is None else str(v))
        self.loading = False

    def get_value(self, key):
        w, kind = self.widgets[key]
        if kind == "multiline":
            return w.get("1.0", "end").rstrip("\n")
        if kind == "tags":
            return w.get()
        return w.get().strip()

    def _changed(self):
        if self.loading or self.index is None:
            return
        item = self.items()[self.index]
        for key, (w, kind) in self.widgets.items():
            v = self.get_value(key)
            if kind == "int":
                try:
                    v = int(v)
                except ValueError:
                    continue
            if kind == "multiline" and key == "highlights":
                v = [line for line in v.split("\n") if line.strip()]
            item[key] = v
        self.lb.delete(self.index)
        self.lb.insert(self.index, self.label(item))
        self.lb.selection_set(self.index)
        self.app.mark_dirty()

    def _add(self):
        self.items().insert(0, self.new_item())
        self.index = 0
        self.refresh()
        self.app.mark_dirty()

    def _delete(self):
        if self.index is None:
            return
        item = self.items()[self.index]
        if messagebox.askyesno(APP, f"Delete “{item.get(self.title_key) or 'this item'}”?"):
            self.items().pop(self.index)
            self.index = max(0, self.index - 1)
            self.refresh()
            self.app.mark_dirty()

    def _move(self, d: int):
        i, xs = self.index, self.items()
        if i is None or not (0 <= i + d < len(xs)):
            return
        xs[i], xs[i + d] = xs[i + d], xs[i]
        self.index = i + d
        self.refresh()
        self.app.mark_dirty()


# --------------------------------------------------------------------------- app

class Studio(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP)
        self.geometry("1180x820")
        self.minsize(980, 640)
        self.configure(bg=BG)
        HOME.mkdir(parents=True, exist_ok=True)
        self.settings = {**DEFAULT_SETTINGS, **load_json(SETTINGS_FILE, {})}
        self.sync = load_json(STATE_FILE, {})  # remote shas and fingerprints
        self.draft: dict = ensure_shape(load_json(DRAFT_FILE, {}))
        self.gh: GitHub | None = None
        self.preview = Preview(self.settings, self.log)
        self.np_reader = NowPlayingReader()
        self.np_on = False
        self.np_last = None
        self.busy = False
        self._ui_q: queue.Queue = queue.Queue()
        self._drain_ui()
        self._style()
        self._build()
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self.after(200, self.connect)
        self.after(120_000, self.periodic_sync)

    # ---------------------------------------------------------------- look
    def _style(self):
        s = ttk.Style(self)
        s.theme_use("clam")
        base = ("Segoe UI", 10)
        s.configure(".", background=BG, foreground=TEXT, fieldbackground=FIELD, font=base, bordercolor=PANEL)
        s.configure("TFrame", background=BG)
        s.configure("Panel.TFrame", background=PANEL)
        s.configure("TLabel", background=BG, foreground=TEXT)
        s.configure("Panel.TLabel", background=PANEL, foreground=MUTED)
        s.configure("Muted.TLabel", background=BG, foreground=MUTED)
        s.configure("H.TLabel", background=BG, foreground=TEXT, font=("Segoe UI Semibold", 15))
        s.configure("TButton", background=FIELD, foreground=TEXT, padding=(12, 6), borderwidth=0)
        s.map("TButton", background=[("active", "#2A2638")])
        s.configure("Accent.TButton", background=PRIMARY, foreground="#FFFFFF")
        s.map("Accent.TButton", background=[("active", "#6D28D9")])
        s.configure("TEntry", fieldbackground=FIELD, foreground=TEXT, insertcolor=TEXT, borderwidth=0, padding=6)
        s.configure("TSpinbox", fieldbackground=FIELD, foreground=TEXT, arrowcolor=TEXT, borderwidth=0)
        s.configure("TCheckbutton", background=PANEL, foreground=TEXT)
        s.map("TCheckbutton", background=[("active", PANEL)])
        s.configure("TNotebook", background=BG, borderwidth=0)
        s.configure("TNotebook.Tab", background=BG, foreground=MUTED, padding=(16, 8), borderwidth=0)
        s.map("TNotebook.Tab", background=[("selected", PANEL)], foreground=[("selected", TEXT)])

    def _build(self):
        top = ttk.Frame(self, padding=(18, 14))
        top.pack(fill="x")
        ttk.Label(top, text="Drayspo Studio", style="H.TLabel").pack(side="left")
        self.conn_lbl = ttk.Label(top, text="Not connected", style="Muted.TLabel")
        self.conn_lbl.pack(side="left", padx=16)
        ttk.Button(top, text="Publish", style="Accent.TButton", command=self.publish).pack(side="right")
        ttk.Button(top, text="Preview", command=self.open_preview).pack(side="right", padx=8)
        ttk.Button(top, text="Save draft to GitHub", command=self.push_draft).pack(side="right")
        ttk.Button(top, text="Pull latest", command=lambda: self.pull(force=True)).pack(side="right", padx=8)

        self.logbox = tk.Text(self, height=5, bg=PANEL, fg=MUTED, relief="flat", font=("Consolas", 9), padx=10, pady=6)
        self.logbox.pack(side="bottom", fill="x", padx=18, pady=(0, 14))
        bottom = ttk.Frame(self, padding=(18, 8))
        bottom.pack(side="bottom", fill="x")
        self.status = ttk.Label(bottom, text="", style="Muted.TLabel")
        self.status.pack(side="left")

        self.nb = ttk.Notebook(self)
        self.nb.pack(fill="both", expand=True, padx=18)
        self.tabs = {}
        for name in ("Profile", "Hero card", "Sections", "Thoughts", "Projects", "Experience", "Skills", "Music", "Resume", "Advanced"):
            f = ttk.Frame(self.nb, padding=16)
            self.nb.add(f, text=name)
            self.tabs[name] = f
        self.build_tabs()

    def build_tabs(self):
        for f in self.tabs.values():
            for w in f.winfo_children():
                w.destroy()
        self._profile_tab(self.tabs["Profile"])
        self._sections_tab(self.tabs["Sections"])
        today = lambda: dt.date.today().isoformat()
        ListEditor(self.tabs["Thoughts"], self, ["content", "thoughts"],
                   [("title", "Title", "text"), ("date", "Date (YYYY-MM-DD)", "text"),
                    ("readMinutes", "Minutes to read", "int"), ("tags", "Tags (comma separated)", "tags"),
                    ("excerpt", "Excerpt", "multiline"), ("body", "Post", "multiline")],
                   "title", lambda: {"id": f"post-{int(time.time())}", "title": "New thought", "date": today(),
                                     "excerpt": "", "body": "", "tags": [], "readMinutes": 1},
                   sort_key=lambda p: p.get("date", ""), extra=self._thought_extras).pack(fill="both", expand=True)
        ListEditor(self.tabs["Projects"], self, ["content", "projects"],
                   [("name", "Name", "text"), ("description", "Description", "multiline"),
                    ("tech", "Tech tags", "tags"), ("url", "Link", "text"), ("repo", "Repo", "text")],
                   "name", lambda: {"name": "New project", "description": "", "tech": [], "url": "", "repo": ""}).pack(fill="both", expand=True)
        ListEditor(self.tabs["Experience"], self, ["content", "experience"],
                   [("role", "Role", "text"), ("company", "Company", "text"), ("start", "Start", "text"),
                    ("end", "End", "text"), ("highlights", "Highlights (one per line)", "multiline")],
                   "role", lambda: {"company": "", "role": "New role", "start": "", "end": "Present", "highlights": []}).pack(fill="both", expand=True)
        ListEditor(self.tabs["Skills"], self, ["content", "skills"],
                   [("category", "Category", "text"), ("items", "Skills (comma separated)", "tags")],
                   "category", lambda: {"category": "New category", "items": []}).pack(fill="both", expand=True)
        self._music_tab(self.tabs["Music"])
        self._resume_tab(self.tabs["Resume"])
        self._hero_tab(self.tabs["Hero card"])
        self._advanced_tab(self.tabs["Advanced"])
        self.update_status()

    def _thought_extras(self, editor: ListEditor, row: int):
        def est():
            n = estimate_minutes(editor.get_value("body"))
            w, _ = editor.widgets["readMinutes"]
            w.delete(0, "end")
            w.insert(0, str(n))
            editor._changed()

        def fix_id():
            if editor.index is None:
                return
            item = editor.items()[editor.index]
            item["id"] = f"{item.get('date', '')[:10]}-{slugify(item.get('title', ''))}".strip("-")
            self.mark_dirty()
            self.log(f"Post link set to #thoughts/{item['id']}")

        bar = ttk.Frame(editor.form, style="Panel.TFrame")
        bar.grid(row=row, column=1, sticky="w", pady=(10, 0))
        ttk.Button(bar, text="Estimate minutes from post", command=est).pack(side="left")
        ttk.Button(bar, text="Set link from title", command=fix_id).pack(side="left", padx=8)

    def _field(self, parent, row, label, getter, setter, multiline=False):
        ttk.Label(parent, text=label, style="Panel.TLabel").grid(row=row, column=0, sticky="nw", pady=6, padx=(0, 12))
        if multiline:
            w = tk.Text(parent, height=7, wrap="word", bg=FIELD, fg=TEXT, insertbackground=TEXT, relief="flat",
                        font=("Segoe UI", 10), padx=8, pady=6)
            w.insert("1.0", getter())

            def on_mod(e):
                w.edit_modified(False)
                setter(w.get("1.0", "end").rstrip("\n"))
                self.mark_dirty()
            w.bind("<<Modified>>", on_mod)
            w.edit_modified(False)
        else:
            var = tk.StringVar(value=getter())
            w = ttk.Entry(parent, textvariable=var)
            var.trace_add("write", lambda *_: (setter(var.get()), self.mark_dirty()))
        w.grid(row=row, column=1, sticky="ew", pady=6)
        return w

    def _profile_tab(self, f):
        p = ttk.Frame(f, style="Panel.TFrame", padding=18)
        p.pack(fill="both", expand=True)
        c = self.draft["content"]
        for i, (k, label) in enumerate([("name", "Name"), ("title", "Title"), ("tagline", "Tagline"),
                                        ("location", "Location"), ("email", "Email")]):
            self._field(p, i, label, lambda k=k: c.get(k, ""), lambda v, k=k: c.__setitem__(k, v))
        self._field(p, 5, "About", lambda: c.get("about", ""), lambda v: c.__setitem__("about", v), multiline=True)
        colors = self.draft.get("theme", {}).get("colors", {})
        ttk.Label(p, text="Theme colors", style="Panel.TLabel").grid(row=6, column=0, sticky="nw", pady=10)
        row = ttk.Frame(p, style="Panel.TFrame")
        row.grid(row=6, column=1, sticky="w", pady=10)
        for key in ("primary", "secondary", "accent", "background", "text"):
            if key not in colors:
                continue
            btn = tk.Button(row, text=key, bg=colors[key], fg="#FFFFFF" if key != "text" else BG, relief="flat",
                            padx=12, pady=4, activebackground=colors[key])

            def pick(key=key, btn=btn):
                rgb, hx = colorchooser.askcolor(color=colors[key], title=f"{key} color")
                if hx:
                    colors[key] = hx.upper()
                    btn.configure(bg=hx, activebackground=hx)
                    self.mark_dirty()
            btn.configure(command=pick)
            btn.pack(side="left", padx=(0, 8))
        p.columnconfigure(1, weight=1)

    def _sections_tab(self, f):
        layout = self.draft["layout"]
        order = layout["sectionOrder"]
        p = ttk.Frame(f, style="Panel.TFrame", padding=18)
        p.pack(fill="both", expand=True)
        ttk.Label(p, text="Order and visibility of the sections on the page.", style="Panel.TLabel").pack(anchor="w", pady=(0, 12))
        box = ttk.Frame(p, style="Panel.TFrame")
        box.pack(anchor="w")

        def redraw():
            for w in box.winfo_children():
                w.destroy()
            for i, sid in enumerate(order):
                r = ttk.Frame(box, style="Panel.TFrame")
                r.pack(fill="x", pady=3)
                var = tk.BooleanVar(value=sid not in layout["hiddenSections"])

                def toggle(sid=sid, var=var):
                    hs = layout["hiddenSections"]
                    if var.get() and sid in hs:
                        hs.remove(sid)
                    elif not var.get() and sid not in hs:
                        hs.append(sid)
                    self.mark_dirty()
                ttk.Checkbutton(r, text=SECTION_LABELS.get(sid, sid), variable=var, command=toggle, width=16).pack(side="left")

                def mv(i=i, d=-1):
                    j = i + d
                    if 0 <= j < len(order):
                        order[i], order[j] = order[j], order[i]
                        self.mark_dirty()
                        redraw()
                ttk.Button(r, text="↑", width=3, command=lambda i=i: mv(i, -1)).pack(side="left", padx=4)
                ttk.Button(r, text="↓", width=3, command=lambda i=i: mv(i, 1)).pack(side="left")
        redraw()

    def _music_tab(self, f):
        m = self.draft["content"]["music"]
        p = ttk.Frame(f, style="Panel.TFrame", padding=18)
        p.pack(fill="both", expand=True)
        self._field(p, 0, "Playlist link", lambda: m.get("playlistUrl", ""), lambda v: m.__setitem__("playlistUrl", v.strip()))
        self._field(p, 1, "Playlist name", lambda: m.get("playlistName", ""), lambda v: m.__setitem__("playlistName", v))
        ttk.Label(p, text="Paste a playlist link from Apple Music (Share › Copy Link).", style="Panel.TLabel").grid(row=2, column=1, sticky="w")
        ttk.Label(p, text="Now playing", style="Panel.TLabel").grid(row=3, column=0, sticky="nw", pady=(24, 6))
        np = ttk.Frame(p, style="Panel.TFrame")
        np.grid(row=3, column=1, sticky="ew", pady=(24, 6))
        self.np_btn = ttk.Button(np, text="Start syncing Apple Music", style="Accent.TButton", command=self.toggle_now_playing)
        self.np_btn.pack(anchor="w")
        self.np_lbl = ttk.Label(np, text="Off. Visitors see “Not listening right now”.", style="Panel.TLabel")
        self.np_lbl.pack(anchor="w", pady=(8, 0))
        if not self.np_reader.supported:
            self.np_btn.state(["disabled"])
            self.np_lbl.configure(text=self.np_reader.why_unsupported())
        s = self.settings
        url = f"https://raw.githubusercontent.com/{s['owner']}/{s['repo']}/{s['now_playing_branch']}/now-playing.json"
        if m.get("nowPlayingUrl") != url:
            m["nowPlayingUrl"] = url
        ttk.Label(p, text="Songs go live within a few minutes without rebuilding the site. Only the current\n"
                          "song is kept, so your listening history isn't stored.", style="Panel.TLabel").grid(row=4, column=1, sticky="w", pady=(10, 0))
        p.columnconfigure(1, weight=1)

    # ---------------------------------------------------------------- hero card
    def holo(self) -> dict:
        h = self.draft["content"].setdefault("holo", {})
        for k, v in (("photoUrl", "/dray-profile.png"), ("cutout", False), ("label", "Drayspo · ID"),
                     ("stamp", "KY · 2025"), ("credential", "BSc CS · CAPM")):
            h.setdefault(k, v)
        return h

    def photo_file(self) -> Path | None:
        """The local draft photo the hero card points at, if it's one Studio manages."""
        m = re.match(r"^/media/(holo-photo\.(?:png|jpg|webp))", self.holo().get("photoUrl", ""))
        return PHOTO_DIR / m.group(1) if m else None

    def _hero_tab(self, f):
        h = self.holo()
        p = ttk.Frame(f, style="Panel.TFrame", padding=18)
        p.pack(fill="both", expand=True)
        for i, (k, label) in enumerate([("label", "Top left label"), ("stamp", "Top right stamp"), ("credential", "Credential badge")]):
            self._field(p, i, label, lambda k=k: h.get(k, ""), lambda v, k=k: h.__setitem__(k, v))
        ttk.Label(p, text="Photo", style="Panel.TLabel").grid(row=3, column=0, sticky="nw", pady=(18, 6))
        box = ttk.Frame(p, style="Panel.TFrame")
        box.grid(row=3, column=1, sticky="w", pady=(18, 6))
        self.photo_info = ttk.Label(box, text="", style="Panel.TLabel", justify="left")
        self.photo_info.pack(anchor="w")
        bar = ttk.Frame(box, style="Panel.TFrame")
        bar.pack(anchor="w", pady=(10, 0))
        ttk.Button(bar, text="Choose photo…", style="Accent.TButton", command=self.choose_photo).pack(side="left")
        self.cutout_var = tk.BooleanVar(value=bool(h.get("cutout")))

        def set_cutout():
            h["cutout"] = self.cutout_var.get()
            self.mark_dirty()
        ttk.Checkbutton(bar, text="Transparent cutout (no background)", variable=self.cutout_var,
                        command=set_cutout).pack(side="left", padx=12)
        ttk.Label(p, text="PNG, JPG or WebP, up to 6 MB. A PNG with a transparent background is detected as a cutout.\n"
                          "Like everything else, the new photo goes live when you Publish.",
                  style="Panel.TLabel").grid(row=4, column=1, sticky="w", pady=(10, 0))
        p.columnconfigure(1, weight=1)
        self.refresh_photo_info()

    def refresh_photo_info(self):
        if not hasattr(self, "photo_info"):
            return
        f = self.photo_file()
        if f and f.exists():
            self.photo_info.configure(text=f"Using your uploaded photo ({f.stat().st_size // 1024} KB).")
        else:
            self.photo_info.configure(text=f"Using the site's photo: {self.holo().get('photoUrl')}")

    def choose_photo(self):
        path = filedialog.askopenfilename(title="Choose your hero photo",
                                          filetypes=[("Images", "*.png *.jpg *.jpeg *.webp")])
        if not path:
            return
        data = Path(path).read_bytes()
        ext = next((e for sig, e in PHOTO_TYPES.items() if data.startswith(sig)), None)
        if ext == ".webp" and data[8:12] != b"WEBP":
            ext = None
        if not ext:
            return messagebox.showerror(APP, "That file isn't a PNG, JPG or WebP image.")
        if len(data) > MAX_PHOTO:
            return messagebox.showerror(APP, "That photo is over 6 MB. Export a smaller version (about 1200 px tall is plenty).")
        PHOTO_DIR.mkdir(parents=True, exist_ok=True)
        for old in PHOTO_DIR.glob("holo-photo.*"):
            old.unlink()
        (PHOTO_DIR / f"holo-photo{ext}").write_bytes(data)
        h = self.holo()
        h["photoUrl"] = f"/media/holo-photo{ext}?v={resume_pdf.short_hash(data)}"
        # PNG colour type 6 (RGBA) or 4 (grey + alpha) means it has transparency.
        h["cutout"] = ext == ".png" and len(data) > 25 and data[25] in (4, 6)
        self.cutout_var.set(h["cutout"])
        self.mark_dirty()
        self.refresh_photo_info()
        self.log(f"New hero photo ready ({Path(path).name}{', cutout' if h['cutout'] else ''}). Preview it, then Publish.")

    def site_assets(self) -> list[tuple[str, bytes]]:
        """Files the draft needs on the site: (path under public/, bytes)."""
        out = []
        if RESUME_DRAFT.exists():
            out.append(("resume.pdf", RESUME_DRAFT.read_bytes()))
        f = self.photo_file()
        if f and f.exists():
            out.append((f"media/{f.name}", f.read_bytes()))
        return out

    # ---------------------------------------------------------------- resume
    def owner_name(self) -> str:
        return (self.draft.get("content", {}).get("name") or "").strip() or OWNER_NAME

    def adopt_resume(self, data: bytes, source: str | None):
        """Store a resume as the local draft. The site's original gets cleaned on first run."""
        if source == "site":
            try:
                data = resume_pdf.clean_resume(data, self.owner_name())
                self.log("Cleaned the site's resume: title set to your name, Word and work labels removed.")
            except resume_pdf.ResumeError as e:
                self.log(f"Kept the site's resume as it is: {e}")
        RESUME_DRAFT.write_bytes(data)
        self.point_link_at(data)

    def point_link_at(self, data: bytes):
        """Point the resume link at this exact version, so browsers never serve an old copy."""
        link = find_resume_link(self.draft)
        if link is None:
            link = {"label": "Resume PDF", "url": ""}
            self.draft["content"].setdefault("links", []).append(link)
        url = f"/resume.pdf?v={resume_pdf.short_hash(data)}"
        if link.get("url") != url:
            link["url"] = url
            self.mark_dirty()

    def _resume_tab(self, f):
        p = ttk.Frame(f, style="Panel.TFrame", padding=18)
        p.pack(fill="both", expand=True)
        ttk.Label(p, text="The PDF visitors download. It's always saved as “<your name>-Resume.pdf”, and its title is set to your name.",
                  style="Panel.TLabel").pack(anchor="w")
        self.resume_info = ttk.Label(p, text="", style="Panel.TLabel", justify="left")
        self.resume_info.pack(anchor="w", pady=(14, 14))
        bar = ttk.Frame(p, style="Panel.TFrame")
        bar.pack(anchor="w")
        ttk.Button(bar, text="Choose new resume PDF…", style="Accent.TButton", command=self.choose_resume).pack(side="left")
        ttk.Button(bar, text="Open draft resume", command=self.open_resume).pack(side="left", padx=8)
        ttk.Label(p, text="New resumes are a draft until you Publish. Preview shows the draft.",
                  style="Panel.TLabel").pack(anchor="w", pady=(14, 0))
        self.refresh_resume_info()

    def refresh_resume_info(self):
        if not hasattr(self, "resume_info"):
            return
        if not RESUME_DRAFT.exists():
            self.resume_info.configure(text="No resume yet. Connect to GitHub to load the current one, or choose a PDF.")
            return
        try:
            info = resume_pdf.inspect(RESUME_DRAFT.read_bytes())
        except Exception as e:
            self.resume_info.configure(text=f"The draft resume can't be read: {e}")
            return
        name = self.owner_name()
        found = name.split()[-1].lower() in info["text"].lower()
        file_name = re.sub(r"\s+", "-", re.sub(r"[^A-Za-z0-9\s-]", "", name).strip()) + "-Resume.pdf"
        self.resume_info.configure(text=(
            f"Title: {info['title'] or '(none)'}\n"
            f"Pages: {info['pages']}   ·   Size: {info['bytes'] // 1024} KB\n"
            f"Downloads as: {file_name}\n"
            f"{'✓ Your name appears in the resume' if found else '⚠ Your name was not found in the text'}"))

    def choose_resume(self):
        path = filedialog.askopenfilename(title="Choose your resume", filetypes=[("PDF files", "*.pdf")])
        if not path:
            return
        try:
            data = resume_pdf.clean_resume(Path(path).read_bytes(), self.owner_name())
        except resume_pdf.ResumeError as e:
            return messagebox.showerror(APP, str(e))
        except Exception as e:
            return messagebox.showerror(APP, f"That PDF couldn't be read: {e}")
        RESUME_DRAFT.write_bytes(data)
        self.point_link_at(data)
        self.refresh_resume_info()
        self.log(f"New resume ready ({Path(path).name}). Preview it, then Publish.")

    def open_resume(self):
        if not RESUME_DRAFT.exists():
            return
        if os.name == "nt":
            os.startfile(RESUME_DRAFT)  # type: ignore[attr-defined]
        else:
            webbrowser.open(RESUME_DRAFT.as_uri())

    def _advanced_tab(self, f):
        ttk.Label(f, text="Everything in one place. Edit carefully. Preview checks it before anything can ship.",
                  style="Muted.TLabel").pack(anchor="w", pady=(0, 8))
        self.raw = tk.Text(f, wrap="none", bg=PANEL, fg=TEXT, insertbackground=TEXT, relief="flat",
                           font=("Consolas", 10), padx=10, pady=8)
        self.raw.pack(fill="both", expand=True)
        self.raw.insert("1.0", dumps(self.draft))
        bar = ttk.Frame(f)
        bar.pack(fill="x", pady=(8, 0))

        def apply():
            try:
                data = json.loads(self.raw.get("1.0", "end"))
            except ValueError as e:
                messagebox.showerror(APP, f"That isn't valid JSON:\n{e}")
                return
            self.draft = ensure_shape(data)
            self.mark_dirty()
            self.build_tabs()
            self.nb.select(self.tabs["Advanced"])
        ttk.Button(bar, text="Apply JSON", command=apply).pack(side="left")

    # ---------------------------------------------------------------- state
    def ui(self, fn):
        """Run fn on the UI thread. Safe to call from any thread."""
        self._ui_q.put(fn)

    def _drain_ui(self):
        try:
            while True:
                self._ui_q.get_nowait()()
        except queue.Empty:
            pass
        self.after(50, self._drain_ui)

    def log(self, msg: str):
        def w():
            self.logbox.insert("end", f"{time.strftime('%H:%M:%S')}  {msg}\n")
            self.logbox.see("end")
        self.ui(w)

    def mark_dirty(self):
        save_json(DRAFT_FILE, self.draft)
        self.update_status()

    def update_status(self):
        fp = fingerprint(self.draft)
        parts = []
        parts.append("Draft saved on GitHub" if fp == self.sync.get("remote_draft_fp") else "Draft has changes not saved to GitHub")
        parts.append("matches the live site" if fp == self.sync.get("live_fp") else "differs from the live site")
        if self.preview.running:
            parts.append(f"preview at {self.preview.url}")
        self.status.configure(text="  ·  ".join(parts))

    def save_state(self):
        save_json(STATE_FILE, self.sync)

    def run_bg(self, label: str, fn, done=None):
        """Run network or build work off the UI thread."""
        if self.busy:
            messagebox.showinfo(APP, "Still working on the last action. Give it a moment.")
            return
        self.busy = True
        self.configure(cursor="watch")
        self.log(label + "…")

        def worker():
            try:
                result = fn()
                err = None
            except Exception as e:  # shown to you, never swallowed
                result, err = None, e

            def finish():
                self.busy = False
                self.configure(cursor="")
                if err:
                    self.log(f"Error: {err}")
                    messagebox.showerror(APP, str(err))
                elif done:
                    done(result)
                self.update_status()
            self.ui(finish)
        threading.Thread(target=worker, daemon=True).start()

    # ---------------------------------------------------------------- connect & sync
    def connect(self):
        s = self.settings
        token = keyring.get_password(KEYRING_SERVICE, f"{s['owner']}/{s['repo']}")
        if not token:
            token = simpledialog.askstring(
                APP, f"Paste your GitHub fine-grained token for {s['owner']}/{s['repo']}.\n\n"
                     "Repository access: only this repo.\nPermissions: Contents (read and write), Actions (read and write).\n\n"
                     "It's stored in your system keychain, not in a file.", show="•", parent=self)
            if not token:
                self.conn_lbl.configure(text="Not connected. Editing locally only.")
                return
        gh = GitHub(token.strip(), s["owner"], s["repo"])

        def go():
            login = gh.verify_owner()
            keyring.set_password(KEYRING_SERVICE, f"{s['owner']}/{s['repo']}", token.strip())
            return login

        def ok(login):
            self.gh = gh
            self.conn_lbl.configure(text=f"Connected as {login} to {s['owner']}/{s['repo']}")
            self.pull(force=False)

        def fail_wrap():
            try:
                return go()
            except GitHubError:
                keyring_delete()
                raise

        def keyring_delete():
            try:
                keyring.delete_password(KEYRING_SERVICE, f"{s['owner']}/{s['repo']}")
            except Exception:
                pass
        self.run_bg("Connecting to GitHub", fail_wrap, ok)

    def _fetch_remote(self):
        """Read draft and live from the content branch, creating it on first run."""
        gh, s = self.gh, self.settings
        if not gh.branch_exists(s["content_branch"]):
            seed, _ = gh.get_json(s["site_branch"], "src/config/default.json")
            if seed is None:
                raise GitHubError("Couldn't find src/config/default.json on main to start from.")
            seed = ensure_shape(seed)
            gh.replace_branch(s["content_branch"], {"content/draft.json": seed, "content/live.json": seed},
                              "Start content branch from the current site")
            self.log("Created the content branch from the current site.")
        draft, dsha = gh.get_json(s["content_branch"], "content/draft.json")
        live, lsha = gh.get_json(s["content_branch"], "content/live.json")
        site_default, _ = gh.get_json(s["site_branch"], "src/config/default.json")
        resume, source = None, None
        for branch, path, src in ((s["content_branch"], RESUME_DRAFT_PATH, "draft"),
                                  (s["content_branch"], RESUME_LIVE_PATH, "live"),
                                  (s["site_branch"], "public/resume.pdf", "site")):
            resume, _ = gh.get_bytes(branch, path)
            if resume:
                source = src
                break
        photo = None
        m = re.match(r"^/media/(holo-photo\.(?:png|jpg|webp))", ((draft or {}).get("content", {}).get("holo") or {}).get("photoUrl", ""))
        if m and not (PHOTO_DIR / m.group(1)).exists():
            blob, _ = gh.get_bytes(s["content_branch"], f"content/{m.group(1)}")
            if blob:
                photo = (m.group(1), blob)
        return draft, dsha, live, lsha, site_default, (resume, source), photo

    def pull(self, force: bool):
        if not self.gh:
            return messagebox.showinfo(APP, "Connect to GitHub first.")
        local_changes = fingerprint(self.draft) != self.sync.get("remote_draft_fp") and DRAFT_FILE.exists()

        def done(res):
            draft, dsha, live, lsha, site_default, (resume, source), photo = res
            if photo:
                PHOTO_DIR.mkdir(parents=True, exist_ok=True)
                (PHOTO_DIR / photo[0]).write_bytes(photo[1])
            self.sync.update({"draft_sha": dsha, "live_sha": lsha,
                               "remote_draft_fp": fingerprint(ensure_shape(copy.deepcopy(draft))) if draft else None,
                               "live_fp": fingerprint(ensure_shape(copy.deepcopy(live))) if live else None})
            self.save_state()
            if draft is None:
                return
            if site_default:
                if local_changes and not force:
                    added = merge_missing(self.draft, site_default)
                else:
                    added = merge_missing(draft, site_default)
                if added:
                    self.log("New from the site's code: " + ", ".join(added))
                    target = self.draft if (local_changes and not force) else draft
                    new_sections = [a.split(" ", 1)[1] for a in added if a.startswith("section ")]
                    if new_sections:
                        names = ", ".join(SECTION_LABELS.get(x, x) for x in new_sections)
                        if messagebox.askyesno(APP, f"Your site has new sections: {names}.\n\nShow them on the page? "
                                                    "(You can change this any time in the Sections tab.)"):
                            hidden = target["layout"]["hiddenSections"]
                            target["layout"]["hiddenSections"] = [x for x in hidden if x not in new_sections]
                    if local_changes and not force:
                        self.mark_dirty()
                        self.build_tabs()
            if local_changes and not force:
                if resume and not RESUME_DRAFT.exists():
                    self.adopt_resume(resume, source)
                self.log("You have local changes, so the GitHub draft wasn't loaded. Use Pull latest to replace them.")
                return
            if local_changes and force and not messagebox.askyesno(APP, "Replace your local changes with the draft on GitHub?"):
                return
            self.draft = ensure_shape(draft)
            save_json(DRAFT_FILE, self.draft)
            if resume:
                self.adopt_resume(resume, source)  # the site's original is cleaned on first run
            self.build_tabs()
            self.log("Loaded the latest draft from GitHub.")
        self.run_bg("Checking GitHub for the latest content", self._fetch_remote, done)

    def periodic_sync(self):
        """Every 2 minutes, pick up edits made elsewhere (only when you have none here)."""
        if self.gh and not self.busy and fingerprint(self.draft) == self.sync.get("remote_draft_fp"):
            self.pull(force=False)
        self.after(120_000, self.periodic_sync)

    def push_draft(self):
        if not self.gh:
            return messagebox.showinfo(APP, "Connect to GitHub first.")
        s, data = self.settings, copy.deepcopy(self.draft)
        f = self.photo_file()
        photo = (f.name, f.read_bytes()) if f and f.exists() else None

        def go():
            if RESUME_DRAFT.exists():
                self.gh.put_bytes(s["content_branch"], RESUME_DRAFT_PATH, RESUME_DRAFT.read_bytes(), "Update draft resume from Studio")
            if photo:
                self.gh.put_bytes(s["content_branch"], f"content/{photo[0]}", photo[1], "Update draft photo from Studio")
            _, sha = self.gh.get_json(s["content_branch"], "content/draft.json")
            return self.gh.put_json(s["content_branch"], "content/draft.json", data, sha, "Update draft from Studio")

        def done(sha):
            self.sync.update({"draft_sha": sha, "remote_draft_fp": fingerprint(data)})
            self.save_state()
            self.log("Draft saved to GitHub. It's not live until you Publish.")
        self.run_bg("Saving draft to GitHub", go, done)

    # ---------------------------------------------------------------- preview & publish
    def open_preview(self):
        data = copy.deepcopy(self.draft)
        assets = self.site_assets()

        def go():
            self.preview.check_tools()
            if not self.preview.running:
                self.preview.sync_code()
            msg = self.preview.write_content(data)
            for rel, blob in assets:
                target = SITE_DIR / "public" / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(blob)
            self.log(msg)
            self.preview.start()
            return self.preview.url

        def done(url):
            webbrowser.open(url)
            self.log(f"Preview open at {url}. Press Preview again after edits to refresh it.")
        self.run_bg("Preparing preview", go, done)

    def publish(self):
        if not self.gh:
            return messagebox.showinfo(APP, "Connect to GitHub first.")
        if not messagebox.askyesno(APP, "Publish your draft to drayspo.com?\n\nThis saves the draft, marks it live and starts the publish workflow."):
            return
        s, data = self.settings, copy.deepcopy(self.draft)
        assets = self.site_assets()

        def go():
            if RESUME_DRAFT.exists():
                pdf = RESUME_DRAFT.read_bytes()
                self.gh.put_bytes(s["content_branch"], RESUME_DRAFT_PATH, pdf, "Update draft resume from Studio")
                self.gh.put_bytes(s["content_branch"], RESUME_LIVE_PATH, pdf, "Publish resume from Studio")
                # Keep the repo itself showing the published resume: public/ for GitHub today,
                # the sync overlay so Lovable's copy never replaces it on the next sync.
                for path in ("public/resume.pdf", "tools/upstream-sync/overlay/public/resume.pdf"):
                    self.gh.put_bytes(s["site_branch"], path, pdf, "Update resume (published from Studio)")
            for rel, blob in assets:
                if not rel.startswith("media/"):
                    continue
                self.gh.put_bytes(s["content_branch"], f"content/{rel.split('/')[-1]}", blob, "Update draft photo from Studio")
                for path in (f"public/{rel}", f"tools/upstream-sync/overlay/public/{rel}"):
                    self.gh.put_bytes(s["site_branch"], path, blob, "Update hero photo (published from Studio)")
            _, dsha = self.gh.get_json(s["content_branch"], "content/draft.json")
            dsha = self.gh.put_json(s["content_branch"], "content/draft.json", data, dsha, "Update draft from Studio")
            _, lsha = self.gh.get_json(s["content_branch"], "content/live.json")
            lsha = self.gh.put_json(s["content_branch"], "content/live.json", data, lsha, "Publish from Studio")
            self.gh.dispatch(s["publish_workflow"], s["site_branch"])
            return dsha, lsha

        def done(res):
            fp = fingerprint(data)
            self.sync.update({"draft_sha": res[0], "live_sha": res[1], "remote_draft_fp": fp, "live_fp": fp})
            self.save_state()
            self.log("Publish started. It usually takes 1–2 minutes.")
            self.after(15_000, self.watch_publish)
        self.run_bg("Publishing", go, done)

    def watch_publish(self, tries: int = 0):
        def go():
            return self.gh.latest_run(self.settings["publish_workflow"])

        def done(run):
            if not run:
                return
            if run["status"] != "completed" and tries < 20:
                self.log(f"Publish is {run['status'].replace('_', ' ')}…")
                self.after(15_000, lambda: self.watch_publish(tries + 1))
            elif run["status"] == "completed":
                ok = run["conclusion"] == "success"
                self.log("drayspo.com is updated." if ok else f"Publish failed ({run['conclusion']}). Details: {run['html_url']}")
                if not ok:
                    messagebox.showerror(APP, f"The publish workflow failed.\n\n{run['html_url']}")
        if not self.busy:
            self.run_bg("Checking publish", go, done)
        else:
            self.after(5_000, lambda: self.watch_publish(tries))

    # ---------------------------------------------------------------- now playing
    def toggle_now_playing(self):
        if not self.gh:
            return messagebox.showinfo(APP, "Connect to GitHub first.")
        self.np_on = not self.np_on
        self.np_btn.configure(text="Stop syncing" if self.np_on else "Start syncing Apple Music")
        if self.np_on:
            threading.Thread(target=self._np_loop, daemon=True).start()
        else:
            threading.Thread(target=lambda: self._np_push({"isPlaying": False}), daemon=True).start()
            self.np_lbl.configure(text="Off. Visitors see “Not listening right now”.")

    def _np_push(self, payload: dict):
        payload = {"isPlaying": False, "title": "", "artist": "", "album": "", "artworkUrl": "", "url": "", **payload,
                   "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
        try:
            self.gh.replace_branch(self.settings["now_playing_branch"], {"now-playing.json": payload}, "Now playing")
            self.np_last = payload
        except Exception as e:
            self.log(f"Now playing update failed: {e}")

    def _np_loop(self):
        paused_since = None
        last_key = None
        last_beat = 0.0
        while self.np_on:
            try:
                t = self.np_reader.read()
            except Exception as e:
                self.log(f"Couldn't read Apple Music: {e}")
                t = None
            now = time.time()
            if t and t["isPlaying"] and t["title"]:
                paused_since = None
                key = (t["title"], t["artist"])
                if key != last_key or now - last_beat > 600:  # refresh every 10 min so it never looks stale
                    art, url = lookup_track(t["title"], t["artist"])
                    self._np_push({**t, "isPlaying": True, "artworkUrl": art, "url": url})
                    last_key, last_beat = key, now
                    self.ui(lambda t=t: self.np_lbl.configure(text=f"Live: {t['title']} · {t['artist']}"))
            else:
                paused_since = paused_since or now
                if last_key is not None and now - paused_since > 90:
                    self._np_push({"isPlaying": False})
                    last_key = None
                    self.ui(lambda: self.np_lbl.configure(text="Paused. Visitors see “Not listening right now”."))
            time.sleep(5)

    # ---------------------------------------------------------------- close
    def on_close(self):
        if self.np_on and self.gh:
            self.np_on = False
            self._np_push({"isPlaying": False})
        self.preview.stop()
        save_json(DRAFT_FILE, self.draft)
        self.destroy()


def main():
    if sys.version_info < (3, 10):
        print("Drayspo Studio needs Python 3.10 or newer.")
        sys.exit(1)
    Studio().mainloop()


if __name__ == "__main__":
    main()
