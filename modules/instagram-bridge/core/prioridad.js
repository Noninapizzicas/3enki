'use strict';

/**
 * prioridad — G4 · OrdenDePrioridad · REFLEJO.
 *
 * Cuando hay seis trabajos y solo se puede hacer uno, alguien tiene que decidir
 * cual. Si lo decide "el que llego primero" se publica cuando apetece; si lo
 * decide el agente, el dueno espera detras de un capricho. Este reflejo fija el
 * orden en una escala, para que la decision sea la misma a las nueve de la
 * manana y a las once de la noche.
 *
 * Las tres reglas del diseno, y por que en ese orden:
 *   1. LO EMPEZADO GANA A LO NUEVO. Un trabajo a medias movio estado (un campo
 *      escrito, un editor abierto). Empezar otro encima deja el primero roto y
 *      el segundo sin sitio. Por eso pesa mas que nada (1000): ni el dueno ni
 *      una urgencia pueden desbancarlo.
 *   2. EL DUENO GANA AL AGENTE. El puente es del dueno; el agente propone. Si
 *      el dueno pidio algo, no se le mete delante lo que el agente decidio
 *      solo (100).
 *   3. PUBLICAR GANA A LEER. Leer se puede hacer otro dia; una publicacion
 *      preparada caduca, y ademas es la unica accion que el dueno echa de menos
 *      si no sale (50 > 10 > 0).
 *
 * La urgencia pesa 3 por escalon (0..3) → como mucho 9. Ese limite NO es
 * decorativo: es lo que garantiza que una urgencia no pueda volcar NINGUNA de
 * las tres reglas de arriba, porque la mas barata de ellas (leer) ya pesa 10.
 * Una urgencia que pudiera comprar el turno de una publicacion seria una forma
 * educada de saltarse el orden.
 *
 * Puro: sin reloj, sin red, sin estado. El orden es TOTAL: dos trabajos nunca
 * quedan "empatados" sin desempate (secuencia de llegada y, al final, id), para
 * que la cola (G3) sea reproducible al milisegundo.
 */

const { es_objeto, texto_no_vacio } = require('./formas');
const ritmo = require('./ritmo');

const CODIGOS = Object.freeze({
  TRABAJO_INVALIDO: 'trabajo_invalido',
  LISTA_INVALIDA: 'lista_invalida'
});

// Estados que cuentan como "empezado": el trabajo ya movio algo del mundo.
const EMPEZADOS = Object.freeze(['empezado', 'en_curso']);
// Estados que se pueden ordenar (lo cerrado ya no compite).
const VIVOS = Object.freeze(['nuevo', 'pendiente', 'empezado', 'en_curso', 'esperando']);

const PESOS = Object.freeze({
  empezado: 1000,
  dueno: 100,
  accion: Object.freeze({ publicar: 50, comentar: 30, responder: 30, seguir: 30, leer: 10, pulso: 0 }),
  urgencia: 3,
  urgencia_maxima: 3
});

const QUIENES = Object.freeze(['dueno', 'agente', 'sistema']);

function es_empezado(trabajo) {
  return es_objeto(trabajo) && EMPEZADOS.includes(String(trabajo.estado));
}

function peso_de_accion(accion) {
  if (!ritmo.es_accion(accion)) return null;
  const peso = PESOS.accion[accion];
  return typeof peso === 'number' ? peso : 0;
}

function urgencia_de(trabajo) {
  const u = Number(trabajo && trabajo.urgencia);
  if (!Number.isFinite(u)) return 0;
  return Math.min(PESOS.urgencia_maxima, Math.max(0, Math.round(u)));
}

/**
 * Valida lo minimo que necesita el orden: id, secuencia, accion conocida y
 * quien. Un trabajo sin estos datos no se puede ordenar sin inventar.
 *
 * @returns {{ok:boolean, motivo?:string, faltan:string[], invalidos:string[]}}
 */
function validar(trabajo) {
  if (!es_objeto(trabajo)) return { ok: false, motivo: CODIGOS.TRABAJO_INVALIDO, faltan: ['trabajo'], invalidos: ['trabajo'] };
  const faltan = [];
  const invalidos = [];
  if (!texto_no_vacio(trabajo.id)) faltan.push('id');
  if (!texto_no_vacio(trabajo.accion)) faltan.push('accion');
  else if (!ritmo.es_accion(trabajo.accion)) invalidos.push('accion');
  if (trabajo.quien === undefined || trabajo.quien === null) faltan.push('quien');
  else if (!QUIENES.includes(String(trabajo.quien))) invalidos.push('quien');
  const secuencia = Number(trabajo.secuencia);
  if (trabajo.secuencia === undefined || trabajo.secuencia === null) faltan.push('secuencia');
  else if (!Number.isFinite(secuencia)) invalidos.push('secuencia');
  return {
    ok: faltan.length === 0 && invalidos.length === 0,
    motivo: faltan.length === 0 && invalidos.length === 0 ? null : CODIGOS.TRABAJO_INVALIDO,
    faltan,
    invalidos
  };
}

/** Piezas del peso, para poder explicar un orden sin recalcularlo a mano. */
function desglose(trabajo) {
  const t = es_objeto(trabajo) ? trabajo : {};
  return {
    empezado: es_empezado(t) ? PESOS.empezado : 0,
    dueno: String(t.quien) === 'dueno' ? PESOS.dueno : 0,
    accion: peso_de_accion(t.accion) || 0,
    urgencia: urgencia_de(t) * PESOS.urgencia
  };
}

/** Peso total. Mas alto = antes. Un trabajo invalido pesa 0 y se descarta aparte. */
function peso(trabajo) {
  const d = desglose(trabajo);
  return d.empezado + d.dueno + d.accion + d.urgencia;
}

/**
 * Compara dos trabajos. Devuelve `orden: -1` si `a` va antes, `1` si va despues
 * y `0` solo si son el mismo trabajo (mismo id y misma secuencia).
 *
 * `razon` dice QUE nivel decidio: 'empezado' | 'dueno' | 'accion' | 'urgencia' |
 * 'antiguedad' | 'identico'. Sin eso, un orden es una caja negra.
 */
function comparar(a, b) {
  const va = validar(a);
  const vb = validar(b);
  if (!va.ok || !vb.ok) {
    return {
      ok: false,
      motivo: CODIGOS.TRABAJO_INVALIDO,
      orden: 0,
      razon: null,
      faltan: [...va.faltan, ...vb.faltan],
      invalidos: [...va.invalidos, ...vb.invalidos]
    };
  }

  const da = desglose(a);
  const db = desglose(b);
  const niveles = [
    ['empezado', da.empezado, db.empezado],
    ['quien', da.dueno, db.dueno],
    ['accion', da.accion, db.accion],
    ['urgencia', da.urgencia, db.urgencia]
  ];
  for (const [razon, pa, pb] of niveles) {
    if (pa !== pb) return { ok: true, orden: pa > pb ? -1 : 1, razon, pesos: { a: pa, b: pb } };
  }

  // Desempate: primero llego, primero se hace (FIFO). La secuencia la pone la
  // cola y no se repite nunca.
  const sa = Number(a.secuencia);
  const sb = Number(b.secuencia);
  if (sa !== sb) return { ok: true, orden: sa < sb ? -1 : 1, razon: 'antiguedad', secuencias: { a: sa, b: sb } };

  if (String(a.id) === String(b.id)) return { ok: true, orden: 0, razon: 'identico' };
  return { ok: true, orden: String(a.id) < String(b.id) ? -1 : 1, razon: 'identidad' };
}

function razon_de(a, b) {
  return comparar(a, b).razon;
}

function es_mejor(a, b) {
  return comparar(a, b).orden === -1;
}

/**
 * Ordena una lista de trabajos. Los invalidos NO se cuelan al principio: se
 * separan en `descartados` para que quien llama decida que hacer con ellos
 * (la cola los rechaza al encolar, asi que verlos aqui es un defecto).
 *
 * @param {object[]} lista
 * @returns {{ok:boolean, orden:object[], descartados:object[], motivo?:string}}
 */
function ordenar(lista) {
  if (!Array.isArray(lista)) {
    return { ok: false, motivo: CODIGOS.LISTA_INVALIDA, orden: [], descartados: [] };
  }
  const validos = [];
  const descartados = [];
  for (const trabajo of lista) {
    if (validar(trabajo).ok) validos.push(trabajo);
    else descartados.push(trabajo);
  }
  const orden = validos.slice().sort((a, b) => {
    const c = comparar(a, b);
    return c.ok ? c.orden : 0;
  });
  return { ok: descartados.length === 0, motivo: descartados.length === 0 ? null : CODIGOS.TRABAJO_INVALIDO, orden, descartados };
}

/** El que va primero (o `null` si no hay ninguno valido). */
function primero(lista) {
  const r = ordenar(lista);
  return r.orden.length ? r.orden[0] : null;
}

/**
 * ¿Quien adelanta a `trabajo`? Devuelve el primero que iria antes que el, o
 * `null` si ya es su turno. Es lo que G6 necesita para decir "no es tu turno"
 * sin tener que explicar la escala entera.
 */
function adelanta_a(trabajo, lista) {
  if (!validar(trabajo).ok) return null;
  const otros = (Array.isArray(lista) ? lista : []).filter((t) => es_objeto(t) && String(t.id) !== String(trabajo.id));
  const p = primero(otros);
  if (!p) return null;
  return comparar(p, trabajo).orden === -1 ? p : null;
}

module.exports = {
  CODIGOS,
  PESOS,
  EMPEZADOS,
  VIVOS,
  QUIENES,
  es_empezado,
  urgencia_de,
  validar,
  desglose,
  peso,
  comparar,
  razon_de,
  es_mejor,
  ordenar,
  primero,
  adelanta_a
};

// Vista "clase" para quien prefiera el nombre del diseno (G4 · OrdenDePrioridad).
module.exports.OrdenDePrioridad = Object.freeze({
  peso,
  comparar,
  razon_de,
  ordenar,
  primero,
  adelanta_a
});
