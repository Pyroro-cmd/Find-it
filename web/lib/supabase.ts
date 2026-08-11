import { createClient } from '@supabase/supabase-js';
import 'server-only';

/**
 * Client Supabase côté serveur uniquement.
 *
 * On utilise la service_role key, qui contourne le RLS. C'est volontaire et
 * sûr ici parce que (1) ce module est `server-only`, la clé n'atteint donc
 * jamais le navigateur, et (2) tout le site est derrière un mot de passe.
 * Aucune policy RLS publique n'existe : même si la clé anon fuitait, elle ne
 * donnerait accès à rien.
 */

export function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies dans les variables d\'environnement.',
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
