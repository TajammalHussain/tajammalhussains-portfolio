---
title: "Rules as data: why hardcoded business logic doesn't survive contact with reality"
seoTitle: "Rules as Data — Approval Workflow Design"
slug: "rules-as-data"
excerpt: >
  The moment a business rule changes more often than your deployment
  schedule, it belongs in a table, not an if/else chain.
tags: ["data engineering", "software design"]
publishDate: 2025-12-17
draft: false
---

A recurring pattern shows up across several projects in the [case studies](/work)
on this site: logic that started life as a hardcoded sequence in application
code — an approval chain, a routing rule, a threshold — eventually needed to
change more often than the team shipping code could keep up with.

The fix is nearly always the same shape: model the rule as **data**, evaluate
it at runtime, and let the people who own the policy change the data without
needing a developer or a deployment.

## The tell

A hardcoded rule looks harmless right up until someone asks "can we make an
exception for this one case" or "can this route differently above a certain
value." At that point you're either writing a new conditional branch for
every variation — which doesn't scale and nobody wants to review — or you
stop and ask whether the rule was ever really "logic" at all, versus
**configuration that happens to be shaped like logic**.

## What "rules as data" actually looks like

Concretely: a table of conditions and outcomes, evaluated by a small,
generic engine, rather than a growing tree of `if` statements. The engine
stays simple and rarely changes. The rules change constantly, and changing
them means editing a record, not shipping code.

The catch — and it's a real one — is that this only pays off if you also
give the rules real structure: validation, versioning, and ideally a way to
simulate a proposed rule change against historical data before it goes live.
"Rules as data" without those is just moving the hardcoding problem into a
database table that's harder to review than code ever was.

## When not to do this

Not every conditional belongs in a rules table. If a piece of logic changes
on the same cadence as the rest of the codebase, and only developers ever
need to change it, a table adds indirection for no real benefit. The signal
worth watching for is specifically a _mismatch in cadence_ — policy that
changes faster than code should.
