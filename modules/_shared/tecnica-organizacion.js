/**
 * TecnicaDeOrganizacion — abstracción compartida para ORGANIZAR trabajo grande.
 *
 * El "cómo trocear un trabajo que no cabe de una vez", como capacidad de primera
 * clase y AGNÓSTICA del dominio: no sabe qué es un item (un producto, una receta,
 * un mensaje…), solo lo reparte en UNIDADES y las sirve de una en una, reanudable.
 *
 * Patrón GoF Strategy (composición > herencia): el consumidor ELIGE una técnica
 * concreta y la USA; no la hereda. Vive en _shared/ para que cualquier REFLEJO
 * (JS) la reuse — misma clase de dependencia que modulo-hibrido-reflejo.js
 * (JS↔JS, mismo sustrato). NUNCA la usa un blueprint: el LLM no instancia código.
 *
 * Precedentes que ESTA abstracción nombra (ya existían sin nombre):
 *   - escandallo.recalcular_siguiente  = UnoAUno + PorDependencias (topológico).
 *   - troceo de import de carta grande  = PorTamanoFijo | PorAgrupacion.
 *
 * Contrato que TODA técnica garantiza:
 *   reanudable · idempotente desde fuera (el id determinista del item lo cubre) ·
 *   sin estado perdido entre siguiente()/confirmar() · indiferente al tipo de item.
 *
 * Qué da la base:
 *   - planificar(items, ctx)   produce la cola de unidades (delega en la subclase).
 *   - siguiente()              saca la siguiente unidad PENDIENTE (o null).
 *   - confirmar(unidad, res)   marca la unidad como hecha.
 *   - reintentar(unidad)       la devuelve al final de la cola (no se pierde).
 *   - progreso()               { total, hechos, pendientes }  VERIFICADO, no narrado.
 *
 * Qué pone la subclase:
 *   - _construirUnidades(items, ctx): Array<Unidad>   (Unidad = Array<item>, un grupo).
 *
 * Una UNIDAD es SIEMPRE un array de items (un grupo) — uniforme aunque sea de 1.
 */

'use strict';

class TecnicaDeOrganizacion {
  constructor() {
    this._pendientes = [];
    this._hechos = [];
    this._total = 0;
    this._planificada = false;
  }

  /** Abstracto: la subclase reparte los items en unidades (grupos). */
  _construirUnidades(/* items, ctx */) {
    throw new Error('TecnicaDeOrganizacion._construirUnidades es abstracto — implementalo en la subclase');
  }

  planificar(items, ctx = {}) {
    if (!Array.isArray(items)) throw new TypeError('planificar(items): items debe ser Array');
    const unidades = this._construirUnidades(items, ctx) || [];
    this._pendientes = unidades.slice();
    this._hechos = [];
    this._total = unidades.length;
    this._planificada = true;
    return this;
  }

  siguiente() {
    if (!this._planificada) throw new Error('llama planificar() antes de siguiente()');
    return this._pendientes.length ? this._pendientes.shift() : null;
  }

  confirmar(unidad, resultado = null) {
    this._hechos.push({ unidad, resultado });
    return this;
  }

  reintentar(unidad) {
    this._pendientes.push(unidad); // al final de la cola: no bloquea el avance
    return this;
  }

  hayPendientes() {
    return this._pendientes.length > 0;
  }

  progreso() {
    return { total: this._total, hechos: this._hechos.length, pendientes: this._pendientes.length };
  }
}

// ── Estrategias concretas (se enchufan; no se heredan unas de otras) ──────────

/** Cada item es su propia unidad. El caso degenerado (= PorTamanoFijo(1)). */
class UnoAUno extends TecnicaDeOrganizacion {
  _construirUnidades(items) {
    return items.map((it) => [it]);
  }
}

/** Lotes de tamaño fijo N, preservando el orden de entrada. */
class PorTamanoFijo extends TecnicaDeOrganizacion {
  constructor(n = 7) {
    super();
    if (!Number.isInteger(n) || n < 1) throw new RangeError('PorTamanoFijo(n): n entero >= 1');
    this.n = n;
  }

  _construirUnidades(items) {
    const out = [];
    for (let i = 0; i < items.length; i += this.n) out.push(items.slice(i, i + this.n));
    return out;
  }
}

/** Una unidad por grupo; clave = función(item)->valor o nombre de campo. */
class PorAgrupacion extends TecnicaDeOrganizacion {
  constructor(clave) {
    super();
    if (typeof clave !== 'function' && typeof clave !== 'string') {
      throw new TypeError('PorAgrupacion(clave): función(item) o nombre de campo');
    }
    this._clave = typeof clave === 'function' ? clave : (it) => (it == null ? undefined : it[clave]);
  }

  _construirUnidades(items) {
    const mapa = new Map(); // preserva orden de primera aparición
    for (const it of items) {
      const k = this._clave(it);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(it);
    }
    return [...mapa.values()];
  }
}

/**
 * Orden topológico: de uno en uno respetando dependencias (Kahn).
 *   idOf(item)   -> id del item.
 *   depsOf(item) -> Array<id> que deben ir ANTES. Deps externas (no en items) se ignoran.
 * Lanza si hay ciclo.
 */
class PorDependencias extends TecnicaDeOrganizacion {
  constructor({ idOf, depsOf } = {}) {
    super();
    if (typeof idOf !== 'function' || typeof depsOf !== 'function') {
      throw new TypeError('PorDependencias({ idOf, depsOf }): ambas funciones requeridas');
    }
    this._idOf = idOf;
    this._depsOf = depsOf;
  }

  _construirUnidades(items) {
    const byId = new Map(items.map((it) => [this._idOf(it), it]));
    const indeg = new Map();
    const adj = new Map();
    for (const it of items) {
      const id = this._idOf(it);
      indeg.set(id, 0);
      adj.set(id, []);
    }
    for (const it of items) {
      const id = this._idOf(it);
      for (const dep of this._depsOf(it) || []) {
        if (!byId.has(dep)) continue; // dependencia fuera del lote: se ignora
        adj.get(dep).push(id);
        indeg.set(id, indeg.get(id) + 1);
      }
    }
    const cola = [...indeg.entries()].filter(([, g]) => g === 0).map(([id]) => id);
    const orden = [];
    while (cola.length) {
      const id = cola.shift();
      orden.push(byId.get(id));
      for (const sig of adj.get(id)) {
        indeg.set(sig, indeg.get(sig) - 1);
        if (indeg.get(sig) === 0) cola.push(sig);
      }
    }
    if (orden.length !== items.length) {
      throw new Error('PorDependencias: ciclo de dependencias detectado');
    }
    return orden.map((it) => [it]);
  }
}

/**
 * Selector determinista de técnica por defecto. Sin sorpresas:
 *   - preferida (instancia)  -> esa.
 *   - dependencias {idOf,depsOf} -> PorDependencias.
 *   - clave                  -> PorAgrupacion.
 *   - pequeño (<= umbral)    -> un único lote con todo.
 *   - resto                  -> PorTamanoFijo(tamano).
 * La ELECCIÓN es determinista → vive en el reflejo, no en el LLM.
 */
function elegir(items, opciones = {}) {
  const { preferida, dependencias, clave, tamano = 7, umbralPequeno = tamano } = opciones;
  if (preferida instanceof TecnicaDeOrganizacion) return preferida;
  if (dependencias) return new PorDependencias(dependencias);
  if (clave) return new PorAgrupacion(clave);
  const n = Array.isArray(items) ? items.length : 0;
  if (n <= umbralPequeno) return new PorTamanoFijo(Math.max(1, n || 1));
  return new PorTamanoFijo(tamano);
}

module.exports = {
  TecnicaDeOrganizacion,
  UnoAUno,
  PorTamanoFijo,
  PorAgrupacion,
  PorDependencias,
  elegir,
};
