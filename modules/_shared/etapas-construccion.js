/**
 * etapas-construccion — LA ESPINA universal del HACER: las ETAPAS por las que pasa TODO
 * lo construido (barco · coche · mesa · silla · cámara de frío · edificio).
 *
 * El hallazgo que sube el techo del modelo (corrección del dueño): lo universal NO es el
 * tipo de elemento (eso era solo edificación), son las ETAPAS. El elemento cambia
 * (arquetipos-fabricacion), el DOMINIO cambia el sabor del cálculo, pero las etapas son
 * UNA sola: diseño → aprovisionamiento → fabricación → inspección → entrega.
 *
 * Es una PLANTILLA de proceso para la cúpula de estados (modules/estados): orden ESTRICTO,
 * con frenos = inspecciones/ensayos entre etapas (no fabricas antes de diseñar; no entregas
 * antes de inspeccionar). El rail vivo era la pieza que faltaba; aquí es la espina.
 * Ver arquitectura/decisiones/propuestas/prisma-construccion.md.
 */

'use strict';

// LA OBRA — el proceso universal. Mismo formato que procesos-semilla (clave/texto/freno),
// para que estados.instanciar/estados.crear lo sirvan tal cual.
const OBRA = {
  nombre: 'Proceso de obra', orden: 'estricto',
  pasos: [
    { clave: 'diseño',            texto: 'Diseño / proyecto' },
    { clave: 'aprovisionamiento', texto: 'Aprovisionamiento (materiales / BOM)' },
    { clave: 'fabricacion',       texto: 'Fabricación / montaje' },
    { clave: 'inspeccion',        texto: 'Inspección / ensayo', freno: { requiere: ['ensayo_ok'] } },
    { clave: 'entrega',           texto: 'Entrega / recepción', freno: { requiere: ['recepcion_ok'] } }
  ]
};

// plantilla de las etapas para un dominio. `extra` = plantillas custom (override con prioridad).
// El dominio (naval/automocion/mueble/refrigeracion/edificacion) puede AÑADIR frenos (más
// inspecciones intermedias), no quitar la espina. Por defecto, la OBRA universal.
function plantillaEtapas(dominio, extra = {}) {
  if (extra && typeof extra === 'object' && dominio && extra[dominio]) return extra[dominio];
  return OBRA;
}

module.exports = { OBRA, plantillaEtapas };
