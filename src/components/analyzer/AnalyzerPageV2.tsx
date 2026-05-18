// v2 page wrapper — sage background, hero, glass card, stats, testimonial.
// AnalyzerForm lives inside the glass card. This component has no client state.

import { AnalyzerForm } from '@/components/analyzer/AnalyzerForm';

/* ── PDF report artifact (CSS mock of the PDF the operator receives) ─────── */
function ReportArtifact() {
  return (
    <div className="relative mx-auto fsiq-float" style={{ width: 320, height: 200 }}>
      {/* Back page — rotated left */}
      <div
        className="report-page"
        style={{ left: 0, top: 30, width: 200, height: 150, transform: 'rotate(-9deg)' }}
      >
        <div className="p-3">
          <div className="h-1.5 w-10 rounded bg-[#52C275]/40" />
          <div className="mt-2 h-2 w-24 rounded bg-[#143225]/15" />
          <div className="mt-3 grid grid-cols-3 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 rounded bg-[#143225]/10" />
            ))}
          </div>
          <div className="mt-3 h-12 rounded bg-gradient-to-br from-[#52C275]/30 to-[#143225]/15" />
        </div>
      </div>

      {/* Cover page — center, front */}
      <div
        className="report-page"
        style={{ left: 60, top: 0, width: 200, height: 200, transform: 'rotate(2deg)', zIndex: 2 }}
      >
        <div
          className="h-full flex flex-col"
          style={{ background: 'linear-gradient(180deg, #143225 0%, #0e2418 100%)' }}
        >
          <div className="px-3 pt-3 flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/fsiq-iq-logo.png" alt="" className="w-3.5 h-3.5 rounded" aria-hidden="true" />
            <span className="text-white text-[8px] font-semibold tracking-wide">FoodServiceIQ</span>
          </div>
          <div className="px-3 mt-2">
            <p className="text-[7px] uppercase tracking-[0.18em] text-[#52C275] font-semibold">Savings Report</p>
            <p className="mt-1 text-white text-[10px] font-bold leading-snug">Blue Fork Kitchen</p>
            <p className="mt-3 text-[7px] text-white/60">Estimated annual savings</p>
            <p className="mt-0.5 text-white font-bold text-[18px] tracking-tight">$127,400</p>
            <p className="text-[7px] text-[#52C275] font-medium">↓ 6.8% on broadliner spend</p>
          </div>
          <div className="mt-auto px-3 pb-3">
            <div className="h-[2px] rounded-full bg-white/15 overflow-hidden">
              <div className="h-full w-3/4 bg-[#52C275]" />
            </div>
            <div className="mt-1.5 flex justify-between text-[6px] text-white/45">
              <span>6 pages</span><span>May 2026</span>
            </div>
          </div>
        </div>
      </div>

      {/* Front-right page */}
      <div
        className="report-page"
        style={{ left: 130, top: 28, width: 200, height: 150, transform: 'rotate(7deg)' }}
      >
        <div className="p-3">
          <p className="text-[6px] uppercase tracking-[0.16em] text-[#64748b] font-semibold">Line-item targets</p>
          <div className="mt-2 space-y-1.5">
            {[
              ['Chicken breast', '$8.40/lb', '−9%'],
              ['Fryer oil', '$32.10', '−12%'],
              ['Ribeye', '$14.80', '−6%'],
              ['Mozzarella', '$3.95', '−7%'],
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[7px]">
                <span className="text-[#143225]">{r[0]}</span>
                <span className="text-[#64748b]">{r[1]}</span>
                <span className="text-[#52C275] font-semibold">{r[2]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sparkle icon ─────────────────────────────────────────────────────────── */
function Sparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
      <path d="M8 1l1.3 5.4L14.7 8 9.3 9.3 8 14.7 6.7 9.3 1.3 8 6.7 6.7 8 1z" fill="#52C275" />
    </svg>
  );
}

/* ── Single stat ──────────────────────────────────────────────────────────── */
function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <p className="text-[28px] sm:text-[36px] font-bold tracking-[-0.02em] text-[#143225]">{n}</p>
      <p className="mt-1 text-[11px] sm:text-[12px] uppercase tracking-[0.1em] text-[#64748b] leading-snug">{label}</p>
    </div>
  );
}

/* ── Full v2 page ─────────────────────────────────────────────────────────── */
export function AnalyzerPageV2() {
  return (
    <div className="min-h-screen bg-sage">

        {/* Top bar */}
        <header className="relative z-10 px-6 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/fsiq-logo-white-transparent.png"
            alt="FoodServiceIQ"
            className="h-8"
          />
        </header>

        {/* Main content */}
        <main className="relative z-0 px-5 sm:px-8">
          <div className="max-w-[640px] mx-auto pt-6 sm:pt-10 pb-20">

            {/* Eyebrow badge */}
            <div className="text-center">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] bg-white/60 text-[#143225] border border-[#143225]/10 backdrop-blur">
                <span className="w-1.5 h-1.5 rounded-full bg-[#52C275]" aria-hidden="true" />
                Free savings analysis
              </span>
            </div>

            {/* Display headline with hand-drawn underline accent */}
            <h1 className="mt-5 text-center text-balance font-bold tracking-[-0.025em] leading-[1.04] text-[36px] sm:text-[48px] lg:text-[58px] text-[#143225]">
              Find out how much you&apos;re overpaying on{' '}
              <span className="relative inline-block">
                <span className="relative">food costs.</span>
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  height="10"
                  viewBox="0 0 200 10"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 7 Q 50 0, 100 5 T 198 5"
                    stroke="#52C275"
                    strokeWidth="3.2"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>

            {/* Subhead */}
            <p className="mt-5 text-center text-[15px] sm:text-[16px] max-w-md mx-auto leading-relaxed text-[#475569]">
              Get your free personalized $100k food costs audit&hellip;in under 30 seconds.
            </p>

            {/* PDF artifact */}
            <div className="mt-9 sm:mt-11">
              <ReportArtifact />
            </div>

            {/* Glass form card */}
            <div
              className="mt-9 sm:mt-12 rounded-[28px] p-6 sm:p-8 lg:p-10 glass-card"
            >
              <AnalyzerForm />
            </div>

            {/* Trust microcopy */}
            <div className="mt-7 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-x-7 gap-y-2 text-[13px] text-[#475569]">
              <span className="inline-flex items-center gap-2 justify-center">
                <Sparkle />Used by 500+ independent operators
              </span>
              <span className="inline-flex items-center gap-2 justify-center">
                <Sparkle />Average 6.4% reduction on broadliner spend
              </span>
            </div>

          </div>

          {/* Below-the-fold proof section */}
          <section className="border-t border-[#143225]/10">
            <div className="max-w-[1040px] mx-auto px-1 sm:px-4 py-14 sm:py-20">

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 sm:gap-6 text-center">
                <Stat n="$50M+" label="total lifetime profits our program has added to our clients' bottom line" />
                <Stat n="2,000+" label="restaurants achieving better profitability with our solutions" />
                <Stat n="$1.4B+" label="in aggregated buying power" />
              </div>

              {/* Testimonial card */}
              <div
                className="mt-12 rounded-[28px] p-8 sm:p-10 lg:p-12 bg-white/70 backdrop-blur"
                style={{ border: '1px solid rgba(20,50,37,0.08)' }}
              >
                <svg
                  width="24"
                  height="20"
                  viewBox="0 0 24 20"
                  fill="none"
                  className="text-[#52C275]"
                  aria-hidden="true"
                >
                  <path
                    d="M0 20V11C0 4.9 3.7.7 9 0v5C6.4 5.7 5 8.2 5 11h4v9H0zm14 0v-9C14 4.9 17.7.7 23 0v5c-2.6.7-4 3.2-4 6h4v9h-9z"
                    fill="currentColor"
                  />
                </svg>
                <p className="mt-5 text-[20px] sm:text-[24px] font-medium tracking-[-0.01em] leading-snug max-w-3xl text-balance text-[#143225]">
                  We were paying street pricing across the board and didn&apos;t know it.
                  FSIQ found{' '}
                  <span className="text-[#52C275]">$413,000 in annual savings</span>
                  {' '}in our first invoice review.
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full grid place-items-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #52C275, #143225)' }}
                    aria-hidden="true"
                  >
                    <span className="text-white text-[13px] font-bold">AL</span>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#143225]">Aaron Lyons</p>
                    <p className="text-[12px] text-[#64748b]">Operations · Dish Society (8 locations, Houston, TX)</p>
                  </div>
                </div>
              </div>

              {/* Compliance line */}
              <p className="mt-10 text-center text-[11px] leading-relaxed max-w-2xl mx-auto text-[#94a3b8]">
                By providing your information you consent to FoodServiceIQ contacting you about your savings estimate.
                We never sell your data. See our{' '}
                <a href="#" className="underline">Privacy Policy</a>
                {' '}and{' '}
                <a href="#" className="underline">Terms</a>.
              </p>

            </div>
          </section>
        </main>
    </div>
  );
}
