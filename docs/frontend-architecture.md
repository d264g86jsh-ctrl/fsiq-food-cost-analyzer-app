# Frontend Architecture

## Stack

- Next.js App Router (`src/app`)
- React 19 components (`src/components`)
- TypeScript
- Tailwind/CSS utility classes

## Top-Level Frontend Structure

- `src/app/page.tsx`: homepage route entry
- `src/components/analyzer/AnalyzerPageV2.tsx`: marketing + analyzer shell
- `src/components/analyzer/page/AnalyzerFormPage.tsx`: dedicated parent wrapper for form area
- `src/components/analyzer/AnalyzerForm.tsx`: form container/state orchestration
- `src/components/analyzer/form/*`: new subcomponent architecture for form sections

## Analyzer Form Component Breakdown

`AnalyzerForm` is now a container that manages state and orchestration only.

### Shared UI

- `src/components/analyzer/form/shared/FormField.tsx`
- `src/components/analyzer/form/shared/FormProgressHeader.tsx`
- `src/components/analyzer/form/shared/fieldStyles.ts`

### Step Sections

- `src/components/analyzer/form/steps/StepOneSection.tsx`
- `src/components/analyzer/form/steps/StepTwoSection.tsx`
- `src/components/analyzer/form/steps/StepThreeSection.tsx`
- `src/components/analyzer/form/steps/StepFourSection.tsx`

### Navigation

- `src/components/analyzer/form/navigation/FormNavigation.tsx`

## Frontend Data Flow

1. User interacts with step components.
2. Step components call `onUpdate` into `AnalyzerForm` state.
3. `AnalyzerForm` performs validation and route decisions between steps.
4. Website checks are triggered via server action/API.
5. Final submit calls `submitAnalysis` server action.
6. Success state swaps to `SuccessState`.

## Why this structure is cleaner

- State and side-effects are centralized in one container.
- Rendering logic is split into focused section components.
- Shared primitives (`FormField`, styles, progress, nav) are reusable.
- Parent folder structure mirrors feature boundaries.
