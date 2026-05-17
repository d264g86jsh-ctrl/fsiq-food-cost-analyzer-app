import Link from 'next/link';
import { adminLogout } from '@/actions/admin';

export function AdminShell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="bg-[#143225] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fsiq-logo-white-transparent.png" alt="FoodServiceIQ" className="h-7" />
          <nav className="hidden sm:flex gap-4 text-sm">
            <Link href="/admin/submissions" className="text-white/80 hover:text-white transition-colors">
              Submissions
            </Link>
          </nav>
        </div>
        <form action={adminLogout}>
          <button type="submit" className="text-white/70 text-sm hover:text-white transition-colors">
            Log out
          </button>
        </form>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {title && <h1 className="text-xl font-semibold text-[#143225] mb-6">{title}</h1>}
        {children}
      </main>
      <footer className="px-6 py-4 text-center">
        <p className="text-xs text-[#94a3b8]">FoodServiceIQ — Admin</p>
      </footer>
    </div>
  );
}
