'use client';

// Phase 4 placeholder. Phase 8 will replace the copy with dynamic qualified/DQ messaging.

export function SuccessState() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <header className="bg-[#143225] px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/fsiq-logo-white-transparent.png" alt="FoodServiceIQ" className="h-8" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-[#f0fdf4] rounded-xl border border-[#52C275]/40 p-8 text-center">
          <div className="mb-4 text-[#52C275] text-3xl" aria-hidden="true">✓</div>
          <h2 className="text-xl font-semibold text-[#143225] mb-3">
            {"We've received your information"}
          </h2>
          <p className="text-[#475569] text-sm leading-relaxed">
            {"We're preparing your food cost analysis. You'll receive a personalized report at the email address you provided — typically within a few minutes."}
          </p>
          <p className="mt-4 text-[#64748b] text-xs">
            Our team may follow up if we have any questions about your profile.
          </p>
        </div>
      </main>

      <footer className="px-4 py-6 text-center">
        <p className="text-xs text-[#94a3b8]">FoodServiceIQ — Confidential</p>
      </footer>
    </div>
  );
}
