/**
 * arquetipos-fabricacion — la SEMILLA de arquetipos del ELEMENTO construido + el clasificador
 * POR LA FORMA. Hermano de arquetipos-semilla (comercio).
 *
 * Allí la forma clasifica lo que se VENDE (comestible/servicio/…); aquí clasifica el ROL del
 * elemento que se HACE. El arquetipo SUBE de nivel respecto a edificación: deja de ser
 * estructural/cerramiento/tierras (solo obra) para ser universal a TODO lo construido —
 * un casco de barco, un chasis de coche, las patas de una silla y el bastidor de una cámara
 * de frío son todos 'estructura' porque su FORMA (soportan, dan forma) coincide.
 *
 * El arquetipo decide QUÉ cálculo/órgano necesita la pieza. La ESPINA (las etapas) vive en
 * etapas-construccion; esto es el eje transversal. Registro ABIERTO como en comercio: la IA
 * propone, un humano aprueba; los custom entran por `extra` con prioridad.
 * Ver arquitectura/decisiones/propuestas/prisma-construccion.md.
 */

'use strict';

// forma = { funcion } — el papel del elemento. El orden fija la PRIORIDAD; 'union' es el default.
const SEMILLA = [
  { id: 'estructura', reglas: [{ funcion: 'soporta' }],
    organos: ['calculo_estructural', 'ensayo_material', 'inspeccion'] },
  { id: 'envolvente', reglas: [{ funcion: 'cierra' }, { funcion: 'aisla' }],
    organos: ['calculo_termico', 'estanqueidad'] },
  { id: 'sistema', reglas: [{ funcion: 'conduce' }, { funcion: 'energiza' }],
    organos: ['dimensionado', 'prueba_funcional'] },
  { id: 'acabado', reglas: [{ funcion: 'reviste' }],
    organos: ['medicion', 'control_calidad'] },
  { id: 'union', reglas: [], por_defecto: true,
    organos: ['calculo_uniones'] }
];

const SEMILLA_IDS = new Set(SEMILLA.map(a => a.id));

function _matchRegla(regla, forma) {
  return Object.keys(regla).every(k => forma[k] === regla[k]);
}

// clasifica la forma del elemento → id de arquetipo. `extra` = custom aprobados (prioridad).
function clasificar(forma = {}, extra = []) {
  const registro = (Array.isArray(extra) ? extra : []).concat(SEMILLA);
  for (const a of registro) {
    if (a.por_defecto) continue;
    if ((a.reglas || []).some(r => _matchRegla(r, forma))) return a.id;
  }
  const def = registro.find(a => a.por_defecto) || SEMILLA[SEMILLA.length - 1];
  return def.id;
}

module.exports = { SEMILLA, SEMILLA_IDS, clasificar };
