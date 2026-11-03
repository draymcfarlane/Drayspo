import { z } from "zod";

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
export const SECTION_IDS = ["hero", "about", "experience", "projects", "github", "skills", "contact"] as const;
const section = z.enum(SECTION_IDS);

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
    location: z.string(),
    email: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
    about: z.string(),
    experience: z.array(z.object({ company: z.string(), role: z.string(), start: z.string(), end: z.string(), highlights: z.array(z.string()) })),
    projects: z.array(z.object({ name: z.string(), description: z.string(), tech: z.array(z.string()), url: z.string(), repo: z.string() })),
    skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  }),
  polling: z.object({ intervalSeconds: z.number().min(5).max(3600) }),
});

export type SiteConfig = z.infer<typeof configSchema>;
export type SectionId = (typeof SECTION_IDS)[number];

export function visibleSections(c: SiteConfig): SectionId[] {
  const seen = new Set<SectionId>();
  return c.layout.sectionOrder.filter((s) => {
    if (seen.has(s) || c.layout.hiddenSections.includes(s)) return false;
    seen.add(s);
    return true;
  });
}

export function findResumeLink(c: SiteConfig) {
  return c.content.links.find((l) => /resume|cv|pdf/i.test(l.label) || /\.pdf($|\?)/i.test(l.url));
}
