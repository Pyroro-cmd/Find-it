/**
 * Protection du site par un mot de passe unique.
 *
 * Le site est personnel : il n'y a pas de comptes, juste un secret partagé.
 * Le cookie ne contient pas le mot de passe mais un HMAC-SHA256 de celui-ci,
 * pour qu'un cookie volé ne révèle pas le secret.
 *
 * Utilise l'API Web Crypto, disponible à la fois dans le runtime Edge du
 * middleware et dans le runtime Node des Server Actions.
 */

export const SESSION_COOKIE = 'findit_session';
const SESSION_PAYLOAD = 'findit-v1';

export async function sessionToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(SESSION_PAYLOAD));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  const password = process.env.SITE_PASSWORD;
  if (!password || !token) return false;
  return timingSafeEqual(token, await sessionToken(password));
}

/** Comparaison à durée constante : une comparaison naïve fuit le préfixe correct. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
