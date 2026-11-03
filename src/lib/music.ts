/** Only official Apple Music HTTPS links can become embedded players. */
export function musicEmbedUrl(input: string): string {
  if (!input.trim()) return "";
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      !["music.apple.com", "embed.music.apple.com"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      return "";
    url.hostname = "embed.music.apple.com";
    return url.toString();
  } catch {
    return "";
  }
}

// Returns the link only if it is a trusted https music URL.
export function safeMusicLink(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    const url = new URL(input);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
