'use strict';

/**
 * formas — las formas de dato que cruzan los puertos del puente (no son clases).
 *
 * Todas las piezas del puente hablan de los mismos sobres: un HechoVisible que
 * llega del aparato, un Ancla de una receta, un Sello de proyecto o de cuenta.
 * Si cada pieza validara a su manera, el sello saldria distinto en cada borde y
 * el aislamiento (P1/P2/P3) se caeria en el primer payload raro. Aqui se declara
 * UNA vez la forma y se valida igual en todos los sitios.
 *
 * Reglas de esta libreria:
 *   - Puro: sin reloj, sin red, sin estado. El momento SIEMPRE lo trae quien
 *     llama (el reloj es el puerto 10 del plan, no un Date.now escondido aqui).
 *   - Valida sin lanzar: devuelve { ok, faltan, invalidos } y nombra el hueco
 *     (invariante I5: un dato ausente se nombra; no se rellena con el plausible).
 *   - El sello nace congelado (Object.freeze): "el sello no se reescribe" tiene
 *     que ser una propiedad del objeto, no una promesa del comentario.
 *
 * Ver plan-construccion.md seccion 3 (formas que cruzan los puertos) y
 * diseno-oop.md "Las formas de dato".
 */

// Quinteto del sello: proyecto-cuenta-aparato-momento-quien. Ni uno mas.
const CAMPOS_SELLO = Object.freeze(['proyecto', 'cuenta', 'aparato', 'momento', 'quien']);
const CAMPOS_SELLO_CUENTA = Object.freeze(['proyecto', 'cuenta', 'plataforma']);

// Valores declarados. Una lista cerrada es lo que convierte un typo en un fallo
// nombrado en vez de en un dato que nadie mira.
const QUIENES = Object.freeze(['dueno', 'agente', 'sistema']);
const PANTALLAS = Object.freeze(['perfil', 'inicio', 'crear', 'dm', 'comentarios', 'desconocida']);
const MIRADAS = Object.freeze(['completa', 'parcial']);
const TIPOS_ANCLA = Object.freeze(['boton', 'campo', 'texto', 'imagen', 'desconocido']);
const PLATAFORMAS = Object.freeze(['instagram']);

const INSTANTE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

// ---- utilidades de forma ---------------------------------------------------

function es_objeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function texto_no_vacio(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function es_instante(v) {
  return typeof v === 'string' && INSTANTE_RE.test(v);
}

// Copia profunda de datos planos (JSON). No clona funciones ni ciclos: estas
// formas son payloads de bus, no objetos vivos.
function clonar(valor) {
  if (valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map(clonar);
  const out = {};
  for (const k of Object.keys(valor)) out[k] = clonar(valor[k]);
  return out;
}

function faltan_de(obj, campos) {
  const faltan = [];
  for (const campo of campos) {
    const v = obj[campo];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) faltan.push(campo);
  }
  return faltan;
}

// ---- SelloDeProyecto -------------------------------------------------------

/**
 * Valida el quinteto. Devuelve siempre un objeto con la lista de campos que
 * faltan y la de los que estan pero no valen: un rechazo tiene que decir que
 * falta, no solo que no.
 */
function validar_sello(sello) {
  if (!es_objeto(sello)) {
    return { ok: false, faltan: CAMPOS_SELLO.slice(), invalidos: ['sello'] };
  }
  const faltan = faltan_de(sello, CAMPOS_SELLO);
  const invalidos = [];
  if (!faltan.includes('quien') && !QUIENES.includes(String(sello.quien))) invalidos.push('quien');
  if (!faltan.includes('momento') && !es_instante(sello.momento)) invalidos.push('momento');
  return { ok: faltan.length === 0 && invalidos.length === 0, faltan, invalidos };
}

function es_sello(v) {
  return validar_sello(v).ok;
}

/**
 * Construye el sello congelado. El sello lleva el quinteto y nada mas: los
 * campos de mas son ruido que luego alguien confunde con el sello.
 */
function crear_sello(partes) {
  const v = validar_sello(partes);
  if (!v.ok) return { ok: false, motivo: 'sin_sello', faltan: v.faltan, invalidos: v.invalidos };
  const sello = {};
  for (const campo of CAMPOS_SELLO) sello[campo] = String(partes[campo]).trim();
  return { ok: true, sello: Object.freeze(sello) };
}

// ---- SelloDeCuenta ---------------------------------------------------------
// El ambito de una cuenta concreta: proyecto + cuenta + plataforma. Es lo que
// viaja en una orden al aparato y lo que firma la evidencia (bloque 6).

function validar_sello_de_cuenta(sello) {
  if (!es_objeto(sello)) {
    return { ok: false, faltan: CAMPOS_SELLO_CUENTA.slice(), invalidos: ['sello'] };
  }
  const faltan = faltan_de(sello, ['proyecto', 'cuenta']);
  const invalidos = [];
  const plataforma = sello.plataforma === undefined ? 'instagram' : sello.plataforma;
  if (!PLATAFORMAS.includes(String(plataforma))) invalidos.push('plataforma');
  return { ok: faltan.length === 0 && invalidos.length === 0, faltan, invalidos };
}

function crear_sello_de_cuenta(partes) {
  const v = validar_sello_de_cuenta(partes);
  if (!v.ok) return { ok: false, motivo: 'sin_sello_de_cuenta', faltan: v.faltan, invalidos: v.invalidos };
  return {
    ok: true,
    sello: Object.freeze({
      proyecto: String(partes.proyecto).trim(),
      cuenta: String(partes.cuenta).trim(),
      plataforma: String(partes.plataforma === undefined ? 'instagram' : partes.plataforma).trim()
    })
  };
}

// ---- Ancla -----------------------------------------------------------------

function validar_ancla(ancla) {
  if (!es_objeto(ancla)) return { ok: false, faltan: ['ancla'], invalidos: [] };
  const faltan = [];
  if (!texto_no_vacio(ancla.nombre_visible)) faltan.push('nombre_visible');
  if (!texto_no_vacio(ancla.tipo)) faltan.push('tipo');
  const invalidos = [];
  if (!faltan.includes('tipo') && !TIPOS_ANCLA.includes(String(ancla.tipo))) invalidos.push('tipo');
  return { ok: faltan.length === 0 && invalidos.length === 0, faltan, invalidos };
}

function crear_ancla(partes) {
  const v = validar_ancla(partes);
  if (!v.ok) return { ok: false, motivo: 'ancla_incompleta', faltan: v.faltan, invalidos: v.invalidos };
  const ancla = Object.freeze({ nombre_visible: String(partes.nombre_visible).trim(), tipo: String(partes.tipo).trim() });
  return { ok: true, ancla };
}

// ---- HechoVisible ----------------------------------------------------------
// Lo que el aparato vio, fechado y sellado. Una mirada parcial dice por que es
// parcial: sin motivo, no es un hecho, es una opinion.

function validar_hecho_visible(hecho) {
  if (!es_objeto(hecho)) {
    return { ok: false, faltan: ['hecho'], invalidos: [], sello: { ok: false, faltan: CAMPOS_SELLO.slice(), invalidos: ['sello'] } };
  }
  const faltan = [];
  const invalidos = [];

  const sello = validar_sello(hecho.sello);
  if (!sello.ok) {
    faltan.push(...sello.faltan.map((f) => `sello.${f}`));
    invalidos.push(...sello.invalidos.map((f) => `sello.${f}`));
  }

  if (!texto_no_vacio(hecho.pantalla)) faltan.push('pantalla');
  else if (!PANTALLAS.includes(String(hecho.pantalla))) invalidos.push('pantalla');

  if (!texto_no_vacio(hecho.mirada)) faltan.push('mirada');
  else if (!MIRADAS.includes(String(hecho.mirada))) invalidos.push('mirada');

  if (!Array.isArray(hecho.nodos)) {
    faltan.push('nodos');
  } else {
    hecho.nodos.forEach((nodo, i) => {
      if (!es_objeto(nodo)) { invalidos.push(`nodos[${i}]`); return; }
      if (!texto_no_vacio(nodo.id)) faltan.push(`nodos[${i}].id`);
      if (!texto_no_vacio(nodo.tipo)) faltan.push(`nodos[${i}].tipo`);
    });
  }

  // Una mirada parcial sin motivo es una laguna disfrazada de dato.
  if (hecho.mirada === 'parcial' && !texto_no_vacio(hecho.motivo_sin_mirada)) {
    faltan.push('motivo_sin_mirada');
  }

  if (hecho.cuenta_visible != null && typeof hecho.cuenta_visible !== 'string') invalidos.push('cuenta_visible');

  return { ok: faltan.length === 0 && invalidos.length === 0, faltan, invalidos, sello };
}

function crear_hecho_visible(partes) {
  const v = validar_hecho_visible(partes);
  if (!v.ok) return { ok: false, motivo: 'hecho_incompleto', faltan: v.faltan, invalidos: v.invalidos };
  const hecho = clonar(partes);
  hecho.sello = Object.freeze(clonar(partes.sello));
  hecho.pantalla = String(partes.pantalla);
  hecho.mirada = String(partes.mirada);
  hecho.cuenta_visible = partes.cuenta_visible == null ? null : String(partes.cuenta_visible);
  hecho.motivo_sin_mirada = texto_no_vacio(partes.motivo_sin_mirada) ? partes.motivo_sin_mirada : null;
  return { ok: true, hecho };
}

module.exports = {
  CAMPOS_SELLO,
  CAMPOS_SELLO_CUENTA,
  QUIENES,
  PANTALLAS,
  MIRADAS,
  TIPOS_ANCLA,
  PLATAFORMAS,
  es_objeto,
  texto_no_vacio,
  es_instante,
  clonar,
  validar_sello,
  es_sello,
  crear_sello,
  validar_sello_de_cuenta,
  crear_sello_de_cuenta,
  validar_ancla,
  crear_ancla,
  validar_hecho_visible,
  crear_hecho_visible
};
