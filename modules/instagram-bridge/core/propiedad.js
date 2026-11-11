'use strict';

/**
 * propiedad — P3 · ReglaDePropiedad · REFLEJO.
 *
 * El saber hacer se comparte y se mejora una vez para todos; el estado no se
 * comparte jamas. Dicho ejecutablemente: hay almacenes COMPARTIDOS (lo que se
 * sabe de la plataforma) y almacenes PRIVADOS (lo que le pasa a un proyecto), y
 * un almacen que mezcla las dos clases es un exceso, no una comodidad.
 *
 * Tabla declarada (diseno-oop.md, P3). Cualquier almacen que no este aqui es un
 * exceso: una tabla abierta es una tabla que nadie audita.
 *   compartible: catalogo-recetas · memoria-cambios
 *   privado:     retratos · bandejas · colas · tolerancia · evidencia ·
 *                confirmaciones · autorizaciones
 *   registro:    padron — multi-proyecto POR DISENO (es el indice de quien es
 *                dueno de que); cada entrada se sirve filtrada por ambito (P2).
 *
 * El dueno de dos proyectos no ve el estado de uno desde el otro: el estado
 * tiene dueno de PROYECTO, no de persona. Ve cada uno por su ambito.
 *
 * Puro: sin reloj, sin red, sin estado.
 */

const { es_objeto, texto_no_vacio } = require('./formas');
const { comprobar, vigente } = require('./sello');

const COMPARTIBLES = Object.freeze(['catalogo-recetas', 'memoria-cambios']);
const PRIVADOS = Object.freeze([
  'retratos',
  'bandejas',
  'colas',
  'tolerancia',
  'evidencia',
  'confirmaciones',
  'autorizaciones',
  // La ficha (E1) es estado privado: la voz de una cuenta es de SU proyecto y no
  // se comparte jamas con otro (bloque 10).
  'fichas'
]);
const REGISTROS = Object.freeze(['padron']);

const CODIGOS = Object.freeze({
  NO_ES_PRIVADO: 'no_es_privado',
  NO_ES_COMPARTIBLE: 'no_es_compartible',
  ALMACEN_NO_DECLARADO: 'almacen_no_declarado',
  MEZCLA_DE_CLASES: 'mezcla_de_clases',
  MEZCLA_DE_PROYECTOS: 'mezcla_de_proyectos',
  DATO_SIN_SELLO: 'dato_sin_sello',
  SIN_IDENTIDAD: 'sin_identidad'
});

/** Clase declarada de un almacen (o null si no esta en la tabla). */
function clase_de_almacen(nombre) {
  const n = typeof nombre === 'string' ? nombre.trim() : '';
  if (COMPARTIBLES.includes(n)) return 'compartible';
  if (PRIVADOS.includes(n)) return 'privado';
  if (REGISTROS.includes(n)) return 'registro';
  return null;
}

/** Almacen declarado por el propio dato, si lo trae. */
function almacen_de(dato) {
  if (!es_objeto(dato)) return null;
  if (texto_no_vacio(dato.almacen)) return String(dato.almacen).trim();
  if (texto_no_vacio(dato._almacen)) return String(dato._almacen).trim();
  return null;
}

/**
 * ¿Este dato es saber hacer (compartible)? Sin declaracion explicita la
 * respuesta es NO: lo que no se declara no se comparte.
 */
function es_compartible(dato) {
  return clase_de_almacen(almacen_de(dato)) === 'compartible';
}

function es_privado(dato) {
  const clase = clase_de_almacen(almacen_de(dato));
  return clase === 'privado' || clase === 'registro';
}

/** Exige que el dato sea estado privado (para escribir en un almacen privado). */
function exigir_privado(dato) {
  const nombre = almacen_de(dato);
  if (!nombre) return { ok: false, motivo: CODIGOS.ALMACEN_NO_DECLARADO, faltan: ['almacen'] };
  if (!es_privado(dato)) return { ok: false, motivo: CODIGOS.NO_ES_PRIVADO, almacen: nombre };
  return { ok: true, dato };
}

/** Exige que el dato sea saber hacer (para escribir en un almacen compartido). */
function exigir_compartible(dato) {
  const nombre = almacen_de(dato);
  if (!nombre) return { ok: false, motivo: CODIGOS.ALMACEN_NO_DECLARADO, faltan: ['almacen'] };
  if (!es_compartible(dato)) return { ok: false, motivo: CODIGOS.NO_ES_COMPARTIBLE, almacen: nombre };
  return { ok: true, dato };
}

/** Proyecto dueno del dato (sello vigente). Sin sello no hay dueno. */
function propietario(dato) {
  if (!comprobar(dato).ok) return null;
  const sello = vigente(dato);
  return sello && sello.proyecto ? sello.proyecto : null;
}

/** Identidad de quien pregunta: 'p1' | {proyecto} | {proyectos:[]} | {project_id}. */
function identidad(quien) {
  if (typeof quien === 'string') return texto_no_vacio(quien) ? [quien.trim()] : [];
  if (!es_objeto(quien)) return [];
  if (Array.isArray(quien.proyectos)) {
    return quien.proyectos.filter((p) => texto_no_vacio(String(p || ''))).map((p) => String(p).trim());
  }
  for (const campo of ['proyecto', 'project_id']) {
    if (texto_no_vacio(quien[campo])) return [String(quien[campo]).trim()];
  }
  return [];
}

/**
 * ¿Puede verlo? El saber hacer lo ve cualquier proyecto; el estado, solo el
 * suyo. Sin identidad de proyecto no hay lectura (ni del saber comun): el
 * puente atiende a proyectos, y una lectura anonima no se puede auditar.
 * Un dato sin sello no lo ve nadie (no se sabe de quien es).
 */
function puede_ver(quien, dato) {
  if (!comprobar(dato).ok) return false;
  const proyectos = identidad(quien);
  if (proyectos.length === 0) return false;
  if (es_compartible(dato)) return true;
  const dueno = propietario(dato);
  if (!dueno) return false;
  return proyectos.includes(dueno);
}

/**
 * ¿Puede tocarlo (escribir)? El saber comun se puede proponer/mejorar desde
 * cualquier proyecto — lo escribe su custodio, con atribucion (E2) —; el estado
 * solo lo toca su dueno.
 */
function puede_tocar(quien, dato) {
  if (!comprobar(dato).ok) return false;
  const proyectos = identidad(quien);
  if (proyectos.length === 0) return false;
  if (es_compartible(dato)) return true;
  const dueno = propietario(dato);
  if (!dueno) return false;
  return proyectos.includes(dueno);
}

/** Proyectos con datos en un almacen (sellados), ordenados. */
function propietarios(almacen) {
  const datos = Array.isArray(almacen) ? almacen : (es_objeto(almacen) && Array.isArray(almacen.datos) ? almacen.datos : []);
  const vistos = new Set();
  for (const dato of datos) {
    const p = propietario(dato);
    if (p) vistos.add(p);
  }
  return Array.from(vistos).sort();
}

/**
 * Audita un almacen entero: ¿guarda solo su clase, y solo de quien debe?
 *
 * @param {{nombre?:string, almacen?:string, datos?:object[]}|object[]} almacen
 * @returns {{estado:'limpio'|'exceso', almacen:string|null, clase:string|null, datos:number, hallazgos:object[]}}
 */
function verificar_mezcla(almacen) {
  const nombre = Array.isArray(almacen)
    ? null
    : (texto_no_vacio(almacen && almacen.nombre) ? String(almacen.nombre).trim()
      : (texto_no_vacio(almacen && almacen.almacen) ? String(almacen.almacen).trim() : null));
  const datos = Array.isArray(almacen) ? almacen : (es_objeto(almacen) && Array.isArray(almacen.datos) ? almacen.datos : []);
  const clase = clase_de_almacen(nombre);
  const hallazgos = [];

  if (!clase) {
    hallazgos.push({ motivo: CODIGOS.ALMACEN_NO_DECLARADO, detalle: nombre || 'sin nombre', indice: null });
    return { estado: 'exceso', almacen: nombre, clase: null, datos: datos.length, hallazgos };
  }

  const primera = [];
  datos.forEach((dato, i) => {
    const c = comprobar(dato);
    if (!c.ok) {
      hallazgos.push({ motivo: CODIGOS.DATO_SIN_SELLO, detalle: c.motivo || CODIGOS.DATO_SIN_SELLO, indice: i });
      return;
    }
    const suya = clase_de_almacen(almacen_de(dato));
    if (suya && suya !== clase) {
      hallazgos.push({ motivo: CODIGOS.MEZCLA_DE_CLASES, detalle: `${almacen_de(dato)} en ${nombre}`, indice: i });
    }
    const dueno = propietario(dato);
    if (clase === 'privado') {
      if (primera.length === 0) primera.push(dueno);
      else if (dueno !== primera[0]) {
        hallazgos.push({ motivo: CODIGOS.MEZCLA_DE_PROYECTOS, detalle: `${primera[0]} y ${dueno}`, indice: i });
      }
    }
  });

  return {
    estado: hallazgos.length ? 'exceso' : 'limpio',
    almacen: nombre,
    clase,
    datos: datos.length,
    hallazgos
  };
}

module.exports = {
  CODIGOS,
  COMPARTIBLES,
  PRIVADOS,
  REGISTROS,
  clase_de_almacen,
  almacen_de,
  es_compartible,
  es_privado,
  exigir_privado,
  exigir_compartible,
  propietario,
  identidad,
  puede_ver,
  puede_tocar,
  propietarios,
  verificar_mezcla
};

// Vista "clase" para quien prefiera el nombre del diseno (P3 · ReglaDePropiedad).
module.exports.ReglaDePropiedad = Object.freeze({
  propietario,
  puede_ver,
  puede_tocar,
  es_compartible,
  exigir_privado,
  exigir_compartible,
  verificar_mezcla
});
