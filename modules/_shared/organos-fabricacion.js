/**
 * organos-fabricacion — el mapa PURO órgano → recurso encendible del HACER, + el diff del plan.
 * Hermano de organos-recetario (comercio).
 *
 * El BOSS de construcción (follow-up) dirá QUÉ órganos necesita la obra: la unión de los que
 * piden sus arquetipos presentes + los UNIVERSALES (los que toda obra enciende, sea barco o
 * edificio). El efector los enciende por interruptor (organo-<id>), patrón interruptor.
 * registrar/cambiado. Sin drift: la semilla de órganos por arquetipo sale de arquetipos-fabricacion.
 *
 * `estado` es informativo (si hoy hay un dueño que reaccione). Casi todo 'previsto': los módulos
 * que beben cada órgano son follow-up; hoy existe la BASE (el calendario para 'planificacion', la
 * lente ingenieria-experta para 'calculo_estructural'). Ver propuestas/prisma-construccion.md.
 */

'use strict';

const { SEMILLA } = require('./arquetipos-fabricacion');

// órganos que SIEMPRE enciende una obra (transversales a todo lo construido).
const ORGANOS_UNIVERSALES = ['presupuesto', 'planificacion', 'normativa', 'seguridad'];

const KNOWN_ORGANOS = {
  // por arquetipo
  calculo_estructural: { estado: 'previsto', nota: 'resistencia/esfuerzos — lo bebe la lente ingenieria-experta' },
  ensayo_material:     { estado: 'previsto', nota: 'ensayo de hormigón/acero/… — módulo follow-up' },
  inspeccion:          { estado: 'previsto', nota: 'inspección de fase = freno del rail (etapas-construccion)' },
  calculo_termico:     { estado: 'previsto', nota: 'térmico/acústico — módulo follow-up' },
  estanqueidad:        { estado: 'previsto', nota: 'prueba de estanqueidad/aislamiento' },
  dimensionado:        { estado: 'previsto', nota: 'potencia/caudal/frío/energía del sistema' },
  prueba_funcional:    { estado: 'previsto', nota: 'prueba de funcionamiento del sistema' },
  medicion:            { estado: 'previsto', nota: 'mediciones / cantidades' },
  control_calidad:     { estado: 'previsto', nota: 'calidad superficial del acabado' },
  calculo_uniones:     { estado: 'previsto', nota: 'soldadura/tornillería/ensamble' },
  // universales
  presupuesto:         { estado: 'previsto', nota: 'BOM + mediciones + precios — gemelo de prisma/coste' },
  planificacion:       { estado: 'previsto', nota: 'agenda/gantt — lo bebe el calendario ya construido' },
  normativa:           { estado: 'previsto', nota: 'CTE/Eurocódigo/normativa de dominio — el freno' },
  seguridad:           { estado: 'previsto', nota: 'PRL — seguridad y salud' }
};

// la SEMILLA de órganos = universales + unión de los que declaran los arquetipos semilla.
const ORGANOS_SEMILLA = [...new Set(
  ORGANOS_UNIVERSALES.concat(SEMILLA.flatMap(a => a.organos || []))
)].sort();

function interruptorDe(organo) { return `organo-${organo}`; }
function metaDe(organo) { return KNOWN_ORGANOS[organo] || { estado: 'desconocido', nota: 'órgano de arquetipo custom' }; }

// los órganos que enciende una obra = universales SIEMPRE + los de sus arquetipos presentes.
function organosDe(arquetiposPresentes = [], extra = []) {
  const registro = (Array.isArray(extra) ? extra : []).concat(SEMILLA);
  const porArq = (Array.isArray(arquetiposPresentes) ? arquetiposPresentes : []).flatMap(id => {
    const a = registro.find(x => x.id === id);
    return a ? (a.organos || []) : [];
  });
  return [...new Set(ORGANOS_UNIVERSALES.concat(porArq))].sort();
}

// diff PURO (gemelo de organos-recetario): additivo-seguro, los sobrantes NO se apagan solos.
function diffPlan(deseados = [], aplicados = []) {
  const d = new Set(deseados); const a = new Set(aplicados);
  return {
    encender: [...d].filter(o => !a.has(o)).sort(),
    innecesarios: [...a].filter(o => !d.has(o)).sort()
  };
}

module.exports = { KNOWN_ORGANOS, ORGANOS_UNIVERSALES, ORGANOS_SEMILLA, interruptorDe, metaDe, organosDe, diffPlan };
