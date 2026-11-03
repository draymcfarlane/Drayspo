/** Helpers for handing the visitor a real PDF file, not an error page. */

/** True only when the bytes really start with the PDF signature "%PDF-". */
export function isPdfBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const head = new Uint8Array(buffer.slice(0, 5));
  return String.fromCharCode(...head) === "%PDF-";
}

/** "Dray McFarlane" -> "Dray-McFarlane-Resume.pdf" */
export function resumeFileName(name: string): string {
  const clean = name
    .trim()
    .replace(/[^A-Za-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${clean || "Resume"}-Resume.pdf`;
}

/**
 * Fetch the resume and return it as a PDF blob.
 * Throws when the server hands back anything that is not a PDF — a plain-text
 * access-gate response, a login page, or a missing-file page.
 */
export async function loadResume(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: "same-origin", headers: { accept: "application/pdf" } });
  if (!res.ok) {
    throw new Error(`The resume could not be reached (status ${res.status}).`);
  }
  const buffer = await res.arrayBuffer();
  if (!isPdfBytes(buffer)) {
    throw new Error("The file that came back was not a PDF.");
  }
  return new Blob([buffer], { type: "application/pdf" });
}

// Triggers a browser download for a blob.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Share sheet on phones (offers "Save to Files"), plain download elsewhere. */
export async function deliverFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
    }
  }
  downloadBlob(blob, filename);
}
