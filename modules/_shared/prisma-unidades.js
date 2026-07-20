'use strict';

/**
 * prisma-unidades — CONVERSOR PURO: cero pensar, solo calcular.
 *
 * Tres trabajos deterministas, sin red ni estado:
 *   1) UNIDADES   — normaliza a una base canónica (masa→g · volumen→ml · conteo→u) y convierte entre ellas.
 *                   masa↔volumen SOLO con densidad (g/ml); si falta, NO inventa → devuelve null / faltante.
 *   2) PRECIO     — lleva un precio "X céntimos por (cantidad+unidad)" a céntimos POR UNIDAD BASE
 *                   (lo que el costeador multiplica). Ej: 350c/kg → 0.35 c/g.
 *   3) FÓRMULA PANADERA — % de cada componente sobre una REFERENCIA (la harina = 100%). Ese % es lo que
 *                   permite el GRAN ESCALADO: cambias un número (tamaño de tanda) y toda la receta escala.
 *
 * Todo PURO: entra número/objeto, sale número/objeto. El que llama trae los datos (densidad por insumo).
 */

// ── factores a la base canónica de cada dimensión ──
const BASE = { masa: 'g', volumen: 'ml', conteo: 'u' };
const FACTORES = {
  masa:    { mg: 0.001, g: 1, gr: 1, gramo: 1, gramos: 1, kg: 1000, kilo: 1000, kilos: 1000, kilogramo: 1000, kilogramos: 1000, t: 1e6, tonelada: 1e6 },
  volumen: { ml: 1, mililitro: 1, mililitros: 1, cc: 1, cl: 10, dl: 100, l: 1000, litro: 1000, litros: 1000 },
  conteo:  { u: 1, ud: 1, uds: 1, uni: 1, unidad: 1, unidades: 1, pza: 1, pieza: 1, piezas: 1, doc: 12, docena: 12, docenas: 12 },
};

const _round = (n, d = 2) => { const f = 10 ** d; return Math.round(n * f) / f; };

// normaliza el nombre de la unidad: minúsculas, sin tildes, sin punto/espacio final
function _norm(u) {
  return String(u == null ? '' : u).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.+$/, '');
}

// ¿a qué dimensión pertenece la unidad? → 'masa'|'volumen'|'conteo'|null
function dimensionDe(unidad) {
  const u = _norm(unidad);
  for (const dim of Object.keys(FACTORES)) if (u in FACTORES[dim]) return dim;
  return null;
}

// cantidad+unidad → { cantidad (en base), base, dimension } | { error }
function aBase(cantidad, unidad) {
  const n = Number(cantidad);
  const dim = dimensionDe(unidad);
  if (!dim) return { error: 'unidad_desconocida', unidad };
  if (!Number.isFinite(n)) return { error: 'cantidad_invalida', cantidad };
  return { cantidad: n * FACTORES[dim][_norm(unidad)], base: BASE[dim], dimension: dim };
}

/**
 * convierte una cantidad de una unidad a otra.
 * misma dimensión → factor directo.  masa↔volumen → necesita densidad_g_ml.  conteo↔otro → null (falta peso unitario).
 * @returns número convertido | null (si falta densidad para cruzar masa/volumen, o cruce imposible).
 */
function convertir(cantidad, desde, hacia, densidad_g_ml) {
  const a = aBase(cantidad, desde);
  const dimH = dimensionDe(hacia);
  if (a.error || !dimH) return null;
  let base = a.cantidad;                 // en la base de la dimensión de origen
  if (a.dimension !== dimH) {
    // solo masa↔volumen es puenteable, y solo con densidad (g/ml)
    const d = Number(densidad_g_ml);
    if (!(d > 0)) return null;           // sin densidad NO inventa
    if (a.dimension === 'masa' && dimH === 'volumen') base = base / d;   // g → ml
    else if (a.dimension === 'volumen' && dimH === 'masa') base = base * d;  // ml → g
    else return null;                    // conteo no cruza
  }
  return base / FACTORES[dimH][_norm(hacia)];
}

/**
 * PRECIO por unidad base. precio "precio_centimos por (cantidad+unidad)" → céntimos por 1 unidad base.
 * Ej: precioPorBase({ precio_centimos: 350, cantidad: 1, unidad: 'kg' }) → 0.35  (c/g)
 * @returns { coste_centimos_por_unidad, base } | { error }
 */
function precioPorBase({ precio_centimos, cantidad, unidad } = {}) {
  const p = Number(precio_centimos);
  const a = aBase(cantidad, unidad);
  if (a.error) return a;
  if (!Number.isFinite(p) || p < 0) return { error: 'precio_invalido', precio_centimos };
  if (!(a.cantidad > 0)) return { error: 'cantidad_invalida', cantidad };
  return { coste_centimos_por_unidad: p / a.cantidad, base: a.base };
}

/**
 * FÓRMULA PANADERA: % de cada componente sobre la REFERENCIA (base_ref = 100%).
 * componentes: [{ ref, cantidad, unidad, densidad_g_ml? }].  Requiere MASA (o volumen con densidad).
 * @returns { base_ref, formula: [{ ref, pct, gramos }], faltantes: [ref...] }
 */
function porcentajePanadero(componentes, base_ref) {
  const lista = Array.isArray(componentes) ? componentes : [];
  const faltantes = [];
  const gramosDe = (c) => {
    const dim = dimensionDe(c.unidad);
    if (dim === 'masa') return aBase(c.cantidad, c.unidad).cantidad;
    if (dim === 'volumen') { const g = convertir(c.cantidad, c.unidad, 'g', c.densidad_g_ml); return g == null ? null : g; }
    return null;   // conteo → sin peso unitario, no entra en % panadero
  };
  const ref = lista.find(c => c.ref === base_ref);
  const gRef = ref ? gramosDe(ref) : null;
  if (!ref || gRef == null || !(gRef > 0)) return { base_ref, formula: [], faltantes: [base_ref], error: 'referencia_sin_masa' };

  const formula = [];
  for (const c of lista) {
    const g = gramosDe(c);
    if (g == null) { faltantes.push(c.ref); continue; }   // NO inventa: lo avisa
    formula.push({ ref: c.ref, pct: _round((g / gRef) * 100, 2), gramos: _round(g, 3) });
  }
  return { base_ref, formula, faltantes };
}

/**
 * ESCALA una fórmula panadera a una tanda de producción — el gran escalado.
 * modo 'referencia': gramos = objetivo de la REFERENCIA (ej: 10 kg de harina).
 * modo 'total':      gramos = masa TOTAL de la tanda (se reparte por los %).
 * formula: [{ ref, pct }].  @returns [{ ref, cantidad, unidad: 'g' }]
 */
function escalar(formula, { modo = 'referencia', gramos } = {}) {
  const f = Array.isArray(formula) ? formula : [];
  const G = Number(gramos);
  if (!f.length || !Number.isFinite(G) || G <= 0) return [];
  let gRef;
  if (modo === 'total') {
    const sumaPct = f.reduce((s, x) => s + (Number(x.pct) || 0), 0) / 100;
    gRef = sumaPct > 0 ? G / sumaPct : 0;    // masa de la referencia que da ese total
  } else {
    gRef = G;                                 // el objetivo ES la referencia
  }
  return f.map(x => ({ ref: x.ref, cantidad: _round((Number(x.pct) || 0) / 100 * gRef, 3), unidad: 'g' }));
}

/**
 * PRECIO DE REFERENCIA (fase 1) — NO es compra, no busca el más barato.
 * De varios precios encontrados saca un coste estimado PRUDENTE, tirando a alto (para no quedarse corto).
 * Regla determinista: percentil 75 (por encima de la mediana, por debajo del máximo) — "medio, un poco alto".
 * @param precios array de céntimos (misma base).  @returns céntimos | null (si no hay ninguno válido).
 */
function precioReferencia(precios, { percentil = 75 } = {}) {
  const xs = (Array.isArray(precios) ? precios : []).map(Number).filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  if (xs.length === 1) return xs[0];
  const q = Math.min(100, Math.max(0, Number(percentil) || 0)) / 100;
  const pos = q * (xs.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return _round(xs[lo] + (xs[hi] - xs[lo]) * (pos - lo), 2);   // interpola → cae entre mediana y máximo
}

module.exports = { dimensionDe, aBase, convertir, precioPorBase, porcentajePanadero, escalar, precioReferencia, BASE, FACTORES };
