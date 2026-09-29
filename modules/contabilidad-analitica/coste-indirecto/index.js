/**
 * contabilidad-analitica/coste-indirecto — REFLEJO STATELESS (J5, hoja del plan).
 *
 * EL REPARTO DE LOS GASTOS NO DIRECTOS: la luz, el alquiler, el sueldo de direccion... no son de
 * un centro, son de todos. Este reflejo APLICA el reparto que el negocio ha DECLARADO y devuelve
 * cuanto toca a cada dimension. Determinista: mismo coste + mismo criterio + mismas bases → el
 * mismo reparto, una sola respuesta correcta.
 *
 * ATRIBUTOS del diseno: `reparto:ParametroDeclarable`.
 *   METODOS: repartir(coste, dimensiones):Map<Dimension,Cuantía>.
 *   REGLA: aplica el reparto DECLARADO de gastos no directos. Determinista.
 *
 * LOS CRITERIOS DE REPARTO SON DECLARABLES (invariante: LEY/PARAMETRO COMO DATO). El reflejo NO
 * cablea ningun metodo de reparto ni ningun porcentaje: el metodo, las bases y los pesos entran
 * como DATO en `criterio` — o se piden a `cola-declaraciones-criterio` (K9) POR EVENTO (best-effort,
 * clave 'reparto'). Sin criterio declarado NO se reparte: `reparto:null`, `abierto:true` con lo que
 * falta. Jamas se reparte a partes iguales por defecto: partir a medias es una DECISION, y esa
 * decision es del jefe.
 *
 * Metodos DECLARADOS admitidos (el metodo es dato, no logica cableada):
 *   'proporcional' | 'base'  → en proporcion a la BASE declarada de cada dimension (ej. m2, horas).
 *   'porcentaje'             → segun el porcentaje declarado de cada dimension (debe sumar 1).
 *   'manual' | 'importe'     → cada dimension declara su importe directamente.
 * Cualquier metodo no declarado/desconocido → `[ABIERTO]` (no se adivina la intencion del jefe).
 *
 * CUBRE LO QUE LA PIEZA EXISTENTE NO CUBRE PARA GRUPO: el reparto se hace por DIMENSION analitica
 * declarada (centro, linea, producto, sociedad...), sin tocar el escandallo ni la ficha de producto.
 *
 * Invariantes:
 *  - DETERMINISTA: mismo coste + mismo criterio + mismas bases → mismo reparto.
 *  - Dato ausente = desconocido: sin coste, sin dimensiones o sin criterio → `[ABIERTO]`, nada se
 *    estima; un porcentaje que no cierra al 100% se DECLARA inconsistente en vez de normalizarse solo.
 *  - NO escribe, NO persiste: el reparto es un DERIVADO; la imputacion al asiento es de otro.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja J5 del plan-construccion y diseno-oop.md (CLASE CosteIndirecto).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los NOMBRES de los metodos de reparto que pueden venir declarados (cero porcentajes cableados).
const METODOS_ADMITIDOS = new Set(['proporcional', 'base', 'porcentaje', 'manual', 'importe']);

// Tolerancia declarada para dar por cerrado un reparto por porcentajes (una constante aritmetica
// de comparacion, no una regla de negocio; el criterio de reparto sigue siendo dato).
const TOLERANCIA = 1e-6;

class CosteIndirecto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'coste-indirecto';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onRepartirRequest(e) {
    return this._atender(e, 'repartir', 'coste-indirecto.repartir.response', async (d) => {
      const res = await this._repartir(d);
      if (res.status !== 200) this.eventBus?.publish('coste-indirecto.repartir.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: repartir(coste, dimensiones) → Map<Dimension,Cuantía> ──
  async _repartir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const periodo = input.periodo != null ? String(input.periodo) : null;
    const coste = this._num(input.coste != null ? input.coste : input.importe);

    // 1) El CRITERIO de reparto: declarado, o pedido a la cola K9 POR EVENTO. Nunca se cablea.
    const { criterio, fuente_criterio } = await this._criterio(pid, input);

    // 2) Las DIMENSIONES a repartir: dato declarado (centro/linea/producto/sociedad...).
    const dimensiones = this._dimensiones(input);

    const faltan = [];
    if (coste === null) faltan.push('coste');
    if (dimensiones.length === 0) faltan.push('dimensiones');
    if (criterio === null) faltan.push('criterio_reparto');

    // Sin lo minimo NO se reparte: a partes iguales por defecto seria decidir por el jefe.
    if (faltan.length > 0) {
      return {
        status: 200,
        data: {
          project_id: pid, periodo, coste, n_dimensiones: dimensiones.length,
          fuente_criterio, criterio: criterio || null, metodo: criterio ? this._metodo(criterio) : null,
          reparto: null, importe_repartido: null, resto: null,
          abierto: true, faltan,
          motivo: 'no se reparte el coste indirecto: falta ' + faltan.join(', ')
            + ' (un reparto sin criterio declarado por el jefe no es un reparto)'
        }
      };
    }

    const metodo = this._metodo(criterio);
    // Metodo no declarado/desconocido: no se adivina la intencion del jefe.
    if (!METODOS_ADMITIDOS.has(metodo)) {
      return {
        status: 200,
        data: {
          project_id: pid, periodo, coste, n_dimensiones: dimensiones.length,
          fuente_criterio, criterio, metodo,
          reparto: null, importe_repartido: null, resto: null,
          abierto: true, faltan: ['metodo_declarado'],
          motivo: 'el metodo de reparto declarado no es uno admitido: no se adivina la intencion del jefe'
        }
      };
    }

    // 3) El reparto DETERMINISTA segun el metodo declarado. Cero constantes de negocio.
    const r = this._aplicar(metodo, coste, dimensiones, criterio);

    if (r.error) {
      return {
        status: 200,
        data: {
          project_id: pid, periodo, coste, n_dimensiones: dimensiones.length,
          fuente_criterio, criterio, metodo,
          reparto: null, importe_repartido: null, resto: null,
          abierto: true, faltan: r.faltan, detalle: r.detalle || null,
          motivo: r.motivo
        }
      };
    }

    const lineas = r.lineas;
    const asignado = this._round(lineas.reduce((s, l) => s + l.importe, 0), 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        coste,
        n_dimensiones: dimensiones.length,
        fuente_criterio,
        criterio,
        metodo,
        // Map<Dimension,Cuantía>: cuanto coste indirecto toca a cada dimension.
        reparto: lineas,
        importe_repartido: asignado,
        // El resto (si lo hay) se DECLARA: no se esconde ni se reasigna a dedo.
        resto: this._round(coste - asignado, 2),
        abierto: false,
        faltan: [],
        motivo: null
      }
    };
  }

  _aplicar(metodo, coste, dimensiones, criterio) {
    const lineas = [];

    if (metodo === 'proporcional' || metodo === 'base') {
      const bases = criterio.bases && typeof criterio.bases === 'object' ? criterio.bases : null;
      const suma = dimensiones.reduce((s, d) => s + (this._num(bases ? bases[d.dimension] : d.base) ?? 0), 0);
      // Sin base declarada (>0) no hay proporcion: no se reparte a medias.
      if (!(suma > 0)) {
        return { error: true, faltan: ['bases_de_reparto'],
          motivo: 'el metodo declarado reparte en proporcion a una base, pero no hay base declarada (>0) por dimension' };
      }
      for (const d of dimensiones) {
        const base = this._num(bases ? bases[d.dimension] : d.base) ?? 0;
        lineas.push({
          dimension: d.dimension,
          base,
          cuota: this._round(base / suma, 6),
          importe: this._round(coste * (base / suma), 2)
        });
      }
      return { lineas };
    }

    if (metodo === 'porcentaje') {
      const pcts = criterio.porcentajes && typeof criterio.porcentajes === 'object' ? criterio.porcentajes : null;
      const cuotas = dimensiones.map(d => this._num(pcts ? pcts[d.dimension] : d.porcentaje));
      if (cuotas.some(c => c === null)) {
        return { error: true, faltan: ['porcentajes_de_reparto'],
          motivo: 'el metodo declarado reparte por porcentaje, pero alguna dimension no lo declara' };
      }
      const suma = cuotas.reduce((s, c) => s + c, 0);
      // Un reparto que no cierra al 100% se DECLARA inconsistente: no se normaliza en silencio.
      if (Math.abs(suma - 1) > TOLERANCIA) {
        return { error: true, faltan: ['porcentajes_que_suman_1'], detalle: { suma: this._round(suma, 6) },
          motivo: 'los porcentajes declarados no suman 1: el reparto no cierra (no se normaliza por defecto)' };
      }
      dimensiones.forEach((d, i) => {
        lineas.push({
          dimension: d.dimension,
          cuota: this._round(cuotas[i], 6),
          importe: this._round(coste * cuotas[i], 2)
        });
      });
      return { lineas };
    }

    // metodo === 'manual' | 'importe': cada dimension declara su importe directamente.
    const importes = criterio.importes && typeof criterio.importes === 'object' ? criterio.importes : null;
    const vals = dimensiones.map(d => this._num(importes ? importes[d.dimension] : d.importe));
    if (vals.some(v => v === null)) {
      return { error: true, faltan: ['importes_de_reparto'],
        motivo: 'el metodo declarado reparte por importes, pero alguna dimension no declara su importe' };
    }
    const suma = vals.reduce((s, v) => s + v, 0);
    // Los importes declarados NO pueden superar el coste a repartir (el resto se declara, no se tapa).
    if (suma - coste > TOLERANCIA) {
      return { error: true, faltan: ['importes_que_no_superen_el_coste'], detalle: { suma: this._round(suma, 2), coste },
        motivo: 'los importes declarados suman mas que el coste a repartir: el reparto no cierra' };
    }
    dimensiones.forEach((d, i) => {
      lineas.push({ dimension: d.dimension, cuota: this._round(suma > 0 ? vals[i] / suma : 0, 6), importe: this._round(vals[i], 2) });
    });
    return { lineas };
  }

  // ── El criterio de reparto: declarado, o pedido a la cola K9 POR EVENTO (best-effort) ──
  async _criterio(pid, input = {}) {
    const decl = input.criterio && typeof input.criterio === 'object' ? input.criterio : null;
    if (decl) return { criterio: { ...decl }, fuente_criterio: 'declarado' };
    const r = await this._rpc('cola-declaraciones-criterio.ratificar.request',
      { project_id: pid, clave: 'reparto' }, { timeout_ms: 4000 });
    const valor = r && r.data && r.data.criterio ? r.data.criterio.valor : null;
    if (valor && typeof valor === 'object') return { criterio: { ...valor }, fuente_criterio: 'cola-declaraciones-criterio' };
    // Sin criterio declarado NO se reparte: no hay metodo por defecto.
    return { criterio: null, fuente_criterio: null };
  }

  _metodo(criterio = {}) {
    return String(criterio.metodo || criterio.criterio || criterio.tipo || '').toLowerCase();
  }

  _dimensiones(input = {}) {
    const raw = input.dimensiones;
    const lista = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.keys(raw).map(k => ({ id: k })) : []);
    const out = [];
    for (const d of lista) {
      if (d === null || d === undefined || d === '') continue;
      const clave = this._clave(d);
      if (clave === null || out.some(x => x.dimension === clave)) continue;
      const obj = (d && typeof d === 'object') ? d : {};
      out.push({
        dimension: clave,
        base: this._num(obj.base != null ? obj.base : (obj.peso != null ? obj.peso : obj.horas ?? obj.m2)),
        porcentaje: this._num(obj.porcentaje != null ? obj.porcentaje : (obj.pct != null ? obj.pct : obj.cuota)),
        importe: this._num(obj.importe != null ? obj.importe : obj.coste)
      });
    }
    return out;
  }

  _clave(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return this._clave(v.id ?? v.clave ?? v.nombre ?? v.dimension ?? v.centro ?? v.linea ?? v.producto ?? v.sociedad);
    return String(v);
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolRepartir(params) { return this._repartir(params); }
}

module.exports = CosteIndirecto;
