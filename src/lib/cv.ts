// Single source of truth for education, certifications, and skills — shared
// by /about and /cv so the two pages can never drift out of sync.

export const EDUCATION = [
  {
    qualification: "MSc Software Engineering (Advanced Research)",
    grade: "Commendation",
    institution: "University of Hertfordshire",
  },
  {
    qualification: "BSc Computer Science",
    grade: "CGPA ~3.5",
    institution: "University of Muzaffarabad, Kotli Campus",
  },
] as const;

export const CERTIFICATIONS = [
  {
    name: "Attention to Detail",
    issuer: "TestGorilla",
    detail: "96th percentile",
  },
  {
    name: "Data-Driven Decision Making",
    issuer: "TestGorilla",
    detail: "100th percentile",
  },
  { name: "Advanced Excel", issuer: "TestGorilla", detail: "97th percentile" },
  { name: "NoSQL Databases", issuer: "TestGorilla", detail: "98th percentile" },
  {
    name: "Statistics & Probability",
    issuer: "TestGorilla",
    detail: "100th percentile",
  },
  {
    name: "Google Data Analytics Professional Certificate",
    issuer: "Google",
    detail: "",
  },
  { name: "Power BI Desktop", issuer: "Microsoft", detail: "" },
  { name: "SEO Fundamentals", issuer: "UC Davis (Coursera)", detail: "" },
  { name: "Python Essentials 1", issuer: "Cisco", detail: "" },
  { name: "Business Analysis & Process Management", issuer: "", detail: "" },
] as const;

export const SKILLS = [
  {
    group: "Languages",
    items: ["SQL (SQL Server, Oracle)", "Python", "R", "Go", "VBA"],
  },
  {
    group: "Data",
    items: [
      "ETL/ELT pipeline design",
      "Data modelling",
      "Data warehousing",
      "Data quality",
    ],
  },
  {
    group: "Cloud",
    items: ["Azure (Data Factory, Data Lake, Synapse)", "AWS", "Cloudflare"],
  },
  { group: "BI", items: ["Power BI", "Tableau"] },
  {
    group: "Engineering",
    items: ["Git", "CI/CD", "Docker", "REST APIs", "Automation"],
  },
] as const;

export const TRAJECTORY =
  "Currently a Data Analyst delivering end-to-end data and automation systems, " +
  "progressing toward Data Engineer — deepening Azure data tooling, data modelling, " +
  "and orchestration.";
