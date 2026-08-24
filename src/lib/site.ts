// Central site metadata — single source of truth for SEO tags, JSON-LD, and
// footer/nav copy so it's never duplicated across pages.
export const SITE = {
  name: "Tajammal Hussain",
  tagline: "Data infrastructure that runs itself",
  url: "https://tajammalhussains.uk",
  locale: "en_GB",
  location: "Derby, United Kingdom",
  jobTitle: "Data Analyst",
  description:
    "Data Analyst progressing toward Data Engineer. I design and run production data pipelines — end to end, on real infrastructure, monitored and tested — not slideware.",
  // TODO(owner): confirm/replace the LinkedIn URL — this is a guessed slug,
  // not a verified profile. GitHub is confirmed.
  sameAs: [
    "https://www.linkedin.com/in/REPLACE-ME",
    "https://github.com/TajammalHussain",
  ],
  keywords: [
    "data engineer UK",
    "ETL pipeline developer",
    "Azure data engineer",
    "Power BI developer Derby",
  ],
} as const;

export const NAV_LINKS = [
  { href: "/work", label: "Work" },
  { href: "/live", label: "Live Data" },
  { href: "/writing", label: "Writing" },
  { href: "/about", label: "About" },
  { href: "/cv", label: "CV" },
] as const;
