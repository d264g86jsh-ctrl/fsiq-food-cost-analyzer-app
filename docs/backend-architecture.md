# Backend Architecture

## Stack

- Next.js Server Actions + Route Handlers
- Node.js runtime for API route
- PostgreSQL with Prisma ORM
- Integrations: Anthropic, PDFMonkey, GoHighLevel, Meta CAPI

## Where backend code lives

There is no standalone `backend/` folder. Backend concerns are split across:

- `src/actions`: primary mutation/orchestration entrypoints
- `src/app/api`: HTTP route handlers
- `src/lib`: domain services and integration adapters
- `prisma`: schema + migrations

## Backend Entry Points

- `src/actions/submitAnalysis.ts`: main orchestration pipeline
- `src/actions/validateWebsite.ts`: server-action validation wrapper
- `src/actions/admin.ts`: admin login/logout/manual review updates
- `src/app/api/validate-website/route.ts`: stateless validation endpoint

## Domain Modules (`src/lib`)

- `website`: normalization, reachability, signal extraction, validation pipeline
- `qualification`: deterministic lead qualification and savings calculations
- `relevance`: restaurant/geo fit checks and relationship classification
- `ai`: research + narrative generation and fallback behavior
- `pdf`: PDF mode and PDFMonkey payload/generation
- `crm`: lead-status routing + GoHighLevel sync
- `meta`: event IDs, user-data shaping, CAPI dispatch
- `admin`: admin auth and submission query/format helpers
- `db.ts`: Prisma client singleton

## Core Submission Pipeline

`submitAnalysis` flow:

1. Capture tracking/IP context.
2. Persist initial submission in DB.
3. Run website validation and persist result.
4. Run qualification and persist deterministic outputs.
5. Branch:
   - DQ/manual-review path: finalize quickly via CRM + Meta sync.
   - Qualified path: return response, continue background work with `waitUntil`.
6. Background stages for qualified path:
   - AI research
   - AI narrative
   - PDF generation
   - CRM sync
   - Meta CAPI events
7. Persist final workflow status (`complete`, `partial`, or `failed`).

## Data Model

- Central table: `Submission` in `prisma/schema.prisma`
- Stores:
  - raw form data
  - validation decisions and confidence
  - qualification outputs and projections
  - AI and PDF outputs
  - CRM/Meta delivery statuses
  - manual review and workflow stage/status/error state

## Testing

- `src/lib/__tests__` contains unit coverage for validation, qualification, AI, PDF, CRM, Meta, and admin helpers.
