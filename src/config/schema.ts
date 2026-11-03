import { z } from "zod";

// Validates three or six digit hex colors.
const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
// Every section the page knows how to render.
export const SECTION_IDS = [
  "hero",
  "about",
  "experience",
  "projects",
  "github",
  "music",
  "thoughts",
  "skills",
  "contact",
] as const;
const section = z.enum(SECTION_IDS);

// Schema for the site config; optional fields keep older configs valid.
export const configSchema = z.object({
  version: z.number(),
  theme: z.object({
    colors: z.object({ primary: hex, secondary: hex, accent: hex, background: hex, text: hex }),
    fonts: z.object({ heading: z.string().min(1), body: z.string().min(1) }),
    mode: z.enum(["dark", "light"]),
  }),
  animation: z.object({
    intensity: z.number().min(0).max(1),
    blobSpeed: z.number().min(0).max(5),
    blobCount: z.number().int().min(1).max(8),
    enableCursorEffects: z.boolean(),
    enableParallax: z.boolean(),
  }),
  layout: z.object({ sectionOrder: z.array(section), hiddenSections: z.array(section) }),
  content: z.object({
    name: z.string(),
    title: z.string(),
    tagline: z.string(),
    brand: z.object({ strong: z.string(), tail: z.string() }).optional(),
    holo: z
      .object({
        photoUrl: z.string().default("/dray-profile.png"),
        cutout: z.boolean().default(false),
        label: z.string().default("Drayspo · ID"),
        stamp: z.string().default("KY · 2025"),
        credential: z.string().default("BSc CS · CAPM"),
      })
      .default({
        photoUrl: "/dray-profile.png",
        cutout: false,
        label: "Drayspo · ID",
        stamp: "KY · 2025",
        credential: "BSc CS · CAPM",
      }),
    music: z
      .object({
        playlistUrl: z.string().default(""),
        playlistName: z.string().default(""),
        nowPlaying: z
          .object({
            isPlaying: z.boolean(),
            title: z.string(),
            artist: z.string(),
            album: z.string().optional(),
            artworkUrl: z.string().optional(),
            url: z.string().optional(),
            updatedAt: z.string().optional(),
          })
          .nullable()
          .default(null),
      })
      .default({ playlistUrl: "", playlistName: "", nowPlaying: null }),
    thoughts: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          date: z.string(),
          excerpt: z.string(),
          body: z.string(),
          tags: z.array(z.string()).optional(),
          readMinutes: z.number().positive().optional(),
        }),
      )
      .default([]),
    location: z.string(),
    email: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
    about: z.string(),
    experience: z.array(
      z.object({
        company: z.string(),
        role: z.string(),
        start: z.string(),
        end: z.string(),
        highlights: z.array(z.string()),
      }),
    ),
    projects: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        tech: z.array(z.string()),
        url: z.string(),
        repo: z.string(),
      }),
    ),
    skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  }),
  polling: z.object({ intervalSeconds: z.number().min(5).max(3600) }),
});

// Parsed site config type.
export type SiteConfig = z.infer<typeof configSchema>;
export type SectionId = (typeof SECTION_IDS)[number];

// Resolves the ordered list of enabled sections.
export function visibleSections(c: SiteConfig): SectionId[] {
  const seen = new Set<SectionId>();
  return c.layout.sectionOrder.filter((s) => {
    if (seen.has(s) || c.layout.hiddenSections.includes(s)) return false;
    seen.add(s);
    return true;
  });
}

// Finds the resume link among the configured contact links.
export function findResumeLink(c: SiteConfig) {
  return c.content.links.find((l) => /resume|cv|pdf/i.test(l.label) || /\.pdf($|\?)/i.test(l.url));
}
