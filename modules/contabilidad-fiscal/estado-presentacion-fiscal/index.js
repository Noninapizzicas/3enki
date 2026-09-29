/**
 * contabilidad-fiscal/estado-presentacion-fiscal — CUSTODIO CON PERSISTENCIA (D12, hoja del plan).
 *
 * MAQUINA DE ESTADOS CON DUEÑO del ciclo de vida de cada obligacion fiscal. Sin este
 * custodio, calendario-fiscal (D6) avisa de los plazos pero NADIE sabe en que punto esta
 * cada modelo. Aqui vive ese punto, y solo lo mueve UN escritor.
 *
 * El sistema GENERA y REGISTRA el estado; NO presenta y NO firma. Los estados `presentada`
 * / `justificada` se registran porque el ASESOR los declara (vienen del acuse D13): este
 * modulo NO los infiere, NO los da por hechos y NO firma nada.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): los ESTADOS y las TRANSICIONES son DECLARABLES.
 * El ciclo por defecto es el vocabulario del dominio declarado en el diseño OOP
 * (pendiente → generada → presentada → justificada, con `atrasada` como desvio observable);
 * si el negocio/asesor declara otro ciclo (`estados_declarables`, `transiciones`), ese manda.
 * NO se cablea ningun plazo, periodicidad, ejercicio, fecha ni umbral: el estado es un dato
 * que el escritor declara, no un calculo legal.
 *
 * UN SOLO ESCRITOR: el gestor de presentacion (rol GESTOR_PRESENTACION_FISCAL). Cualquier
 * otro rol es rechazado (403) y no espera ni hace cola. Cada avance APPENDEA al historial de
 * la obligacion: el estado anterior no se reescribe (invariante 3).
 *
 * Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja D12 del plan-construccion y diseno-oop.md (CLASE EstadoPresentacionFiscal).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela: el gestor de presentacion (dueño o asesor).
const ROL_ESCRITOR = 'GESTOR_PRESENTACION_FISCAL';

// Ciclo de vida del dominio (vocabulario del diseño OOP, NO tabla legal). Declarable.
const CICLO_POR_DEFECTO = ['pendiente', 'generada', 'presentada', 'justificada'];
// Desvio observable del ciclo (declarable): no altera el orden, marca que se paso del punto.
const ESTADO_DESVIO = 'atrasada';

class EstadoPresentacionFiscal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estado-presentacion-fiscal';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, obligaciones: Map<clave, {obligacion, estado, estados, historial}>, historial }
    this._estados = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'estado-presentacion-fiscal.json',
      dir: '/contabilidad/estado-presentacion-fiscal',
      snapshot: (pid) => {
        const c = this._estados.get(pid);
        if (!c) return null;
        return {
          project_id: pid,
          esquema: c.esquema,
          obligaciones: [...c.obligaciones.entries()].map(([clave, o]) => ({ clave, ...o })),
          historial: c.historial
        };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const obligaciones = new Map();
        for (const o of (data.obligaciones || [])) {
          if (!o || o.clave == null) continue;
          const { clave, ...resto } = o;
          obligaciones.set(String(clave), resto);
        }
        this._estados.set(pid, {
          esquema: data.esquema || 'contabilidad-estado-presentacion-fiscal-v1',
          obligaciones,
          historial: Array.isArray(data.historial) ? data.historial : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el estado del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onAvanzarRequest(e) {
    return this._atender(e, 'avanzar', 'estado-presentacion-fiscal.avanzar.response', async (d) => {
      const res = this._avanzar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.obligacion_avanzada', {
          project_id: res.data.project_id,
          obligacion: res.data.obligacion,
          estado_anterior: res.data.estado_anterior,
          estado: res.data.estado,
          avances: res.data.historial_avances,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('estado-presentacion-fiscal.avanzar.failed', res);
      }
      return res;
    });
  }

  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'estado-presentacion-fiscal.estado.response', async (d) => {
      const res = this._estado(d);
      if (res.status !== 200) this.eventBus?.publish('estado-presentacion-fiscal.estado.failed', res);
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor): mueve el estado de una obligacion ──
  _avanzar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el gestor de presentacion mueve la maquina de estados.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el gestor de presentacion (GESTOR_PRESENTACION_FISCAL) mueve el estado de la obligacion',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const clave = input.obligacion != null ? String(input.obligacion).trim() : '';
    if (!clave) return this._invalid('obligacion');

    const estado_nuevo = input.estado != null ? String(input.estado)
      : (input.estado_nuevo != null ? String(input.estado_nuevo) : null);
    if (!estado_nuevo) return this._invalid('estado');

    // Los estados son DECLARABLES: el estado nuevo debe estar entre los declarados.
    const estados = this._estadosDe(input);
    if (!estados.includes(estado_nuevo)) {
      return this._errorResponse(422, 'ESTADO_NO_DECLARABLE',
        'el estado no esta entre los declarados por el negocio/asesor',
        { estado: estado_nuevo, estados_declarables: estados });
    }

    const c = this._obtenerOCrear(pid);
    let obl = c.obligaciones.get(clave);
    const estado_anterior = obl ? obl.estado : null;

    // Si la obligacion YA existe, la transicion debe estar declarada (no se salta el ciclo).
    if (obl) {
      const transiciones = this._transicionesDe(input, estados);
      const permitida = transiciones.some(t => t.desde === estado_anterior && t.hasta === estado_nuevo);
      if (!permitida) {
        return this._errorResponse(422, 'TRANSICION_NO_DECLARADA',
          'la transicion no esta declarada en el ciclo del negocio/asesor',
          { desde: estado_anterior, hasta: estado_nuevo, transiciones_declarables: transiciones });
      }
    }

    const ahora = new Date().toISOString();
    if (!obl) {
      // Nace aqui: el escritor DECLARA el punto de partida; no se inventa un estado inicial.
      obl = { obligacion: clave, estado: estado_nuevo, estados: [estado_nuevo], historial: [], creada_en: ahora };
      c.obligaciones.set(clave, obl);
    } else {
      obl.estado = estado_nuevo;
      obl.estados.push(estado_nuevo);
    }
    obl.historial.push({
      estado_anterior,
      estado: estado_nuevo,
      por: ROL_ESCRITOR,
      en: ahora,
      motivo: input.motivo != null ? String(input.motivo) : null,
      documento: input.documento != null ? input.documento : null
    });
    obl.actualizada_en = ahora;
    c.historial.push({ obligacion: clave, estado_anterior, estado: estado_nuevo, por: ROL_ESCRITOR, en: ahora });
    c.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        obligacion: clave,
        estado_anterior,
        estado: estado_nuevo,
        transiciones_declaradas: Array.isArray(input.transiciones) && input.transiciones.length > 0,
        historial_avances: obl.historial.length,
        // El sistema REGISTRA el estado; NO presenta y NO firma.
        presentado_por_sistema: false
      }
    };
  }

  // ── proyeccion de lectura (NO muta): en que punto esta cada obligacion ──
  _estado(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const c = this._estados.get(pid);
    const clave = input.obligacion != null ? String(input.obligacion).trim() : null;

    if (clave) {
      const obl = c ? c.obligaciones.get(clave) : null;
      // Sin registro no se inventa un estado: se declara que no consta.
      return {
        status: 200,
        data: {
          project_id: pid,
          obligacion: clave,
          registrada: Boolean(obl),
          estado: obl ? obl.estado : null,
          historial: obl ? obl.historial : [],
          motivo: obl ? null : 'no consta estado registrado para esta obligacion'
        }
      };
    }

    const obligaciones = c
      ? [...c.obligaciones.entries()].map(([k, o]) => ({ obligacion: k, estado: o.estado, actualizada_en: o.actualizada_en ?? null }))
      : [];
    return {
      status: 200,
      data: { project_id: pid, total: obligaciones.length, obligaciones, estados_declarados: this._estadosDe(input) }
    };
  }

  // Los estados son DECLARABLES; sin declaracion manda el vocabulario del dominio.
  _estadosDe(input = {}) {
    const est = Array.isArray(input.estados_declarables)
      ? input.estados_declarables.map(e => String(e)).filter(Boolean)
      : null;
    if (est && est.length) return est;
    return [...CICLO_POR_DEFECTO, ESTADO_DESVIO];
  }

  // Las transiciones son DECLARABLES; sin declaracion se derivan del ORDEN de los estados.
  _transicionesDe(input = {}, estados = []) {
    if (Array.isArray(input.transiciones) && input.transiciones.length) {
      return input.transiciones
        .filter(t => t && t.desde != null && t.hasta != null)
        .map(t => ({ desde: String(t.desde), hasta: String(t.hasta) }));
    }
    const ciclo = estados.filter(e => e !== ESTADO_DESVIO);
    const t = [];
    for (let i = 0; i < ciclo.length - 1; i++) t.push({ desde: ciclo[i], hasta: ciclo[i + 1] });
    if (estados.includes(ESTADO_DESVIO)) {
      for (const e of ciclo) t.push({ desde: e, hasta: ESTADO_DESVIO });
      if (ciclo.length) t.push({ desde: ESTADO_DESVIO, hasta: ciclo[0] });
    }
    return t;
  }

  _obtenerOCrear(pid) {
    let c = this._estados.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-estado-presentacion-fiscal-v1', obligaciones: new Map(), historial: [] };
      this._estados.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Lectura directa para otras hojas (no muta): estado vigente de una obligacion.
  estadoDe(pid, obligacion) {
    const c = pid ? this._estados.get(pid) : null;
    const obl = c ? c.obligaciones.get(String(obligacion)) : null;
    return obl ? obl.estado : null;
  }

  // ── Tools ──
  toolAvanzar(params) { return this._avanzar(params); }
  toolEstado(params) { return this._estado(params); }
}

module.exports = EstadoPresentacionFiscal;
