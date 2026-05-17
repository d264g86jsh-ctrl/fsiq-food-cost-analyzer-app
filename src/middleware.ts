import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

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
  const sessionBuf = Buffer.from(session);
  const tokenBuf = Buffer.from(token);
  const isValid =
    sessionBuf.length === tokenBuf.length &&
    timingSafeEqual(sessionBuf, tokenBuf);
  if (!isValid) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
