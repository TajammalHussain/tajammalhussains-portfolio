// Single source of truth for the CV — shared by /about and /cv so the two
// pages can never drift out of sync. Mirrors Tajammal_Hussain-CV (Sep 2026).

export const SUMMARY =
  "Data and Technology professional with four years of applied experience spanning data " +
  "engineering, business analysis, automation, and full-stack systems development. Proven " +
  "ability to design and build end-to-end data pipelines and ETL/ELT workflows, automate " +
  "complex business processes, develop dashboards and reporting solutions, and deliver " +
  "production-grade software across cloud and on-premises environments. Proficient in " +
  "Python, SQL Server, Power BI, Azure, Go, PostgreSQL, and React, with hands-on delivery " +
  "across sectors including construction, infrastructure, and the third sector. Equally " +
  "comfortable translating ambiguous business requirements into technical solutions as " +
  "building and deploying them.";

export const EXPERIENCE = [
  {
    title: "Data Engineer",
    organisation: "Control Electrical Engineers Ltd",
    location: "London",
    period: "September 2023 – Present",
    bullets: [
      "Designed and built a suite of financial automation systems on Zoho Creator — covering supplier payment workflows, subcontractor payment certificates (with CIS/HMRC/BACS logic), and CIS payment sheets — eliminating a full administrative role and replacing manual approval chains with structured digital workflows including e-signature and multi-level authorisation.",
      "Built a full-stack Materials Requisition Portal using Go, PostgreSQL, React, JWT authentication, and Docker, deployed on Railway — replacing a manual spreadsheet process with a versioned, searchable product catalogue and a complete point-in-time requisition audit trail.",
      "Developed and deployed a Python web scraping pipeline (BeautifulSoup4, Selenium, Pandas) ingesting and normalising product and pricing data from 15+ MEP/construction supplier sources into a single SQL-backed catalogue, feeding Power BI reporting.",
      "Built HiredToolExpiryReminder — a Python/Task Scheduler automation system generating weekly admin summaries, individual reminder emails, and HTML table reports for tool hire expiry management across the business.",
      "Built CEE Tool Tracker Pro — a single-file HTML asset tracking application with QR-code-driven location and status updates, replacing a manual spreadsheet with a live, always-current equipment register.",
      "Developed and maintained Power BI dashboards consuming SQL Server data, surfacing material usage, cost patterns, and compliance status for operational and senior stakeholders.",
      "Designed SQL Server database structures underpinning multiple operational systems — applying normalisation, stored procedures, indexing, and performance tuning to support reliable, scalable data storage and retrieval.",
      "Produced clear technical documentation — data flow diagrams, field mappings, runbooks, and user guides — for all systems, supporting audit readiness and team knowledge continuity.",
      "Led UAT across multiple projects, coordinating business users and technical teams to validate system behaviour and data accuracy before go-live.",
      "Managed Agile delivery across concurrent projects — sprint planning, backlog refinement, and retrospectives — maintaining alignment between business priorities and technical delivery.",
    ],
  },
  {
    title: "Data Engineer",
    organisation: "United Communities Network",
    location: "Nottingham",
    period: "April 2022 – July 2023",
    bullets: [
      "Designed and built ETL pipelines integrating datasets from finance, HR, and operations systems — using Python (Pandas, NumPy) and SQL to extract, clean, transform, and load data from disparate sources into a unified reporting layer, significantly improving insight accuracy and consistency across the organisation.",
      "Engineered automated data workflows that replaced recurring manual data-preparation tasks — scheduling extracts, applying transformation logic, and routing outputs to downstream consumers — reducing processing time and removing bottlenecks for analytical teams.",
      "Implemented data quality and validation frameworks using SQL and Python, embedding automated checks into pipeline execution to catch inconsistencies at source and prevent errors from reaching reporting outputs.",
      "Built interactive Power BI and Excel dashboards consuming pipeline outputs, enabling self-serve access to key performance data across finance, HR, and operations and reducing reliance on manual report generation.",
      "Worked with IT and departmental leads to identify data integration requirements, map existing data flows, and design pipeline solutions that improved the speed and reliability of data available for decision-making.",
    ],
  },
  {
    title: "Data Engineer (Internship)",
    organisation: "Prime Minister's Youth Skill Development Programme (PMYSDP)",
    location: "Pakistan",
    period: "June 2017 – June 2018",
    bullets: [
      "Designed and implemented automated SQL-based data pipelines to replace 12 manual processes over six months — standardising data flows across student and management systems, improving data integrity, and contributing to a 25% increase in overall system efficiency.",
      "Led the migration of 8 college data workflows to cloud platforms over four months, re-engineering on-premises processes for cloud delivery and reducing system downtime by 30% while improving scalability to support over 2,000 active users.",
      "Built and maintained large-scale operational data repositories — digitising legacy records, restructuring data storage, and establishing access controls — improving data retrieval reliability by 20% across the institution.",
      "Collaborated with departmental leads to gather data requirements, map existing manual processes, and design pipeline solutions that transitioned the institution toward automated, SQL-driven data management.",
    ],
  },
] as const;

export const PORTFOLIO_PROJECTS = [
  {
    name: "Bronze to Silver to Gold pipeline (live)",
    detail:
      "Scheduled ingestion of UK grid carbon intensity data through a three-layer medallion architecture, with data quality monitoring and a documented public REST API. Deployed and verifiable.",
    href: "/live",
  },
  {
    name: "Materials Requisition Portal",
    detail:
      "Go/PostgreSQL/React full-stack system with JWT auth, Docker deployment, versioned product catalogue, and full requisition audit trail.",
    href: "/work/materials-requisition-portal",
  },
  {
    name: "Supplier Data Pipeline",
    detail:
      "Python pipeline (Requests, BeautifulSoup, Selenium, Pandas) normalising data from 15+ sources into a single SQL-backed catalogue.",
    href: "/work/supplier-data-cataloguing",
  },
  {
    name: "Asset Tracking System",
    detail:
      "QR-code-driven Python/SQL Server pipeline replacing a manual spreadsheet with live equipment status and location data.",
    href: "/work/asset-tracking-pipeline",
  },
] as const;

export const EDUCATION = [
  {
    qualification: "MSc Software Engineering",
    grade: "Awarded with Commendation",
    institution: "University of Hertfordshire, UK",
    period: "2019 – 2021",
    bullets: [
      "Relevant modules: Distributed systems, database management, software architecture, secure computing, research methods.",
      "Projects: Emotion Detection system (R, MySQL); Timesaving Appointment platform (PHP, MySQL, cPanel); Green IT / Sustainable Computing research.",
    ],
  },
  {
    qualification: "BSc Computer Science",
    grade: "CGPA 3.5/4.0",
    institution: "University of Azad Jammu and Kashmir, Pakistan",
    period: "2011 – 2016",
    bullets: [
      "Relevant modules: Data structures and algorithms, database systems, networking, operating systems, software engineering.",
      "Projects: Transport Tracking System (Java, GPS, MySQL, Apache Tomcat); Commercial Database Development; Integrated Enterprise Management System.",
    ],
  },
] as const;

export const CERTIFICATIONS = [
  { name: "Power BI Desktop for Business Intelligence", issuer: "Microsoft", detail: "" },
  {
    name: "Google Data Analytics Professional Certificate",
    issuer: "Google",
    detail: "Foundations, Data Preparation, Processing, Analysis, Visualisation",
  },
  { name: "Business Analysis & Process Management", issuer: "", detail: "" },
  { name: "Data Analysis with R Programming", issuer: "", detail: "" },
  { name: "Python Essentials", issuer: "Cisco", detail: "" },
  { name: "Learning Excel Data Analysis", issuer: "", detail: "" },
  { name: "Google SEO Fundamentals", issuer: "UC Davis (Coursera)", detail: "" },
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
] as const;

export const SKILLS = [
  {
    group: "Languages",
    items: [
      "Python (Pandas, NumPy, Requests, BeautifulSoup4, Selenium, Scikit-learn, SciPy)",
      "SQL (T-SQL)",
      "R (ggplot2, dplyr)",
      "Go",
      "Bash",
      "VBA",
      "JavaScript",
      "PHP",
    ],
  },
  {
    group: "Data Engineering",
    items: [
      "ETL/ELT pipeline design and delivery",
      "Data quality and validation frameworks",
      "Pipeline monitoring and alerting",
      "REST/SOAP APIs",
      "JSON, XML, CSV",
      "Bronze/silver/gold medallion architecture",
    ],
  },
  {
    group: "Databases",
    items: [
      "Microsoft SQL Server (stored procedures, indexing, performance tuning, backup/recovery)",
      "PostgreSQL",
      "MySQL",
      "SQLite",
      "Schema design, normalisation, data integrity",
    ],
  },
  {
    group: "Cloud & Azure",
    items: [
      "Azure Data Factory",
      "Azure Data Lake",
      "Azure Synapse Analytics",
      "Azure Functions",
      "Logic Apps",
      "AWS",
      "Cloudflare Workers",
      "Railway",
    ],
  },
  {
    group: "BI & Visualisation",
    items: [
      "Power BI (DAX, Power Query)",
      "Tableau",
      "Matplotlib",
      "Excel (advanced)",
      "Google Sheets",
      "R Markdown",
    ],
  },
  {
    group: "Full-Stack Dev",
    items: [
      "Go (REST APIs, backend)",
      "React",
      "Next.js",
      "PostgreSQL",
      "JWT",
      "Docker",
      "HTML/CSS",
      "Zoho Creator (Deluge scripting)",
      "cPanel web hosting",
    ],
  },
  {
    group: "Automation",
    items: [
      "Power Automate",
      "Python scripting automation",
      "Zoho workflows",
      "SMTP alerting",
      "Task Scheduler",
      "Event-driven and scheduled pipeline execution",
    ],
  },
  {
    group: "BA & Delivery",
    items: [
      "Requirements elicitation and documentation",
      "Process mapping",
      "Stakeholder facilitation",
      "UAT coordination",
      "Agile/Scrum",
      "SDLC",
      "Technical documentation and runbooks",
    ],
  },
  {
    group: "Dev Tools",
    items: ["Git", "Visual Studio", "Docker", "CI/CD awareness", "Zoho CRM"],
  },
] as const;

export const ADDITIONAL_INFO = [
  "Full UK driving licence held for over seven years, with own vehicle.",
  "Multilingual: English (professional), Urdu and Punjabi (native).",
] as const;

// Short one-liner for the /about intro; the full CV summary is SUMMARY.
export const TRAJECTORY =
  "Four years delivering end-to-end data engineering, automation, and full-stack systems — " +
  "from ETL pipelines and Power BI reporting to Go/React applications on cloud infrastructure.";
