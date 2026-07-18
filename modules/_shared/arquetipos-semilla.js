/**
 * arquetipos-semilla — la SEMILLA de arquetipos de Prisma + el clasificador POR LA FORMA.
 *
 * Fuente única del clasificador (la usan prisma/adaptador y prisma/arquetipos, sin drift).
 * Un arquetipo se decide por la FORMA de la descomposición (ejes + naturalezas), NO por la
 * superficie del producto: un corte de pelo y un masaje caen en 'servicio' porque su forma
 * coincide, no porque se parezcan. El registro (prisma/arquetipos) es ABIERTO: la IA propone
 * arquetipos nuevos y un humano los aprueba (anti-wipe); esos custom entran por `extra` y tienen
 * prioridad sobre la semilla. Ver arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

// Cada arquetipo: reglas = OR de condiciones (cada condición = AND de {campo: valor} sobre la forma).
// El orden fija la PRIORIDAD (uso_temporal → servicio → comestible → pieza por defecto).
const SEMILLA = [
  { id: 'uso_temporal', reglas: [{ ciclo: 'con_retorno' }],
    sub_formas: ['variante', 'añadido'], modelo_precio: 'por_tiempo', organos: ['agenda', 'retorno', 'fianza'] },
  { id: 'servicio', reglas: [{ tiempo: 'cita' }, { stock: 'capacidad_temporal' }],
    sub_formas: ['variante', 'personalizacion_libre'], modelo_precio: 'por_tiempo|rango_valoracion', organos: ['agenda'] },
  // recetario NO cuelga de comestible — cuelga del ORIGEN (elaborado): lo enciende boss por
  // producto, no por arquetipo. Una pizza de_reventa (comprada) no lo lleva; una lámpara
  // elaborada sí. Aquí solo quedan los órganos que SÍ son de la forma comestible.
  { id: 'comestible', reglas: [{ stock: 'ingredientes' }, { precio: 'por_peso' }],
    sub_formas: ['modificacion', 'añadido', 'variante'], modelo_precio: 'escandallo', organos: ['carta', 'cocina'] },
  { id: 'pieza', reglas: [], por_defecto: true,
    sub_formas: ['variante', 'añadido'], modelo_precio: 'por_unidad', organos: ['stock'] }
];

const SEMILLA_IDS = new Set(SEMILLA.map(a => a.id));

function _matchRegla(regla, forma) {
  return Object.keys(regla).every(k => forma[k] === regla[k]);
}

// clasifica una forma → id de arquetipo. `extra` = arquetipos custom aprobados (tienen prioridad).
function clasificar(ejes = {}, naturalezas = {}, extra = []) {
  const forma = { tiempo: ejes.tiempo, ciclo: ejes.ciclo, stock: naturalezas.stock, precio: naturalezas.precio };
  const registro = (Array.isArray(extra) ? extra : []).concat(SEMILLA);
  for (const a of registro) {
    if (a.por_defecto) continue;
    if ((a.reglas || []).some(r => _matchRegla(r, forma))) return a.id;
  }
  const def = registro.find(a => a.por_defecto) || SEMILLA[SEMILLA.length - 1];
  return def.id;
}

module.exports = { SEMILLA, SEMILLA_IDS, clasificar };
