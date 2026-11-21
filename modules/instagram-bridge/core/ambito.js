'use strict';

/**
 * ambito — P2 · FiltroDeAmbito · REFLEJO.
 *
 * Toda lectura se filtra por ambito, y la comprobacion ocurre ANTES DE
 * DEVOLVER, no despues. Dos proyectos no se mezclan jamas en un mismo informe:
 * el dueno puede pedir varios ambitos, pero recibe respuestas separadas.
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, P2):
 *   - Un ambito sin `proyecto` no es un ambito: filtrar por la nada no puede
 *     significar "todo" (seria una fuga silenciosa). Se falla cerrado.
 *   - Un dato sin sello no pertenece a ningun ambito. No se puede filtrar lo que
 *     no se puede identificar: se descarta y se cuenta como huerfano.
 *   - Pedir varios proyectos en UNA sola coleccion devuelve vacio, no la union.
 *     La union es exactamente el informe mezclado que el diseno prohibe; para
 *     varios ambitos esta `repartir`, que entrega un informe por ambito.
 *
 * Puro: sin reloj, sin red, sin estado.
 */

const { es_objeto, texto_no_vacio } = require('./formas');
const { comprobar, vigente } = require('./sello');

const CODIGOS = Object.freeze({
  AMBITO_SIN_PROYECTO: 'ambito_sin_proyecto',
  AMBITO_MULTIPLE: 'ambito_multiple_en_un_solo_informe',
  AMBITO_AJENO: 'ambito_ajeno',
  SIN_DATO: 'sin_sello'
});

// Campos de sello que un ambito puede fijar ademas del proyecto.
const CAMPOS_DE_AMBITO = Object.freeze(['cuenta', 'aparato', 'quien']);

/**
 * Proyectos que pide un ambito. Acepta la forma corta ('proy-a') y las dos
 * largas ({proyecto} / {proyectos:[]}).
 */
function proyectos_de(ambito) {
  if (typeof ambito === 'string') return texto_no_vacio(ambito) ? [ambito.trim()] : [];
  if (!es_objeto(ambito)) return [];
  if (Array.isArray(ambito.proyectos)) {
    return ambito.proyectos.filter((p) => texto_no_vacio(String(p || ''))).map((p) => String(p).trim());
  }
  if (texto_no_vacio(ambito.proyecto)) return [String(ambito.proyecto).trim()];
  return [];
}

/**
 * Un ambito valido tiene exactamente un proyecto. Multiples proyectos son
 * validos como peticion de lectura, pero no como filtro de una sola coleccion.
 */
function describir_ambito(ambito) {
  const proyectos = proyectos_de(ambito);
  if (proyectos.length === 0) return { ok: false, motivo: CODIGOS.AMBITO_SIN_PROYECTO, proyectos };
  if (proyectos.length > 1) return { ok: false, motivo: CODIGOS.AMBITO_MULTIPLE, proyectos };
  return { ok: true, proyectos, proyecto: proyectos[0] };
}

/**
 * ¿Este dato pertenece a este ambito? El proyecto manda; cuenta, aparato y
 * quien afinan si vienen declarados.
 */
function pertenece(dato, ambito) {
  const c = comprobar(dato);
  if (!c.ok) return false;

  const desc = describir_ambito(ambito);
  if (!desc.ok) return false;

  const sello = vigente(dato);
  if (!sello) return false;
  if (sello.proyecto !== desc.proyecto) return false;

  for (const campo of CAMPOS_DE_AMBITO) {
    const pedido = es_objeto(ambito) ? ambito[campo] : undefined;
    if (pedido !== undefined && pedido !== null && String(sello[campo]) !== String(pedido)) return false;
  }
  return true;
}

/**
 * Filtra una coleccion por un unico ambito. Los huerfanos y los ajenos caen.
 * Con varios proyectos devuelve [] a proposito: la union seria una mezcla.
 */
function filtrar(lista, ambito) {
  if (!Array.isArray(lista)) return [];
  if (!describir_ambito(ambito).ok) return [];
  return lista.filter((dato) => pertenece(dato, ambito));
}

/**
 * Igual que `filtrar`, pero diciendo que se ha dejado fuera y por que. Es la
 * version que se usa para auditar una lectura, no para servirla.
 */
function revisar(lista, ambito) {
  const desc = describir_ambito(ambito);
  if (!Array.isArray(lista)) {
    return { datos: [], huerfanos: [], ajenos: [], motivo: desc.ok ? null : desc.motivo };
  }
  if (!desc.ok) {
    // Sin ambito valido no se devuelve nada: ni datos, ni "casi".
    return { datos: [], huerfanos: [], ajenos: lista.slice(), motivo: desc.motivo, proyectos: desc.proyectos };
  }
  const datos = [];
  const huerfanos = [];
  const ajenos = [];
  for (const dato of lista) {
    const c = comprobar(dato);
    if (!c.ok) { huerfanos.push(dato); continue; }
    if (pertenece(dato, ambito)) datos.push(dato);
    else ajenos.push(dato);
  }
  return { datos, huerfanos, ajenos, motivo: null, proyectos: desc.proyectos };
}

/**
 * Varios ambitos → varios informes, uno por ambito. Nunca una coleccion
 * mezclada: cada informe es el resultado de `filtrar` con su propio ambito.
 *
 * @param {object[]} lista
 * @param {Array|object|string} ambitos
 * @returns {{ambito:*, proyecto:string|null, datos:object[], huerfanos:number, motivo:string|null}[]}
 */
function repartir(lista, ambitos) {
  const pedidos = Array.isArray(ambitos) ? ambitos : [ambitos];
  return pedidos.map((ambito) => {
    const r = revisar(lista, ambito);
    const desc = describir_ambito(ambito);
    return {
      ambito,
      proyecto: desc.ok ? desc.proyecto : null,
      datos: r.datos,
      huerfanos: r.huerfanos.length,
      motivo: r.motivo
    };
  });
}

/**
 * Proyectos presentes en una coleccion (sellados), ordenados. Sirve para saber
 * que ambitos hay que pedir antes de repartir; jamas para devolverlos juntos.
 */
function ambitos_presentes(lista) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  for (const dato of lista) {
    const sello = comprobar(dato).ok ? vigente(dato) : null;
    if (sello && sello.proyecto) vistos.add(sello.proyecto);
  }
  return Array.from(vistos).sort();
}

/**
 * Comprobacion de salida: lo que esta a punto de devolverse, ¿es todo de este
 * ambito y todo esta sellado? Un solo ajeno o un solo huerfano invalidan la
 * entrega entera (no se devuelve "casi todo").
 *
 * @param {object[]|{datos:object[]}} resultado
 * @param {object|string} ambito
 */
function comprobar_antes_de_devolver(resultado, ambito) {
  const lista = Array.isArray(resultado) ? resultado : (es_objeto(resultado) && Array.isArray(resultado.datos) ? resultado.datos : null);
  if (lista === null) {
    return { ok: false, motivo: CODIGOS.SIN_DATO, faltan: ['resultado'], ajenos: [], huerfanos: [] };
  }
  const desc = describir_ambito(ambito);
  if (!desc.ok) {
    return { ok: false, motivo: desc.motivo, ajenos: lista.slice(), huerfanos: [], proyectos: desc.proyectos };
  }
  const ajenos = [];
  const huerfanos = [];
  for (const dato of lista) {
    if (!comprobar(dato).ok) { huerfanos.push(dato); continue; }
    if (!pertenece(dato, ambito)) ajenos.push(dato);
  }
  if (ajenos.length || huerfanos.length) {
    return {
      ok: false,
      motivo: ajenos.length ? CODIGOS.AMBITO_AJENO : CODIGOS.SIN_DATO,
      ajenos,
      huerfanos
    };
  }
  return { ok: true, datos: lista };
}

module.exports = {
  CODIGOS,
  CAMPOS_DE_AMBITO,
  proyectos_de,
  describir_ambito,
  pertenece,
  filtrar,
  revisar,
  repartir,
  ambitos_presentes,
  comprobar_antes_de_devolver
};

// Vista "clase" para quien prefiera el nombre del diseno (P2 · FiltroDeAmbito).
module.exports.FiltroDeAmbito = Object.freeze({
  filtrar,
  pertenece,
  revisar,
  repartir,
  comprobar_antes_de_devolver
});
