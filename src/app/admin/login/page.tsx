import { adminLogin } from '@/actions/admin';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-[#e2e8f0] rounded-xl p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/fsiq-logo-black-transparent.png" alt="FoodServiceIQ" className="h-7 mb-6" />
        <h1 className="text-lg font-semibold text-[#143225] mb-1">Admin Access</h1>
        <p className="text-sm text-[#64748b] mb-6">Enter your access token to continue.</p>
        <form action={adminLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#143225] mb-1.5">Access token</label>
            <input
              type="password"
              name="token"
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#52C275]/30 focus:border-[#52C275]"
              placeholder="••••••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="w-full px-4 py-2.5 bg-[#143225] text-white text-sm font-semibold rounded-lg hover:bg-[#1a4632] transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
      <p className="absolute bottom-6 text-xs text-[#94a3b8]">FoodServiceIQ — Admin</p>
    </div>
  );
}
