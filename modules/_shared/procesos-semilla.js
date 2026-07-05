/**
 * procesos-semilla — las PLANTILLAS de proceso por arquetipo de Prisma.
 *
 * Gemelo de arquetipos-semilla: cada arquetipo DECLARA su proceso (los pasos
 * ordenados, con freno donde el traspaso debe validar). La cúpula de estados
 * (modules/estados) INSTANCIA una lista concreta desde aquí. Así PRISMA HEREDA
 * la cúpula sin cablearse: suelta sus plantillas y la máquina de estados las sirve.
 *
 * El FRENO entre pasos = el VALIDAR de blueprint-agentico subido del turno al PASO:
 * un paso con `freno.requiere:[campos]` no suelta al siguiente hasta que la entrega
 * trae esos campos. La entrega valida → recoge el siguiente. Si no valida → se atasca,
 * no arrastra basura (misma garantía "no_silent_drops" del freno original).
 *
 * ABIERTO como la semilla de arquetipos: la IA puede proponer plantillas custom que
 * entran por `extra` con prioridad (override del arquetipo). Ver prisma.md.
 */

'use strict';

// arquetipo → plantilla de proceso. El orden de los pasos ES el orden estricto.
// `freno.requiere` en un paso = las claves que su entrega debe traer para avanzar.
const SEMILLA = {
  comestible: {
    nombre: 'Proceso comestible', orden: 'estricto',
    pasos: [
      { clave: 'recibe',  texto: 'Recibe el pedido' },
      { clave: 'prepara', texto: 'Prepara', freno: { requiere: ['listo'] } },
      { clave: 'sirve',   texto: 'Sirve' },
      { clave: 'cobra',   texto: 'Cobra', freno: { requiere: ['pagado'] } }
    ]
  },
  servicio: {
    nombre: 'Proceso servicio', orden: 'estricto',
    pasos: [
      { clave: 'recibe',  texto: 'Recibe al cliente' },
      { clave: 'realiza', texto: 'Realiza el servicio', freno: { requiere: ['hecho'] } },
      { clave: 'entrega', texto: 'Entrega / valida con el cliente' },
      { clave: 'cobra',   texto: 'Cobra', freno: { requiere: ['pagado'] } }
    ]
  },
  uso_temporal: {
    nombre: 'Proceso alquiler', orden: 'estricto',
    pasos: [
      { clave: 'reserva',  texto: 'Reserva' },
      { clave: 'entrega',  texto: 'Entrega la unidad' },
      { clave: 'usa',      texto: 'En uso' },
      { clave: 'devuelve', texto: 'Devuelve', freno: { requiere: ['estado_ok'] } },
      { clave: 'fianza',   texto: 'Cierra la fianza' }
    ]
  },
  pieza: {
    nombre: 'Proceso pieza', orden: 'estricto',
    pasos: [
      { clave: 'localiza', texto: 'Localiza en stock' },
      { clave: 'prepara',  texto: 'Prepara' },
      { clave: 'entrega',  texto: 'Entrega' },
      { clave: 'cobra',    texto: 'Cobra', freno: { requiere: ['pagado'] } }
    ]
  }
};

const SEMILLA_IDS = new Set(Object.keys(SEMILLA));

// plantilla de un arquetipo. `extra` = mapa de plantillas custom (override con prioridad).
function plantillaDe(arquetipo, extra = {}) {
  if (extra && typeof extra === 'object' && extra[arquetipo]) return extra[arquetipo];
  return SEMILLA[arquetipo] || null;
}

module.exports = { SEMILLA, SEMILLA_IDS, plantillaDe };
