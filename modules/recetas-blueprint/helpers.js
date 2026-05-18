'use strict';

/**
 * Helpers del dominio del modulo recetas.
 *
 * Son funciones puras (sin side effects, sin estado interno, sin I/O)
 * que el blueprint declara como `helpers_del_dominio` y que el runtime
 * importa al cargar el modulo.
 *
 * Si una funcion necesitara I/O o estado, NO va aqui — va al runtime
 * como primitiva universal, o al propio pseudocodigo del blueprint.
 *
 * Estas tres funciones se extrajeron de modules/recetas/index.js para
 * que el blueprint las pueda referenciar por nombre.
 */

const CAMPOS_REQUERIDOS_PARA_COMPLETA = ['ingredientes', 'porciones', 'instrucciones'];

/**
 * Normaliza el campo `ingredientes` a un array canonico de
 * { nombre, cantidad, unidad, notas? }.
 *
 * Acepta:
 *   - null/undefined → []
 *   - string → un solo ingrediente como texto libre
 *   - array de strings → cada uno se trata como nombre suelto
 *   - array de objetos → se mapean al shape canonico (acepta sinonimos
 *     en castellano e ingles: nombre/name/ingrediente, cantidad/quantity,
 *     unidad/unit, notas/notes).
 *
 * Filtra al final los items sin nombre.
 */
function normalizarIngredientes(ingredientes) {
  if (ingredientes == null) return [];
  if (typeof ingredientes === 'string') {
    return [{ nombre: ingredientes.trim(), cantidad: null, unidad: null, notas: 'texto libre' }];
  }
  if (!Array.isArray(ingredientes)) return [];
  return ingredientes
    .map(it => {
      if (typeof it === 'string') return { nombre: it.trim(), cantidad: null, unidad: null };
      if (typeof it !== 'object' || it == null) return { nombre: String(it), cantidad: null, unidad: null };
      return {
        nombre:   (it.nombre ?? it.name ?? it.ingrediente ?? '').toString().trim(),
        cantidad: it.cantidad ?? it.quantity ?? null,
        unidad:   it.unidad   ?? it.unit     ?? null,
        notas:    it.notas    ?? it.notes    ?? undefined
      };
    })
    .filter(i => i.nombre);
}

/**
 * Normaliza el campo `instrucciones` a un array de strings.
 *
 * Acepta:
 *   - null/undefined → []
 *   - string → splitea por nueva linea o por punto+espacio
 *   - array → mapea cada elemento a string trim
 *
 * Filtra strings vacios.
 */
function normalizarInstrucciones(input) {
  if (input == null) return [];
  if (typeof input === 'string') {
    return input.split(/\n+|\.\s+/).map(s => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(input)) return [];
  return input.map(s => String(s).trim()).filter(Boolean);
}

/**
 * Devuelve los campos de [ingredientes, porciones, instrucciones] que
 * estan vacios/null/array-vacio en la receta dada.
 *
 * Una receta sin pendientes esta "completa" y arranca en estado_operativo
 * `en_servicio`. Una receta con pendientes arranca en `borrador`.
 */
function camposPendientes(receta) {
  const pendientes = [];
  for (const campo of CAMPOS_REQUERIDOS_PARA_COMPLETA) {
    const v = receta[campo];
    const vacio = v == null || (Array.isArray(v) && v.length === 0) || v === '';
    if (vacio) pendientes.push(campo);
  }
  return pendientes;
}

module.exports = {
  normalizarIngredientes,
  normalizarInstrucciones,
  camposPendientes
};
