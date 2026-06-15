'use strict';

/**
 * Catálogo CANÓNICO de alérgenos — Anexo II del Reglamento (UE) 1169/2011
 * (en España, RD 126/2015). Los 14 alérgenos de declaración obligatoria.
 *
 * Fuente ÚNICA de verdad para todo el subsistema carta: la beben la proyección
 * (carta-digital), la PWA (static-template), el diseño impreso (carta-design) y
 * los schemas de producto/ingrediente. El TEXTO (nombre) es lo legalmente exigible;
 * el emoji es ayuda visual (los pictogramas oficiales AESAN se pueden sustituir luego).
 *
 * Sin efectos: solo datos + helpers puros.
 */

// Los 14, en el orden canónico del Anexo II.
const ALERGENOS = [
  { id: 'gluten',         nombre: 'Gluten',           emoji: '🌾', orden: 1 },
  { id: 'crustaceos',     nombre: 'Crustáceos',       emoji: '🦐', orden: 2 },
  { id: 'huevo',          nombre: 'Huevo',            emoji: '🥚', orden: 3 },
  { id: 'pescado',        nombre: 'Pescado',          emoji: '🐟', orden: 4 },
  { id: 'cacahuetes',     nombre: 'Cacahuetes',       emoji: '🥜', orden: 5 },
  { id: 'soja',           nombre: 'Soja',             emoji: '🫛', orden: 6 },
  { id: 'lacteos',        nombre: 'Lácteos',          emoji: '🥛', orden: 7 },
  { id: 'frutos_cascara', nombre: 'Frutos de cáscara', emoji: '🌰', orden: 8 },
  { id: 'apio',           nombre: 'Apio',             emoji: '🥬', orden: 9 },
  { id: 'mostaza',        nombre: 'Mostaza',          emoji: '🟡', orden: 10 },
  { id: 'sesamo',         nombre: 'Sésamo',           emoji: '⚪', orden: 11 },
  { id: 'sulfitos',       nombre: 'Sulfitos',         emoji: '🍷', orden: 12 },
  { id: 'altramuces',     nombre: 'Altramuces',       emoji: '🫘', orden: 13 },
  { id: 'moluscos',       nombre: 'Moluscos',         emoji: '🐚', orden: 14 }
];

const IDS = new Set(ALERGENOS.map(a => a.id));
const POR_ID = new Map(ALERGENOS.map(a => [a.id, a]));

// Mapa de códigos LEGACY (enum viejo de 12) → canónico. 'marisco' colapsaba
// crustáceos+moluscos; se EXPANDE a ambos (declarar de más es la dirección segura).
const LEGACY = {
  lactosa: ['lacteos'],
  frutos_secos: ['frutos_cascara'],
  marisco: ['crustaceos', 'moluscos']
};

/**
 * Normaliza una lista de códigos (mezcla de canónicos + legacy) a IDs canónicos,
 * deduplicados y ordenados por el orden del Anexo II. Descarta lo desconocido.
 */
function normalizar(codigos) {
  if (!Array.isArray(codigos)) return [];
  const out = new Set();
  for (const raw of codigos) {
    const c = String(raw || '').trim().toLowerCase();
    if (IDS.has(c)) { out.add(c); continue; }
    if (LEGACY[c]) for (const m of LEGACY[c]) out.add(m);
  }
  return ALERGENOS.filter(a => out.has(a.id)).map(a => a.id);
}

/** IDs canónicos → objetos {id, nombre, emoji} (para pintar chips/leyenda). */
function etiquetar(ids) {
  return normalizar(ids).map(id => POR_ID.get(id));
}

module.exports = { ALERGENOS, IDS, normalizar, etiquetar };
