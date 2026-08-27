---
title: "Why this site runs real data pipelines instead of describing them"
seoTitle: "Why This Site Runs Real Pipelines"
slug: "why-this-site-runs-real-pipelines"
excerpt: >
  A static portfolio can claim anything. This site's /live section is built
  to be checked, not just read — here's the reasoning and the architecture.
tags: ["data engineering", "architecture", "portfolio"]
publishDate: 2025-12-10
draft: false
---

Most portfolio sites describe skills in prose: "experienced with ETL pipelines,"
"comfortable with cloud data platforms." A hiring manager reading that has no
way to tell the difference between someone who has built five production
pipelines and someone who read about them last week.

So instead of describing pipelines, this site runs some.

## What "real" means here

A scheduled job pulls from a public source API on a fixed interval. The raw
response lands, untouched, in object storage — a **bronze** layer, immutable
and timestamped. A transform step parses, types, deduplicates, and validates
that raw data into a **silver** layer of clean records. An aggregation step
computes the metrics actually worth looking at into a **gold** layer. A public
API serves the gold layer as documented, cached JSON. A chart on the page
renders whatever the API currently returns — not a screenshot taken once and
forgotten.

Every layer is inspectable. The `/status` page shows genuine data-quality
check results, including failures when they happen, because a system that
never fails a check is either trivial or lying.

## Why bronze/silver/gold specifically

The medallion pattern (bronze → silver → gold) exists because these are three
genuinely different responsibilities that get tangled together if you skip
straight from "raw API response" to "chart on a page":

- **Bronze** answers "what did the source actually say, and when." Keeping
  the raw payload means a bug in the transform step is recoverable — replay
  bronze through a fixed transform rather than losing history.
- **Silver** answers "what is this data, properly typed and validated."
  This is where a null that shouldn't be null, or a value out of range, gets
  caught rather than silently propagated.
- **Gold** answers "what does someone actually want to know." Rolling
  averages, comparisons, trends — the shape of a chart, not the shape of an
  API response.

## The point

None of this is complicated engineering. That's rather the point: it's a
small, honest, fully-running system, built the way a larger one would be,
so anyone can check every claim by opening the repository, hitting the API,
or reading the Actions tab.
