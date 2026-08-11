'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase';

/**
 * Actions déclenchées depuis l'interface. Elles s'exécutent côté serveur, avec
 * la service_role key ; le navigateur ne voit jamais la clé Supabase.
 */

export async function toggleFavorite(id: string, current: boolean): Promise<void> {
  const { error } = await supabase().from('listings').update({ is_favorite: !current }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
}

export async function hideListing(id: string): Promise<void> {
  const { error } = await supabase().from('listings').update({ is_hidden: true }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
}

export async function saveNote(id: string, note: string): Promise<void> {
  const { error } = await supabase()
    .from('listings')
    .update({ user_note: note.trim() || null })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
}

export async function updateCriteria(formData: FormData): Promise<void> {
  const number = (key: string): number | null => {
    const raw = formData.get(key);
    if (raw == null || raw === '') return null;
    const n = Number(String(raw).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const hullTypes = formData.getAll('allowed_hull_types').map(String);
  const facades = formData.getAll('allowed_facades').map(String);

  const patch = {
    min_length_m: number('min_length_m') ?? 9.5,
    ideal_min_length_m: number('ideal_min_length_m') ?? 10,
    max_price_eur: Math.round(number('max_price_eur') ?? 22000),
    ideal_max_price_eur: Math.round(number('ideal_max_price_eur') ?? 20000),
    min_year_built: number('min_year_built'),
    max_year_built: number('max_year_built'),
    allowed_hull_types: hullTypes.length > 0 ? hullTypes : ['monocoque', 'catamaran', 'trimaran'],
    // Aucune façade cochée = aucune restriction, plutôt qu'aucun résultat.
    allowed_facades: facades.length > 0 ? facades : null,
    exclude_projects: formData.get('exclude_projects') === 'on',
    exclude_pro_sellers: formData.get('exclude_pro_sellers') === 'on',
    include_unknown_length: formData.get('include_unknown_length') === 'on',
  };

  const { error } = await supabase().from('search_criteria').update(patch).eq('id', true);
  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/reglages');
}
