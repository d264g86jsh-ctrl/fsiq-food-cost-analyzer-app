# Docs — FSIQ Food Cost Analyzer

## Documentation Hierarchy

Focused project specs override the historical SOP when they document approved product changes.

| File | Purpose | Authority |
|---|---|---|
| `CLAUDE.md` (root) | Claude Code operating rules | Claude Code instructions |
| `build-phases.md` | Implementation roadmap | Source of truth for phase order |
| `architecture.md` | App architecture, request flow, directory layout | Source of truth for app structure |
| `analyzer-ux-flow.md` | Form field order and UX flow | Overrides SOP field order |
| `website-validation-spec.md` | Website validation rules, reachability, country eligibility | Source of truth for validation |
| `savings-formula.md` | Savings math — `finalPct`, `dollarEstimate`, projections | Source of truth for savings formula |
| `brand-guidelines.md` | Brand colors, logo assets, component styling, voice and tone | Source of truth for UI design |
| `qa-checklist.md` | QA test cases, run after every phase | |
| `launch-blockers.md` | Required env vars, known gaps, deployment readiness | |
| `staging-checklist.md` | Staging deployment checklist and live integration QA plan | |
| `FSIQ_SOP_v3.3.md` | Full SOP converted to Markdown | Historical baseline / reference |
| `FSIQ_SOP_v3.3.pdf` | Original PDF SOP | Archive / internal reference only |

## Override Examples

- SOP says `finalPct` 5.0%–8.0% → `savings-formula.md` says 4.0%–8.0% → **savings-formula.md wins**
- SOP references Zapier → `architecture.md` says app backend owns the workflow → **architecture.md wins**
- SOP collects contact fields upfront → `analyzer-ux-flow.md` says contact fields come last → **analyzer-ux-flow.md wins**
