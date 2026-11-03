"""Resume PDF helpers for Drayspo Studio.

Word's "Save as PDF" stamps the document title as "Microsoft Word - <file>.docx" and can
carry work sensitivity labels (MSIP_*). Browsers and PDF viewers show that title in the
tab or title bar. `clean_resume` replaces all of it with your name, and checks that your
name actually appears in the resume before it can be used.
"""

from __future__ import annotations

import hashlib
import io
import re

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

MAX_BYTES = 10 * 1024 * 1024


class ResumeError(ValueError):
    pass


def _words(name: str) -> list[str]:
    return [w for w in re.findall(r"[A-Za-z]+", name) if len(w) > 1]


def inspect(data: bytes) -> dict:
    """Pages, title and whether the text mentions a name, without changing anything."""
    if not data.startswith(b"%PDF-"):
        raise ResumeError("That file isn't a PDF.")
    reader = PdfReader(io.BytesIO(data))
    info = reader.metadata or {}
    text = " ".join((p.extract_text() or "") for p in reader.pages)
    xmp = "/Metadata" in reader.trailer["/Root"]
    labels = [k for k in info.keys() if "MSIP" in k]
    return {"pages": len(reader.pages), "title": str(info.get("/Title", "") or ""), "text": text,
            "has_xmp": xmp, "labels": len(labels), "bytes": len(data)}


def clean_resume(data: bytes, name: str) -> bytes:
    """Return the same resume with clean metadata: title and author set to your name,
    the Word conversion title and work sensitivity labels removed."""
    if len(data) > MAX_BYTES:
        raise ResumeError("The resume is larger than 10 MB. Export it again with smaller images.")
    facts = inspect(data)
    surname = (_words(name) or ["McFarlane"])[-1]
    if surname.lower() not in facts["text"].lower():
        raise ResumeError(f"Your name ({surname}) doesn't appear in this PDF. Is it the right file?")

    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(data)))
    root = writer._root_object
    if NameObject("/Metadata") in root:  # embedded XMP copy of the old title and labels
        del root[NameObject("/Metadata")]
    writer._info = None  # drop the old document info entirely
    title = f"{name} — Resume"
    writer.add_metadata({"/Title": title, "/Author": name, "/Subject": "Resume", "/Creator": "Drayspo Studio"})
    # Tell viewers to show the title (not the file name) in their title bar.
    writer.viewer_preferences.display_doctitle = True  # type: ignore[union-attr]
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def short_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:10]
