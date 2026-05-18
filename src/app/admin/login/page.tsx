import { adminLogin } from '@/actions/admin';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="min-h-screen bg-sage flex items-center justify-center p-4">
      <div className="w-full max-w-sm glass-card rounded-[28px] p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/fsiq-logo-black-transparent.png"
          alt="FoodServiceIQ"
          className="h-7 mb-7"
        />

        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#143225] mb-1">
          Admin Access
        </h1>
        <p className="text-[14px] text-[#475569] mb-7">
          Enter your access token to continue.
        </p>

        <form action={adminLogin} className="space-y-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b] mb-2">
              Access token
            </label>
            <input
              type="password"
              name="token"
              required
              autoComplete="current-password"
              className="field-underline"
              placeholder="••••••••••••"
            />
          </div>

          {error && (
            <p className="text-[13px] text-[#dc2626]">{error}</p>
          )}

          <button type="submit" className="cta-pill mt-1">
            Sign in
          </button>
        </form>
      </div>

      <p className="absolute bottom-6 text-[11px] text-[#94a3b8]">
        FoodServiceIQ · Admin
      </p>
    </div>
  );
}
