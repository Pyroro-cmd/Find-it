'use client';

import { useEffect, useState } from 'react';
import type { Dataset } from './types';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export type DatasetState =
  | { status: 'loading' }
  | { status: 'ready'; dataset: Dataset }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/**
 * Charge le fichier produit par la collecte quotidienne.
 *
 * Il n'y a pas d'API : le fichier est servi tel quel à côté du site. Une
 * seule requête au chargement, puis tout le filtrage se fait en mémoire —
 * pour quelques centaines d'annonces, c'est instantané et ça évite tout
 * serveur à maintenir.
 */
export function useDataset(): DatasetState {
  const [state, setState] = useState<DatasetState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch(`${BASE}/data/listings.json`, { cache: 'no-store' })
      .then(async (response) => {
        // Avant la première collecte, le fichier n'existe pas encore : ce n'est
        // pas une erreur, c'est un site qui attend ses données.
        if (response.status === 404) {
          if (!cancelled) setState({ status: 'empty' });
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const dataset = (await response.json()) as Dataset;
        if (!cancelled) {
          setState(
            Array.isArray(dataset.listings) && dataset.listings.length > 0
              ? { status: 'ready', dataset }
              : { status: 'empty' },
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
