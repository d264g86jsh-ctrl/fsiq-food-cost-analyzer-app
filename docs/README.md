# FSIQ Food Cost Analyzer — Documentation

This set of documents covers the complete system as it exists today. Code is the source of truth — these docs are kept in sync with it.

**Start here for a full picture:** [architecture.md](architecture.md) → [how-it-works](#how-it-works) section below.

---

## Overview

| Doc | Answers |
|-----|---------|
| [architecture.md](architecture.md) | How does the whole system work? Request flow, all subsystems, directory layout. |
| [CURRENT_STATUS.md](CURRENT_STATUS.md) | What is the state of the app right now? Formula numbers, test counts, open issues. |
| [hard-rules.md](hard-rules.md) | What must never change? Browser compatibility, PDF delivery, Calendly links. |

---

## How It Works

| Doc | Answers |
|-----|---------|
| [savings-formula.md](savings-formula.md) | How are savings estimates calculated? DQ logic, buckets, modifiers, guardrails. |
| [website-validation-spec.md](website-validation-spec.md) | How is a website verified as a restaurant? Decision logic, reachability matrix, known open gaps. |
| [scoring-algorithm.md](scoring-algorithm.md) | How is a website scored? Signal weights, positive/negative signals, decision thresholds. |
| [analyzer-ux-flow.md](analyzer-ux-flow.md) | What does the form look like? Field order, input types, step structure. |

---

## Subsystems

| Doc | Answers |
|-----|---------|
| [ai-narrative.md](ai-narrative.md) | What does Claude do? Researcher + Narrative pipeline, narrative angles, fallback chain. |
| [pdf-generation.md](pdf-generation.md) | How are PDFs made? Full vs. conservative mode, payload fields, Supabase caching, mobile delivery. |
| [ghl-email-handoff.md](ghl-email-handoff.md) | How does the app hand off to GHL? Lead status values, communication routes, custom fields, tags (including attribution). |
| [meta-tracking.md](meta-tracking.md) | How does Meta tracking work? Pixel events, CAPI, deduplication design, full attribution flow URL→DB→GHL. |
| [database-schema.md](database-schema.md) | What is stored in the DB? Every Submission field, types, enums, workflow state machine. |

---

## Operations

| Doc | Answers |
|-----|---------|
| [deployment.md](deployment.md) | How is the app deployed? Vercel setup, function timeouts, Supabase config. |
| [environment.md](environment.md) | What env vars are needed? Full reference table with required/optional status. |
| [launch-blockers.md](launch-blockers.md) | What must be done before launch? Remaining checklist with current state. |
| [admin-dashboard.md](admin-dashboard.md) | What does the admin panel do? Manual review queue, submission list, retry actions. |

---

## Design & Quality

| Doc | Answers |
|-----|---------|
| [brand-guidelines.md](brand-guidelines.md) | What are the brand colors, fonts, and component styles? |
| [qa-checklist.md](qa-checklist.md) | What manual QA scenarios should be run? (Partially stale — use test-results-report.md for current coverage.) |
| [test-results-report.md](test-results-report.md) | What did the adversarial pre-launch tests find? Failure table, severity triage, coverage gaps. |

---

## Reference Records (do not edit)

| Doc | What it is |
|-----|------------|
| [hard-rules.md](hard-rules.md) | Non-negotiable constraints from production incidents — policy document. |
| [FSIQ_SOP_v3.3.md](FSIQ_SOP_v3.3.md) | Original SOP in Markdown. Historical baseline — current docs override it. |
| `FSIQ_SOP_v3.3.pdf` | Original PDF SOP. Archive only. |

---

## Archive (historical process docs)

| Doc | What it was |
|-----|-------------|
| [archive/build-phases.md](archive/build-phases.md) | Implementation phase checklist from the build. Not system documentation. |
| [archive/staging-checklist.md](archive/staging-checklist.md) | Pre-staging run-once checklist. Partially completed. |

---

## Override Rules

When specs conflict, the **more specific / more recent** doc wins:

| Topic | Winner |
|-------|--------|
| `finalPct` range | `savings-formula.md` (4.0%–6.95%) over SOP (5.0%–8.0%) |
| Email delivery | `ghl-email-handoff.md` (GHL/Zapier owns it) over SOP (Zapier assumed) |
| Form field order | `analyzer-ux-flow.md` (contact fields last) over SOP (contact fields first) |
| Validation implementation | `scoring-algorithm.md` and code over `website-validation-spec.md` where they conflict |
