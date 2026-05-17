import { NextRequest, NextResponse } from 'next/server';

// Edge-runtime safe constant-time string comparison (no Node crypto dependency)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    return NextResponse.next();
  }
  const session = request.cookies.get('admin_session')?.value;
  const token = process.env.ADMIN_ACCESS_TOKEN;
  if (!token || !session) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  if (!safeEqual(session, token)) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
