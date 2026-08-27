import { defineCollection, z } from "astro:content";

// These schemas are the contract between the Astro build and the Sveltia/Decap
// CMS config (see /public/admin/content/config.yml) — field names and types
// must stay in lockstep with each other (spec 11.2).

const caseStudies = defineCollection({
  type: "content",
  schema: ({ image }) =>
    z.object({
      title: z.string().max(90),
      // NOTE: "slug" is deliberately NOT a schema field — Astro's content
      // collections treat a `slug:` frontmatter key as reserved and strips it
      // before validation, using it to compute the entry's routing slug
      // (available as `entry.slug`, not `entry.data.slug`).
      summary: z.string().max(200),
      stack: z.array(z.string()).min(1),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
      publishDate: z.date(),
      readingTimeMinutes: z.number().int().positive().optional(),
      diagram: z.string().optional(), // path to an inline SVG/Mermaid source file
      coverImage: image().optional(),
      // Structured per the required narrative shape (spec section 5)
      problem: z.string(),
      constraints: z.string(),
      approach: z.string(),
      architecture: z.string(),
      outcome: z.string(),
      retrospective: z.string(), // "What I'd do differently"
    }),
});

const writing = defineCollection({
  type: "content",
  schema: ({ image }) =>
    z.object({
      title: z.string().max(90),
      // Optional shorter title for the <title> tag / SERP display. `title`
      // is the real on-page H1 and can run long for a good headline; SERPs
      // truncate anywhere past ~60 chars (minus " · Tajammal Hussain"), so a
      // long title needs a distinct, shorter seoTitle rather than being cut
      // off mid-word. Falls back to `title` when unset.
      seoTitle: z.string().max(60).optional(),
      // "slug" is reserved/stripped by Astro before validation — see the
      // same note on the case-studies schema above.
      excerpt: z.string().max(200),
      tags: z.array(z.string()).default([]),
      coverImage: image().optional(),
      publishDate: z.date(),
      draft: z.boolean().default(false),
    }),
});

const ventures = defineCollection({
  type: "content",
  schema: z.object({
    name: z.string(),
    description: z.string().max(280),
    url: z.string().url(),
    status: z.enum(["active", "paused", "sunset"]).default("active"),
  }),
});

// Singleton collection — one entry (site.md) holding global copy the CMS can
// edit without a redeploy of code, only content.
const siteSettings = defineCollection({
  type: "data",
  schema: z.object({
    tagline: z.string(),
    heroHeading: z.string(),
    heroBody: z.string(),
    socialLinks: z.object({
      github: z.string().url(),
      linkedin: z.string().url(),
    }),
    metaDefaults: z.object({
      title: z.string(),
      description: z.string(),
    }),
    cvPdfPath: z.string().default("/cv/Tajammal-Hussain-CV.pdf"),
  }),
});

export const collections = {
  "case-studies": caseStudies,
  writing,
  ventures,
  "site-settings": siteSettings,
};
