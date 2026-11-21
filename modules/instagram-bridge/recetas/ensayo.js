'use strict';

/**
 * ensayo — A4.3 · EnsayoEnSeco · REFLEJO.
 *
 * Recorre una receta contra lo que hay delante AHORA, sin tocar nada, y dice si
 * sirve: `apto` o `no_apto` con la lista de faltas, cada una con SU NUMERO DE
 * PASO. Es la pieza que evita descubrir a mitad de una publicacion que el paso 3
 * ya no existe, con la pieza medio subida.
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, A4.3):
 *   - **No toca el mundo.** No observa por su cuenta ni ejecuta: recibe el
 *     `HechoVisible` ya tomado (el puerto `observar`, no la clase A1) y solo lo
 *     compara. Un ensayo no puede tener efectos.
 *   - **Cada ancla que no esta es una falta con su numero de paso.** No un "fallo
 *     generico": `{paso: 3, ancla: 'Siguiente', motivo: 'ancla_ausente'}`. C4
 *     cuenta las faltas por paso y por motivo; un fallo sin numero no se puede
 *     contar ni reparar.
 *   - **`no_se` no es `apto`.** Con una mirada parcial no se puede afirmar que
 *     las anclas esten: cada paso se marca como no comprobable (con su numero) y
 *     el ensayo NO es apto. Ante duda no se ensaya como bueno.
 *   - **Sin postcondicion comprobable tampoco es apto.** Si la postcondicion no
 *     declara ancla, no hay nada que el testigo (O1) pueda mirar al terminar: la
 *     receta se puede ejecutar, pero no se podra decir si ocurrio. Eso es una
 *     falta, no un detalle.
 *
 * Sobre `alcanzabilidad`: `'no'` es el estado NORMAL antes de ejecutar (el ancla
 * de la postcondicion todavia no esta), asi que no es un defecto; `'no_se'` si lo
 * es, porque significa que no hay con que comprobarla.
 *
 * Puro: sin reloj, sin red, sin IO, sin estado global.
 *
 * Ver plan-construccion.md 4.2 (RPC 13) y 8 (bloque 3), y diseno-oop.md "A4.3".
 */

const { es_objeto, texto_no_vacio } = require('../core/formas');
const forma_receta = require('../core/forma-receta');

const MOTIVOS = Object.freeze({
  ANCLA_AUSENTE: 'ancla_ausente',
  NO_SE_PUEDE_AFIRMAR: 'no_se_puede_afirmar',
  POSTCONDICION_NO_VERIFICABLE: 'postcondicion_no_verificable',
  DEFECTO_DE_FORMA: 'defecto_de_forma',
  SIN_HECHO: 'sin_hecho'
});

const ALCANZABILIDAD = Object.freeze({ SI: 'si', NO: 'no', NO_SE: 'no_se' });

/**
 * Etiqueta comparable: sin acentos, sin mayusculas de mas y con los espacios
 * colapsados. Es cosmetico a proposito: no quita palabras ni intenta "entender"
 * el texto, porque un ensayo que adivina etiquetas es un ensayo que miente.
 */
function normalizar_etiqueta(v) {
  return String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Indice de etiquetas visibles del hecho: etiqueta normalizada -> nodos. */
function indice_de_nodos(hecho) {
  const indice = new Map();
  for (const nodo of hecho.nodos) {
    if (!es_objeto(nodo) || !texto_no_vacio(nodo.nombre_visible)) continue;
    const clave = normalizar_etiqueta(nodo.nombre_visible);
    if (!indice.has(clave)) indice.set(clave, []);
    indice.get(clave).push(nodo);
  }
  return indice;
}

function esta_el_ancla(ancla, indice) {
  if (!es_objeto(ancla) || !texto_no_vacio(ancla.nombre_visible)) return false;
  return indice.has(normalizar_etiqueta(ancla.nombre_visible));
}

/**
 * ¿Se puede comprobar la postcondicion con lo que hay?
 *   'si'    — su ancla esta visible ahora mismo.
 *   'no'    — hay ancla declarada pero no esta (normal antes de ejecutar).
 *   'no_se' — no hay ancla, o la mirada fue parcial: no hay con que comprobarla.
 */
function alcanzabilidad(postcondicion, hecho) {
  if (!es_objeto(hecho) || !Array.isArray(hecho.nodos)) return ALCANZABILIDAD.NO_SE;
  if (hecho.mirada === 'parcial') return ALCANZABILIDAD.NO_SE;
  const ancla = es_objeto(postcondicion) ? postcondicion.ancla : null;
  if (!es_objeto(ancla) || !texto_no_vacio(ancla.nombre_visible)) return ALCANZABILIDAD.NO_SE;
  return esta_el_ancla(ancla, indice_de_nodos(hecho)) ? ALCANZABILIDAD.SI : ALCANZABILIDAD.NO;
}

/**
 * Lista de faltas de la receta contra el hecho. Cada falta lleva `paso`, `ancla`
 * y `motivo`; las de postcondicion se imputan al ultimo paso, que es donde se va
 * a notar.
 *
 * Si la receta no es valida devuelve `[]`: para eso esta `ensayar`, que rechaza
 * con `defecto_de_forma` en vez de decir "no hay faltas" de algo que no es una
 * receta.
 *
 * @param {object} receta receta ya valida (o se valida aqui)
 * @param {object} hecho HechoVisible
 * @returns {object[]}
 */
function faltas(receta, hecho) {
  const v = forma_receta.validar(receta);
  if (!v.ok || !es_objeto(hecho) || !Array.isArray(hecho.nodos)) return [];

  const lista = [];
  const parcial = hecho.mirada === 'parcial';
  const indice = parcial ? new Map() : indice_de_nodos(hecho);

  v.receta.pasos.forEach((paso, i) => {
    if (parcial) {
      // No se puede afirmar ni que este ni que no este: se dice eso, con su
      // numero de paso, en vez de inventar un "ausente".
      lista.push({
        paso: i + 1,
        ancla: paso.ancla_esperada,
        motivo: MOTIVOS.NO_SE_PUEDE_AFIRMAR
      });
      return;
    }
    if (!esta_el_ancla(paso.ancla_esperada, indice)) {
      lista.push({
        paso: i + 1,
        ancla: paso.ancla_esperada,
        motivo: MOTIVOS.ANCLA_AUSENTE
      });
    }
  });

  const ultimo = v.receta.pasos.length;
  const alc = alcanzabilidad(v.receta.postcondicion, hecho);
  if (alc === ALCANZABILIDAD.NO_SE) {
    lista.push({
      paso: ultimo,
      ancla: es_objeto(v.receta.postcondicion) ? v.receta.postcondicion.ancla : null,
      motivo: MOTIVOS.POSTCONDICION_NO_VERIFICABLE
    });
  }

  return lista;
}

/**
 * Ensaya la receta SIN tocar el mundo.
 *
 * @param {object} receta
 * @param {object} hecho HechoVisible (el puerto `observar` lo trae ya tomado)
 * @returns {{ok:boolean, apto?:boolean, motivo?:string, faltas?:object[],
 *   alcanzabilidad?:string, pasos?:number, hecho?:object, defectos?:object[]}}
 */
function ensayar(receta, hecho) {
  const v = forma_receta.validar(receta);
  if (!v.ok) {
    return { ok: false, motivo: MOTIVOS.DEFECTO_DE_FORMA, defectos: v.defectos };
  }
  if (!es_objeto(hecho) || !Array.isArray(hecho.nodos)) {
    return { ok: false, motivo: MOTIVOS.SIN_HECHO, faltan: ['hecho'], invalidos: [] };
  }
  if (!texto_no_vacio(hecho.mirada)) {
    return { ok: false, motivo: MOTIVOS.SIN_HECHO, faltan: ['hecho.mirada'], invalidos: [] };
  }

  const lista = faltas(v.receta, hecho);
  const alc = alcanzabilidad(v.receta.postcondicion, hecho);

  return {
    ok: true,
    apto: lista.length === 0,
    motivo: lista.length === 0 ? null : 'ensayo_no_apto',
    faltas: lista,
    alcanzabilidad: alc,
    pasos: v.receta.pasos.length,
    receta: { clave: `${v.receta.plataforma}:${v.receta.capacidad}`, techo: v.receta.techo },
    hecho: { pantalla: hecho.pantalla || null, mirada: hecho.mirada || null, nodos: hecho.nodos.length }
  };
}

module.exports = {
  MOTIVOS,
  ALCANZABILIDAD,
  normalizar_etiqueta,
  indice_de_nodos,
  esta_el_ancla,
  alcanzabilidad,
  faltas,
  ensayar
};

// Vista "clase" para quien prefiera el nombre del diseno (A4.3 · EnsayoEnSeco).
module.exports.EnsayoEnSeco = Object.freeze({
  ensayar,
  faltas,
  alcanzabilidad
});
