'use strict';

/**
 * cobertura — F4 · CoberturaOperativa · REFLEJO.
 *
 * Dice la VERDAD sobre lo que el puente sabe hacer hoy. No "que recetas hay", sino
 * que capacidades se pueden usar de verdad. La regla es una y es dura:
 *
 *   UNA RECETA VIGENTE QUE NO ENSAYA ES UNA CAPACIDAD CAIDA, NO "CASI LISTA".
 *
 * Por que no hay un estado intermedio: "casi lista" es la mentira comoda del
 * sistema. Una receta que esta en el catalogo pero que no se ha probado contra la
 * pantalla de ahora es una promesa, y prometer una capacidad que no se ha ensayado
 * es como se descubre a mitad de una publicacion que el paso 3 ya no existe — con
 * la pieza medio subida. Aqui solo hay dos estados: `operativa` y `caida`.
 *
 * Y una receta vigente que se ensayo ANTES de ser reparada (F2) tampoco cubre: el
 * ensayo es de la receta anterior. Ese caso tiene su propio motivo
 * (`receta_cambiada_sin_ensayo`) porque es distinto de no haber ensayado nunca y
 * se arregla igual: ensayando la receta nueva.
 *
 * Como se reconoce un ensayo de ESTA receta: por su FIRMA (`core/forma-receta`
 * `firma()`), que es la receta normalizada. Si el ensayo no trae firma se acepta
 * por numero de version, que es lo unico que hay; si trae firma y no coincide, NO
 * cubre, aunque la version coincida (una receta se puede reparar sin subir
 * version, y entonces la version miente y la firma no).
 *
 * Entradas:
 *   - el estado del catalogo (A4.4): de ahi salen las recetas vigentes;
 *   - los ensayos (A4.3): `{clave|plataforma+capacidad, version?, firma?, apto,
 *     momento, faltas?}`;
 *   - `esperadas`: las capacidades que el dueno declaro que el puente tiene que
 *     saber hacer. Una capacidad esperada sin receta es una caida, no un olvido que
 *     no se ve.
 *
 * Puro: sin reloj, sin red, sin IO. No toca el catalogo ni ensaya: solo cuenta.
 *
 * Ver plan-construccion.md (bloque 12, F4) y diseno-oop.md.
 */

const { es_objeto, texto_no_vacio, clonar } = require('../core/formas');
const forma_receta = require('../core/forma-receta');
const catalogo = require('./catalogo');

// Dos estados. Ni uno mas: el tercero que todo el mundo quiere anadir es "casi".
const ESTADOS = Object.freeze(['operativa', 'caida']);

const MOTIVOS = Object.freeze({
  OPERATIVA: 'operativa',
  SIN_RECETA: 'sin_receta',
  SIN_ENSAYO: 'sin_ensayo',
  ENSAYO_NO_APTO: 'ensayo_no_apto',
  RECETA_CAMBIADA_SIN_ENSAYO: 'receta_cambiada_sin_ensayo',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  ENTRADA_INVALIDA: 'entrada_invalida'
});

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

function clave_de(plataforma, capacidad) {
  return `${plataforma}:${capacidad}`;
}

function clave_de_ensayo(e, plataforma_por_defecto) {
  if (texto_no_vacio(e.clave)) return String(e.clave).trim();
  if (!texto_no_vacio(e.capacidad)) return null;
  const p = texto_no_vacio(e.plataforma) ? String(e.plataforma).trim().toLowerCase() : plataforma_por_defecto;
  return clave_de(p, String(e.capacidad).trim());
}

/** El ensayo mas reciente que cubre ESTA receta, o null. */
function ensayo_que_cubre(receta, ensayos, clave) {
  const firma = forma_receta.firma(receta.receta);
  const candidatos = [];

  for (const e of ensayos) {
    if (!es_objeto(e)) continue;
    if (clave_de_ensayo(e, receta.plataforma) !== clave) continue;

    if (texto_no_vacio(e.firma)) {
      // Con firma, la firma manda: version igual y firma distinta NO cubre.
      if (String(e.firma).trim() !== firma) continue;
    } else if (Number.isInteger(e.version)) {
      if (e.version !== receta.version) continue;
    } else {
      // Ni firma ni version: no se puede decir que sea de esta receta.
      continue;
    }
    candidatos.push(e);
  }

  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => String(a.momento || '').localeCompare(String(b.momento || '')));
  return candidatos[candidatos.length - 1];
}

/** ¿Hay algun ensayo de esta clave, aunque sea de otra version/firma? */
function hubo_ensayos(ensayos, clave, plataforma) {
  return ensayos.some((e) => es_objeto(e) && clave_de_ensayo(e, plataforma) === clave);
}

/**
 * Evalua una capacidad: la receta vigente de la clave y el ensayo que la cubre.
 *
 * @param {object} estado catalogo (A4.4)
 * @param {{plataforma?:string, capacidad:string}} consulta
 * @param {object[]} ensayos
 * @param {{declarada?:boolean}} [extra]
 */
function evaluar(estado, consulta, ensayos, extra) {
  const plataforma = texto_no_vacio(consulta.plataforma) ? String(consulta.plataforma).trim().toLowerCase() : catalogo.PLATAFORMA;
  const capacidad = String(consulta.capacidad).trim();
  const clave = clave_de(plataforma, capacidad);

  const vigente = estado.recetas.find((r) => r && r.clave === clave && r.estado === 'vigente') || null;
  const versiones = estado.recetas.filter((r) => r && r.clave === clave);
  const retiradas = versiones.filter((r) => r.estado === 'no_vigente');

  if (!vigente) {
    return {
      clave,
      plataforma,
      capacidad,
      estado: 'caida',
      operativa: false,
      motivo: MOTIVOS.SIN_RECETA,
      version: null,
      ensayo: null,
      declarada: Boolean(extra && extra.declarada),
      retirada: retiradas.length > 0,
      ultima_version: retiradas.length
        ? retiradas.reduce((max, r) => Math.max(max, r.version), 0)
        : (versiones.length ? versiones.reduce((max, r) => Math.max(max, r.version), 0) : null),
      resumen: retiradas.length
        ? `Capacidad CAIDA: la receta de ${capacidad} se retiro (rotura declarada) y no hay sustituta vigente.`
        : `Capacidad CAIDA: no hay receta vigente para ${capacidad}.`
    };
  }

  const ensayo = ensayo_que_cubre(vigente, ensayos, clave);

  if (!ensayo) {
    const cambio = hubo_ensayos(ensayos, clave, plataforma);
    return {
      clave,
      plataforma,
      capacidad,
      estado: 'caida',
      operativa: false,
      motivo: cambio ? MOTIVOS.RECETA_CAMBIADA_SIN_ENSAYO : MOTIVOS.SIN_ENSAYO,
      version: vigente.version,
      ensayo: null,
      declarada: Boolean(extra && extra.declarada),
      retirada: false,
      ultima_version: vigente.version,
      resumen: cambio
        ? `Capacidad CAIDA: la receta vigente de ${capacidad} (v${vigente.version}) no es la que se ensayo; falta ensayar la reparada.`
        : `Capacidad CAIDA: la receta vigente de ${capacidad} (v${vigente.version}) no se ha ensayado nunca. Una receta sin ensayo es una promesa.`
    };
  }

  const apto = ensayo.apto === true;
  const faltas = Array.isArray(ensayo.faltas) ? ensayo.faltas.length : 0;

  return {
    clave,
    plataforma,
    capacidad,
    estado: apto ? 'operativa' : 'caida',
    operativa: apto,
    motivo: apto ? MOTIVOS.OPERATIVA : MOTIVOS.ENSAYO_NO_APTO,
    version: vigente.version,
    ensayo: {
      momento: texto_no_vacio(ensayo.momento) ? String(ensayo.momento) : null,
      apto,
      faltas,
      firma: texto_no_vacio(ensayo.firma) ? String(ensayo.firma) : null
    },
    declarada: Boolean(extra && extra.declarada),
    retirada: false,
    ultima_version: vigente.version,
    resumen: apto
      ? `Operativa: ${capacidad} (v${vigente.version}) vigente y ensayada.`
      : `Capacidad CAIDA: el ultimo ensayo de ${capacidad} (v${vigente.version}) NO fue apto (${faltas} falta(s)).`
  };
}

/**
 * Mide la cobertura entera: por cada clave del catalogo (y por cada capacidad
 * esperada), si es operativa o caida.
 *
 * @param {object} estado catalogo (A4.4)
 * @param {object[]} ensayos
 * @param {{plataforma?:string, esperadas?:string[]}} [opciones]
 * @returns {object}
 */
function medir(estado, ensayos, opciones) {
  if (!catalogo.es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const lista_ensayos = Array.isArray(ensayos) ? ensayos : [];
  if (ensayos !== undefined && ensayos !== null && !Array.isArray(ensayos)) {
    return fallo(MOTIVOS.ENTRADA_INVALIDA, ['ensayos'], []);
  }

  const o = es_objeto(opciones) ? opciones : {};
  const plataforma = texto_no_vacio(o.plataforma) ? String(o.plataforma).trim().toLowerCase() : catalogo.PLATAFORMA;

  const capacidades = new Set();
  for (const r of estado.recetas) {
    if (!r || !texto_no_vacio(r.capacidad)) continue;
    if (r.plataforma !== plataforma) continue;
    capacidades.add(String(r.capacidad).trim());
  }

  const esperadas = Array.isArray(o.esperadas)
    ? o.esperadas.filter((c) => texto_no_vacio(String(c || ''))).map((c) => String(c).trim())
    : [];
  const esperadas_set = new Set(esperadas);
  for (const c of esperadas) capacidades.add(c);

  const evaluadas = Array.from(capacidades)
    .sort()
    .map((capacidad) => evaluar(estado, { plataforma, capacidad }, lista_ensayos, {
      declarada: esperadas_set.has(capacidad)
    }));

  const operativas = evaluadas.filter((c) => c.operativa);
  const caidas = evaluadas.filter((c) => !c.operativa);

  const cobertura_pct = evaluadas.length === 0
    ? 0
    : Math.round((operativas.length / evaluadas.length) * 100);

  let resumen;
  if (evaluadas.length === 0) {
    resumen = 'No hay ninguna capacidad declarada: el puente no sabe hacer nada todavia (y eso es una caida, no un cero neutro).';
  } else if (caidas.length === 0) {
    resumen = `${operativas.length} de ${evaluadas.length} capacidades operativas (${cobertura_pct}%): todas vigentes y ensayadas.`;
  } else {
    const detalle = caidas.map((c) => `${c.capacidad} (${c.motivo})`).join(', ');
    resumen = `${operativas.length} de ${evaluadas.length} capacidades operativas (${cobertura_pct}%). CAIDAS: ${detalle}. No se cuenta ninguna como "casi lista".`;
  }

  return {
    ok: true,
    plataforma,
    capacidades: evaluadas,
    operativas: operativas.length,
    caidas: caidas.length,
    total: evaluadas.length,
    cobertura_pct,
    caidas_detalle: caidas.map((c) => ({ clave: c.clave, capacidad: c.capacidad, motivo: c.motivo, resumen: c.resumen })),
    resumen
  };
}

/** Atajo para una capacidad: `operativa` | `caida`. */
function estado_de(estado, consulta, ensayos) {
  if (!catalogo.es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  if (!es_objeto(consulta) || !texto_no_vacio(consulta.capacidad)) {
    return fallo(MOTIVOS.ENTRADA_INVALIDA, ['capacidad'], []);
  }
  return evaluar(estado, consulta, Array.isArray(ensayos) ? ensayos : []);
}

module.exports = {
  ESTADOS,
  MOTIVOS,
  clave_de,
  clave_de_ensayo,
  ensayo_que_cubre,
  hubo_ensayos,
  evaluar,
  medir,
  estado_de
};

// Vista "clase" para quien prefiera el nombre del diseno (F4 · CoberturaOperativa).
module.exports.CoberturaOperativa = Object.freeze({
  medir,
  estado_de,
  evaluar,
  ESTADOS,
  MOTIVOS
});
