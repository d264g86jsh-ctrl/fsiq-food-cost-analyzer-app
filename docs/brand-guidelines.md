# Brand Guidelines — FoodServiceIQ Food Cost Analyzer

**Status:** Approved for Phase 4+. Source of truth for all web app branding, component styling, and UI design decisions.

---

## 1. Logo Assets

### File paths (served from /public)

| Asset | Path | Env var |
|---|---|---|
| Full wordmark — dark (for light backgrounds) | `/brand/fsiq-logo-black-transparent.png` | `FSIQ_LOGO_DARK_URL` |
| Full wordmark — light (for dark backgrounds) | `/brand/fsiq-logo-white-transparent.png` | `FSIQ_LOGO_LIGHT_URL` |
| IQ mark only (compact fallback / favicon) | `/brand/fsiq-iq-logo.png` | `FSIQ_IQ_LOGO_URL` |

### Usage rules

- Use the **black/dark wordmark** on white or light backgrounds (e.g., email body, PDF interior pages).
- Use the **white/light wordmark** on dark green backgrounds (e.g., app header, PDF cover).
- Use the **IQ mark** as a compact icon: favicons, PDF client-logo fallbacks, small-space branding.
- Do not stretch, recolor, or apply CSS filters to logos unless explicitly approved.
- Keep a minimum clear space equal to the height of the "I" in "IQ" on all sides.
- Do not use the white logo on light backgrounds.
- Do not use the black logo on dark green backgrounds.
- Do not use the IQ mark as a replacement for the full wordmark where full branding is required.
- Do not embed logos as base64 in app code, docs, or config files. Always reference `/brand/` paths.

### In code

```tsx
// Header (dark green background)
<img src="/brand/fsiq-logo-white-transparent.png" alt="FoodServiceIQ" className="h-8" />

// Email / light background
<img src="/brand/fsiq-logo-black-transparent.png" alt="FoodServiceIQ" className="h-8" />

// Compact / favicon fallback
<img src="/brand/fsiq-iq-logo.png" alt="FSIQ" className="h-6 w-6" />
```

---

## 2. Color Tokens

### Core palette

| Token name | Hex | Usage |
|---|---|---|
| Primary dark green | `#143225` | App header, primary buttons, headings, strong text |
| Cover / deeper green | `#0e2418` | PDF cover dark layer |
| Secondary green | `#1a4632` | Button hover states, section headers |
| Accent green | `#52C275` | Progress bars, positive status, highlights, CTA accents |
| Light green background | `#f0fdf4` | Success states, light tinted panels |
| Card background | `#f8fafc` | Page background, card surfaces |
| Border gray | `#e2e8f0` | Input borders, card borders, dividers |
| Text gray | `#475569` | Body copy, secondary labels |
| Muted gray | `#64748b` | Step indicators, hint text |
| Footer muted | `#94a3b8` | Footer, placeholder text, optional labels |
| White | `#ffffff` | Inputs, cards, inverted text on dark |
| Body / email black | `#000000` | Email body text |

### Usage guidance

- **Primary CTAs:** dark green (`#143225`) background with white text. Hover: `#1a4632`.
- **Accent green** (`#52C275`) for progress fills, verified status badges, and positive highlights. Use sparingly — not for full button backgrounds.
- **Error states:** `red-600` (`#dc2626`) text, `red-400` border. Clear but not aggressive. Never use orange or amber for errors.
- **Warning / soft-DQ:** `#475569` or `#64748b` text with a neutral gray or light yellow-tinted border. Informational, not alarming.
- **Success states:** light green background `#f0fdf4`, accent green `#52C275` for icon/border.
- **Disabled / inactive:** `#e2e8f0` background, `#94a3b8` text.

---

## 3. Typography

### Fonts

| Use | Font | Fallback |
|---|---|---|
| App / web UI | Inter | system-ui, sans-serif |
| Email body | Aptos | Arial, sans-serif |
| PDF / report | Inter | (rendered by PDFMonkey) |

### Rules

- **Headings:** bold or semibold weight. Use dark green (`#143225`) for primary headings.
- **Body copy:** regular weight, `#475569` for secondary text, `#143225` for primary text.
- **Labels / small caps:** uppercase + letter-spacing only for short section labels, not for body text.
- **Minimum readable size:** 14px for body, 12px for captions/footers. Do not go below 12px in the web UI.
- **Do not commit or add font files.** Inter is loaded via Next.js `next/font` or CDN.

---

## 4. Voice and Tone

The FoodServiceIQ brand should feel:

- **Premium** — this is a professional analysis tool for restaurant operators, not a consumer app
- **Clean** — direct, efficient language without padding
- **Operator-focused** — uses foodservice industry terminology naturally
- **Confident** — makes clear, informed statements without hedging excessively
- **Direct** — gets to the point; operators are busy people

Avoid:
- Hype words: "massive," "incredible," "guaranteed," "revolutionary," "game-changing"
- Playful/consumer-app tone: emojis, casual slang, "Hey there!" openings
- Generic SaaS language: "leverage," "synergy," "scale your operations"
- Passive hedging: "might potentially possibly save"

Prefer:
- Qualified confidence: "likely," "typically," "based on your profile," "conservative estimate"
- Industry terms: "broadliner," "cost-plus," "procurement," "spend bucket," "invoice-level review"
- Action language: "book your full analysis," "confirm your savings estimate," "review your profile"
- Specificity: "$110,000/year" not "big savings"

### Validation messages

Validation messages should be **informative, soft, and non-hostile**. Remember this is paid ad traffic — the user opted in to learn about savings. Every message should keep the door open.

**Do:**
- "We weren't able to fully verify this website, but you can still continue."
- "Our program is designed for independent operators — if you operate an independent concept, please use that website instead."
- "We'll follow up with your team if we have any questions."

**Don't:**
- "Invalid." / "Error." / "Not eligible."
- "You don't qualify." / "This website is wrong."
- "We can't help you."

---

## 5. Component Styling Reference

### Primary button

```
bg-[#143225] text-white rounded-lg px-6 py-2.5 text-sm font-semibold
hover:bg-[#1a4632] transition-colors
disabled: bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed
```

### Secondary / back button

```
border border-[#e2e8f0] text-[#475569] rounded-lg px-6 py-2.5 text-sm font-medium
hover:bg-[#f8fafc] transition-colors
```

### Form input

```
w-full px-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm bg-white text-[#143225]
placeholder-[#94a3b8]
focus: outline-none ring-2 ring-[#52C275]/30 border-[#52C275]
error: border-red-400 ring-red-200
```

### Select / dropdown

```
w-full px-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm bg-white text-[#143225]
focus: outline-none ring-2 ring-[#52C275]/30 border-[#52C275]
```

### Textarea

```
Same as form input. resize-none. rows={3} default.
```

### Validation badge states

| State | Color treatment |
|---|---|
| `idle` | Hidden |
| `checking` | Muted gray text, spinner |
| `verified` | Accent green text (`#52C275`) with checkmark |
| `unable_to_verify_but_can_continue` | Muted gray text, informational |
| `likely_not_fit` | Amber/warning text, soft border |
| `national_chain` | Muted text, informational |
| `invalid_website` | Red text, requires correction |
| `non_us` | Muted gray text, polite ineligible message |
| `error` | Muted gray text, "try again later" |

### Step indicator

```
Progress bar: h-1 rounded-full
Completed segments: bg-[#52C275]
Incomplete segments: bg-[#e2e8f0]
Label: "Step X of Y" in text-sm text-[#64748b]
```

### Card / panel

```
bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm
```

### Success state

```
bg-[#f0fdf4] rounded-xl border border-[#52C275]/40 p-8 text-center
Heading: text-[#143225] font-semibold
Body: text-[#475569]
```

### Warning / soft-DQ state

```
text-[#475569] text-sm
Informational — no red, no harsh borders
```

### Invalid website state

```
text-red-600 text-sm
Requires user correction
```

### Non-US / ineligible state

```
text-[#64748b] text-sm
Polite and informational — no harsh language
```

---

## 6. Analyzer Quiz Design Rules

- **Mobile-first:** single column, full-width inputs, comfortable tap targets (min 44px height for buttons/inputs)
- **One step at a time:** show only current step fields — do not collapse all steps into one scroll
- **Progress indicator:** always visible at the top of the quiz
- **Contact fields last:** `full_name`, `email`, `phone` appear only on the final step
- **`top_skus` free text only:** no dropdown, no multi-select, no predefined categories in v1
- **Calm validation messages:** see Voice and Tone section above
- **Soft handling for `plausible_unverified`:** allow continuation with an informational message, not a warning
- **Hard block only on:**
  - Missing required fields
  - Malformed ZIP (non-U.S. format)
  - Invalid email format
  - `invalid_website` validation state (user can correct)
  - Active `checking` state (temporarily, to avoid race conditions)
- **Never hard-block on eligibility:** `national_chain`, `clear_non_fit`, `non_us`, `below_threshold` are all routing decisions handled server-side. Every completed form should be capturable.
- **Back navigation:** always available except on Step 1

---

## 7. Report / PDF Consistency

The web quiz and the PDF report should share a visual language but serve different purposes:

| Dimension | Web quiz | PDF report |
|---|---|---|
| Purpose | Conversion — collect lead data | Authority — deliver analysis |
| Tone | Conversational, efficient | Professional, report-like |
| Layout | Mobile-first, single column | 6-page print-layout |
| Logo | White wordmark in dark green header | Client logo + FSIQ wordmark |
| Colors | Same palette, lighter usage | Darker/richer palette |
| Typography | Inter, clean | Inter, structured |

Both share: dark green primary color, accent green highlights, Inter typography, and the FoodServiceIQ wordmark.

---

## 8. Tailwind Usage

Prefer inline Tailwind utilities over custom CSS. Use hex values directly in Tailwind when standard color classes don't match brand tokens:

```tsx
// Dark green backgrounds
className="bg-[#143225]"

// Accent green
className="bg-[#52C275]" // or text-[#52C275], border-[#52C275]

// Light card
className="bg-[#f8fafc] rounded-xl border border-[#e2e8f0]"

// Muted text
className="text-[#64748b]"

// Focus rings
className="focus:ring-2 focus:ring-[#52C275]/30 focus:border-[#52C275]"
```

No changes to `tailwind.config.ts` are required for Phase 4. Custom tokens may be formalized later if the color set stabilizes.

---

## References

- Dropdown values: `docs/FSIQ_SOP_v3.3.md §5`
- Validation UX: `docs/website-validation-spec.md`
- Form field order: `docs/analyzer-ux-flow.md`
- Savings math: `docs/savings-formula.md`
- Build phases: `docs/build-phases.md`
