# Analyzer UX Flow — FSIQ Food Cost Analyzer

**Status:** Approved product update. This doc overrides the old SOP field order when there is a conflict.  
Source of truth for: analyzer form field order, UX flow structure, input types.

---

## Core Concept

The analyzer is a **quiz/calculator flow**, not a long static form. Questions are presented step-by-step (or in a logical grouped sequence) using dropdowns and multiple-choice inputs wherever possible. Free text is used only where unavoidable.

Contact information is collected **at the end**, after the user has completed all qualification questions.

---

## Field Order

### Step 1 — Business Qualification (shown first)

| Field | Input type | Notes |
|---|---|---|
| `restaurant_name` | Text | Used for national chain check |
| `website` | Text + real-time validation | Triggers validation on blur (Phase 2 endpoint) |
| `zip_code` | Text | U.S. 5-digit or ZIP+4 only; triggers validation alongside website |
| `concept_type` | Dropdown | Dropdown values per SOP §5 |
| `locations` | Dropdown | Single / 2–4 / 5+ |
| `annual_food_spend` | Dropdown | Ranges per SOP §5 |
| `distributor_type` | Dropdown | Per SOP §5 |
| `procurement_strategy` | Dropdown | Per SOP §5 |
| `top_skus` | Free text | Label: "What are your biggest food spend categories or key items?" Placeholder: "Chicken, beef, seafood, dairy, produce, fryer oil…" — no predefined categories in v1 |

### Step 2 — Contact Info (shown last, before final submission)

| Field | Input type | Notes |
|---|---|---|
| `full_name` | Text | Required |
| `email` | Email | Required |
| `phone` | Tel | Optional |

---

## UX Rules

- **Website + ZIP appear early** — both are needed for real-time validation, which should run before the user reaches contact fields.
- **Prefer multiple-choice / dropdown** for: `concept_type`, `locations`, `annual_food_spend`, `distributor_type`, `procurement_strategy`. Do not use free text where a bounded set of options exists.
- **`top_skus` is always free text** — no dropdown, no multi-select, no predefined categories in v1. The qualification engine parses it for protein/commodity keywords.
- **Contact info is required** before final submission and PDF delivery. The form cannot submit without `full_name` and `email`.
- **Block final submission** if `finalDecision` is `clear_non_fit`, `national_chain`, or `invalid_website`.
- **Show conservative-mode notice** (not a block) if `finalDecision` is `plausible_unverified`.
- **Progress indicator** — show step progress so users know how far they are in the quiz.

---

## Validation Trigger Points

| Event | Action |
|---|---|
| `website` field blur | Call `POST /api/validate-website` with `website` + `zip_code` |
| `zip_code` field blur | Re-validate if `website` already has a value |
| Form submit (Step 2) | Server-side re-validation before pipeline runs |
| Pre-PDF gate | Third validation pass inside `submitAnalysis.ts` |

---

## Field Definitions

Full field definitions (dropdown values, labels) are in `docs/FSIQ_SOP_v3.3.md` §5. This doc defines **order and UX behavior only**.

---

## Implementation Note

This flow is implemented in Phase 4 of `docs/build-phases.md`.  
Component: `src/components/AnalyzerForm.tsx` (multi-step quiz wrapper).  
Server action: `src/actions/validateWebsite.ts` (real-time validation), `src/actions/submitAnalysis.ts` (final submission).
