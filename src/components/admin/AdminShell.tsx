import Link from 'next/link';
import { adminLogout } from '@/actions/admin';

export function AdminShell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="min-h-screen admin-body-bg">
      <header className="sticky top-0 z-30 bg-[#143225] text-white border-b border-white/5">
        <div className="max-w-[1480px] mx-auto px-6 lg:px-10 h-14 flex items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fsiq-logo-white-transparent.png" alt="FoodServiceIQ" className="h-8 w-auto" />
          <nav className="hidden md:flex items-center gap-1 ml-4">
            <Link
              href="/admin/submissions"
              className="text-[13px] font-medium text-white/80 hover:text-white px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              Submissions
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <form action={adminLogout}>
              <button type="submit" className="text-[12px] text-white/55 hover:text-white transition-colors">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-[1480px] mx-auto px-6 lg:px-10 py-8">
        {title && (
          <h1 className="text-[32px] font-bold tracking-[-0.02em] text-[#143225] mb-6 fsiq-in">
            {title}
          </h1>
        )}
        {children}
      </main>

      <footer className="px-6 py-4 text-center">
        <p className="text-[11px] text-[#94a3b8]">FoodServiceIQ · Admin</p>
      </footer>
    </div>
  );
}
