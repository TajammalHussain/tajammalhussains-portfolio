// Central site metadata — single source of truth for SEO tags, JSON-LD, and
// footer/nav copy so it's never duplicated across pages.
export const SITE = {
  name: "Tajammal Hussain",
  tagline: "Data infrastructure that runs itself",
  url: "https://tajammalhussains.uk",
  locale: "en_GB",
  location: "Derby, United Kingdom",
  jobTitle: "Data Analyst",
  // Kept separate from jobTitle deliberately — jobTitle is the accurate,
  // ATS/schema-safe current title; targetRole is what recruiters should see
  // alongside it, not a replacement for it (spec: don't misstate current title).
  targetRole: "Data Engineer",
  description:
    "Data Analyst progressing toward Data Engineer. I design and run production data pipelines — end to end, on real infrastructure, monitored and tested — not slideware.",
  sameAs: [
    "https://www.linkedin.com/in/tajammal-hussain-233293ab/",
    "https://github.com/TajammalHussain",
    "https://www.facebook.com/tajammal.hussain.5851",
    "https://www.instagram.com/hus_sain_786/",
    "https://www.tiktok.com/@hussains_essence",
    "https://x.com/Tajammal72",
  ],
  keywords: [
    "data engineer UK",
    "ETL pipeline developer",
    "Azure data engineer",
    "Power BI developer Derby",
  ],
} as const;

// Rendered as branded pill buttons by <SocialLinks /> (footer, /about).
export const SOCIAL_LINKS = [
  { platform: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com/in/tajammal-hussain-233293ab/" },
  { platform: "github", label: "GitHub", url: "https://github.com/TajammalHussain" },
  { platform: "facebook", label: "Facebook", url: "https://www.facebook.com/tajammal.hussain.5851" },
  { platform: "instagram", label: "Instagram", url: "https://www.instagram.com/hus_sain_786/" },
  { platform: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@hussains_essence" },
  { platform: "x", label: "X", url: "https://x.com/Tajammal72" },
] as const;

export const NAV_LINKS = [
  { href: "/work", label: "Work" },
  { href: "/live", label: "Live Data" },
  { href: "/writing", label: "Writing" },
  { href: "/about", label: "About" },
  { href: "/cv", label: "CV" },
] as const;
