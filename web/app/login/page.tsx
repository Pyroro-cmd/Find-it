import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, sessionToken } from '@/lib/auth';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; erreur?: string }>;
}) {
  const params = await searchParams;

  async function connect(formData: FormData) {
    'use server';

    const submitted = String(formData.get('motdepasse') ?? '');
    const expected = process.env.SITE_PASSWORD;
    const suite = String(formData.get('suite') ?? '/');

    if (!expected || submitted !== expected) {
      redirect(`/login?erreur=1${suite !== '/' ? `&suite=${encodeURIComponent(suite)}` : ''}`);
    }

    const store = await cookies();
    store.set(SESSION_COOKIE, await sessionToken(expected), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    redirect(suite.startsWith('/') ? suite : '/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-4xl">⛵</div>
          <h1 className="text-2xl font-semibold tracking-tight">Find-it</h1>
          <p className="mt-1 text-sm text-text-muted">Vos annonces de voiliers, filtrées.</p>
        </div>

        <form action={connect} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <input type="hidden" name="suite" value={params.suite ?? '/'} />
          <label htmlFor="motdepasse" className="block text-sm font-medium">
            Mot de passe
          </label>
          <input
            id="motdepasse"
            name="motdepasse"
            type="password"
            autoFocus
            autoComplete="current-password"
            className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
          />

          {params.erreur ? (
            <p className="mt-3 text-sm text-warn">Mot de passe incorrect.</p>
          ) : null}

          <button
            type="submit"
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition hover:opacity-90"
          >
            Entrer
          </button>
        </form>
      </div>
    </main>
  );
}
