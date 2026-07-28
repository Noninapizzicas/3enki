import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { subscribe } from '$lib/ui-core/mqtt';
import { saveUI, getState } from './persistence';

export const idiomaVoz = writable<string>(getInitialIdioma());
export const vozActiva = writable<string>(getInitialVoz());

function getInitialIdioma(): string {
  if (!browser) return 'es';
  const state = getState();
  return (state.ui as any)?.idiomaVoz || 'es';
}

function getInitialVoz(): string {
  if (!browser) return 'M1';
  const state = getState();
  return (state.ui as any)?.vozActiva || 'M1';
}

export function setIdiomaVoz(idioma: string): void {
  idiomaVoz.set(idioma);
  saveUI({ idiomaVoz: idioma } as any);
}

export function setVozActiva(voz: string): void {
  vozActiva.set(voz);
  saveUI({ vozActiva: voz } as any);
}

const unsubs: Array<() => void> = [];

export function initVozSubscriptions(): () => void {
  unsubs.push(subscribe('motor-voz.config.updated', (_, payload) => {
    const data = payload as { idioma?: string; voz?: string };
    if (data.idioma) setIdiomaVoz(data.idioma);
    if (data.voz) setVozActiva(data.voz);
  }));

  return () => { unsubs.forEach(u => u()); unsubs.length = 0; };
}

export function getIdiomaVoz(): string {
  return get(idiomaVoz);
}

export function getVozActiva(): string {
  return get(vozActiva);
}
