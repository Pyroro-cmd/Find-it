import { NextResponse, type NextRequest } from 'next/server';
import { isValidToken, SESSION_COOKIE } from './lib/auth';

/**
 * Tout le site est privé. Seules la page de connexion et les ressources
 * statiques passent sans cookie valide.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/login')) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidToken(token)) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('suite', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
