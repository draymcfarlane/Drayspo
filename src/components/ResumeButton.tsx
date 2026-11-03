import { useCallback, useEffect, useRef, useState } from "react";
import { deliverFile, loadResume, resumeFileName } from "@/lib/resume";

/**
 * Downloads the resume as a real PDF.
 *
 * A plain link to the file can be answered by an access gate or a fallback page
 * instead of the PDF, which the browser then saves as a .txt. So the file is
 * fetched and checked here first, and only a verified PDF is handed over.
 */
export function ResumeButton({
  url,
  name,
  className = "ghost-btn",
}: {
  url: string;
  name: string;
  className?: string;
}) {
  const filename = resumeFileName(name);
  const blob = useRef<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const prefetch = useCallback(() => {
    if (blob.current) return;
    loadResume(url)
      .then((b) => {
        blob.current = b;
      })
      .catch(() => {
        /* not ready yet; the click will try again */
      });
  }, [url]);

  // Warm the cache shortly after the page settles so the click is instant.
  useEffect(() => {
    const t = window.setTimeout(prefetch, 400);
    return () => window.clearTimeout(t);
  }, [prefetch]);

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (blob.current) {
      void deliverFile(blob.current, filename);
      return;
    }
    setError(false);
    setLoading(true);
    loadResume(url)
      .then((b) => {
        blob.current = b;
        void deliverFile(b, filename);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  const label = loading ? "Opening…" : error ? "Try again" : "Download PDF resume";

  return (
    <a
      href={url}
      onClick={onClick}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      className={className}
      aria-live="polite"
      aria-busy={loading}
    >
      {label}
    </a>
  );
}
