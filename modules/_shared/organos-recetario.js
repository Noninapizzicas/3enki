/**
 * organos-recetario — el mapa PURO de órgano → recurso encendible + el diff del plan.
 *
 * El BOSS (prisma/boss) es el CEREBRO: dice QUÉ órganos necesita el comercio. Este
 * recetario es lo que el EFECTOR (prisma/enforcement) usa para saber CÓMO se enciende
 * cada uno: el canal universal es un INTERRUPTOR del panel central (organo-<id>), que
 * el dueño del órgano reacciona en caliente (patrón interruptor.registrar/cambiado).
 *
 * `estado` es informativo — cuenta si HOY hay un dueño que reaccione:
 *   nativo      → ya vive en prisma (p.ej. carta → escaparate).
 *   hosteleria  → órgano del arquetipo hostelería (cocina + pase-cocina de pizzepos).
 *   previsto    → el interruptor es real, pero el módulo que lo bebe es follow-up.
 * Un órgano de un arquetipo CUSTOM (desconocido aquí) se acoge igual: su interruptor
 * se registra al vuelo. Sin drift: la SEMILLA de órganos sale de arquetipos-semilla.
 * Ver arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const { SEMILLA } = require('./arquetipos-semilla');

// meta por órgano conocido (los que declara la semilla). Todo lo demás = 'desconocido'.
const KNOWN_ORGANOS = {
  carta:     { estado: 'nativo',     nota: 'escaparate ya vive en prisma' },
  cocina:    { estado: 'hosteleria', nota: 'pizzepos cocina + pase-cocina' },
  recetario: { estado: 'vivo',       nota: 'órgano del ORIGEN (elaborado), no de un arquetipo: lo enciende boss por producto elaborado. Beater prisma: costeador (compuesto.coste.calculado) + puente-compuesto → coste.aplicar. El módulo prisma/recetario se retiró (2026-07-20): prisma no usa escandallo.' },
  agenda:  { estado: 'previsto',   nota: 'reserva/cita — módulo follow-up' },
  retorno: { estado: 'previsto',   nota: 'devolución del activo — módulo follow-up' },
  fianza:  { estado: 'previsto',   nota: 'depósito/garantía — módulo follow-up' },
  stock:   { estado: 'previsto',   nota: 'inventario por unidades — módulo follow-up' }
};

// la SEMILLA de órganos = unión de los organos[] que declaran los arquetipos semilla.
const ORGANOS_SEMILLA = [...new Set(SEMILLA.flatMap(a => a.organos || []))].sort();

// el id de interruptor que gobierna un órgano (canal universal de encendido).
function interruptorDe(organo) {
  return `organo-${organo}`;
}

function metaDe(organo) {
  return KNOWN_ORGANOS[organo] || { estado: 'desconocido', nota: 'órgano de arquetipo custom' };
}

// diff PURO: dado lo que el comercio necesita ahora (deseados) y lo ya aplicado,
// qué encender y qué quedó de sobra. Additivo-seguro: los sobrantes NO se apagan
// solos (la voluntad de apagar es humana, como la apoptosis de la homeostasis);
// se devuelven para dejar TESTIGO, no para actuar.
function diffPlan(deseados = [], aplicados = []) {
  const d = new Set(deseados);
  const a = new Set(aplicados);
  return {
    encender: [...d].filter(o => !a.has(o)).sort(),
    innecesarios: [...a].filter(o => !d.has(o)).sort()
  };
}

module.exports = { KNOWN_ORGANOS, ORGANOS_SEMILLA, interruptorDe, metaDe, diffPlan };
