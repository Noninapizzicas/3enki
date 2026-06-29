'use strict';

/**
 * Motor del pack 'negocio' — la facultad DESPIERTA (hemisferio izquierdo).
 *
 * A diferencia de los packs de solo-memoria (diseño/copy), negocio tiene MOTOR:
 * computa aritmética determinista de food-cost/márgenes. El cuenco lo flexiona
 * vía lentes.motor.request {dominio:'negocio', op, args}. Una respuesta correcta
 * por entrada (no fuzzy) → reflejo puro, sin red, sin estado.
 *
 * Dinero SIEMPRE en céntimos (enteros), como el resto del cuerpo (pedido-tasador).
 *
 * Cada op es una función pura: (args) -> { ...resultado }  ó  lanza Error con
 * mensaje claro si el input no es sano (el cuenco lo traduce a 400).
 *
 * QUÍMICO: `pulso` es la op que el cuenco late a su cadencia (quimico.cada) y
 * cuyo retorno secreta como evento (quimico.evento). Es la hormona del pack:
 * un latido que prueba que la facultad química funciona, sin efectos peligrosos.
 */

const SANO_MAX_PCT = 35;   // food-cost saludable en restauración: <=35%
const AJUSTADO_MAX_PCT = 40; // 35-40 ajustado; >40 caro

function _entero(v, campo) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${campo} debe ser un número (céntimos)`);
  return Math.round(n);
}

// food_cost: coste vs pvp -> % y veredicto. El corazón del escandallo.
function food_cost(args = {}) {
  const coste = _entero(args.coste_centimos, 'coste_centimos');
  const pvp = _entero(args.pvp_centimos, 'pvp_centimos');
  if (pvp <= 0) throw new Error('pvp_centimos debe ser > 0');
  if (coste < 0) throw new Error('coste_centimos no puede ser negativo');
  const pct = Math.round((coste / pvp) * 1000) / 10;          // 1 decimal
  const margen = pvp - coste;
  const margen_pct = Math.round((margen / pvp) * 1000) / 10;
  const veredicto = pct <= SANO_MAX_PCT ? 'sano'
    : pct <= AJUSTADO_MAX_PCT ? 'ajustado' : 'caro';
  return { food_cost_pct: pct, margen_centimos: margen, margen_pct, veredicto };
}

// pvp_objetivo: ¿a cuánto vender para un food-cost objetivo?
function pvp_objetivo(args = {}) {
  const coste = _entero(args.coste_centimos, 'coste_centimos');
  const objetivo = Number(args.food_cost_objetivo_pct);
  if (!(objetivo > 0 && objetivo < 100)) throw new Error('food_cost_objetivo_pct ∈ (0,100)');
  if (coste < 0) throw new Error('coste_centimos no puede ser negativo');
  const pvp = Math.ceil(coste / (objetivo / 100));
  return { pvp_centimos: pvp, food_cost_objetivo_pct: objetivo };
}

// salud_margenes: agrega N items -> retrato del food-cost de la carta.
function salud_margenes(args = {}) {
  const items = Array.isArray(args.items) ? args.items : [];
  if (items.length === 0) throw new Error('items[] requerido');
  const evaluados = items.map(it => {
    const fc = food_cost({ coste_centimos: it.coste_centimos, pvp_centimos: it.pvp_centimos });
    return { nombre: it.nombre || '?', ...fc };
  });
  const caros = evaluados.filter(e => e.veredicto === 'caro');
  const medio = Math.round(evaluados.reduce((a, e) => a + e.food_cost_pct, 0) / evaluados.length * 10) / 10;
  return {
    items: evaluados,
    food_cost_medio_pct: medio,
    caros: caros.map(c => c.nombre),
    veredicto_global: caros.length === 0 ? 'sano' : caros.length <= evaluados.length / 3 ? 'ajustado' : 'caro'
  };
}

// pulso: la HORMONA. El químico la late a su cadencia; su retorno se secreta
// como evento negocio.pulso. Sin estado, sin peligro: un heartbeat que prueba
// que la facultad química del cuerpo respira.
function pulso() {
  return { vivo: true, umbral_sano_pct: SANO_MAX_PCT, umbral_ajustado_pct: AJUSTADO_MAX_PCT };
}

module.exports = { food_cost, pvp_objetivo, salud_margenes, pulso };
