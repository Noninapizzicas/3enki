/**
 * contabilidad-entrada/encolado-excepcion — CUSTODIO CON PERSISTENCIA (A8.1, hoja del plan).
 *
 * LA VALVULA del sistema: lo dudoso NO bloquea. El flujo CONTINUA; lo dudoso espera en
 * la cola. Dos destinos, derivados de la NATURALEZA del asunto:
 *   - lo CONTABLE (descuadre, cuenta que no esta en el plan, tercero desconocido,
 *     contrapartida sin regla) → ASESOR.
 *   - lo del NEGOCIO (falta un dato del hecho, decision del dueno, revisar una regla) → DUENO.
 *
 * UN SOLO ESCRITOR de la parcela: el encolador (`ENCOLADO_EXCEPCION`); cualquier otro rol
 * es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - El encolado NUNCA falla por duplicado: mismo asunto (clave natural declarada o
 *    derivada) → se devuelve la entrada existente (`encolada:false`), la cola no engorda.
 *  - Nada se borra: `tomar` MARCA en tomada (append-only) y deja el historial.
 *  - `tomar` es una lectura+anotacion de desatasco, NO un cambio de escritor.
 *  - Dato ausente = desconocido: sin motivo ni asunto, no se encola (es invalido); nada
 *    se estima ni se rellena por el encolador.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja A8.1 del plan-construccion y diseno-oop.md (CLASE EncoladoExcepcion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela de excepciones.
const ROL_ESCRITOR = 'ENCOLADO_EXCEPCION';

// Naturaleza declarable → destino de la cola. Lo contable al ASESOR, lo del negocio al DUENO.
const DESTINOS = new Set(['ASESOR', 'DUENO']);

// Familias de naturaleza y su destino por defecto (declarable; default seguro → ASESOR).
const NATURALEZA_DESTINO = {
  CONTABLE: 'ASESOR',
  NEGOCIO: 'DUENO'
};

class EncoladoExcepcion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'encolado-excepcion';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, excepciones: Map<clave, Excepcion> }
    this._colas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'encolado-excepcion.json',
      dir: '/contabilidad/encolado-excepcion',
      snapshot: (pid) => {
        const c = this._colas.get(pid);
        if (!c) return null;
        return { project_id: pid, esquema: c.esquema, excepciones: [...c.excepciones.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const excepciones = new Map();
        for (const x of (data.excepciones || [])) if (x && x.clave != null) excepciones.set(String(x.clave), x);
        this._colas.set(pid, { esquema: data.esquema || 'contabilidad-encolado-excepcion-v1', excepciones });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la cola de excepciones del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onEncolarRequest(e) {
    return this._atender(e, 'encolar', 'encolado-excepcion.encolar.response', async (d) => {
      const res = this._encolar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: lo dudoso quedo en cola, el flujo sigue.
        this.eventBus?.publish('contabilidad.excepcion_encolada', {
          project_id: res.data.project_id,
          excepcion: res.data.excepcion,
          destino: res.data.excepcion.destino,
          naturaleza: res.data.excepcion.naturaleza,
          encolada: res.data.encolada,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('encolado-excepcion.encolar.failed', res);
      }
      return res;
    });
  }

  onTomarRequest(e) {
    return this._atender(e, 'tomar', 'encolado-excepcion.tomar.response', async (d) => {
      const res = this._tomar(d);
      if (res.status !== 200) this.eventBus?.publish('encolado-excepcion.tomar.failed', res);
      return res;
    });
  }

  // ── Fire-and-forget del flujo: un descuadre publicado va derecho a cola ──
  onDocumentoDescuadrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._encolar({
      project_id: d.project_id,
      rol: ROL_ESCRITOR,
      excepcion: {
        asunto: d.documento && d.documento.clave_natural ? d.documento.clave_natural : undefined,
        naturaleza: 'CONTABLE',
        motivo: 'documento descuadrado: importe + impuestos no cuadran con el total',
        detalle: { esperado: d.esperado, total: d.total, descuadre: d.descuadre },
        origen: 'control-cuadre-documento'
      },
      correlation_id: d.correlation_id
    });
    if (res.status !== 200) this.eventBus?.publish('encolado-excepcion.encolar.failed', res);
    return res;
  }

  // ── proyeccion de escritura (UN escritor): encolar lo dudoso ──
  _encolar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el encolador puede escribir en la parcela.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el encolador (ENCOLADO_EXCEPCION) puede asentar excepciones',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const x = input.excepcion || input.ex;
    if (!x || typeof x !== 'object') return this._invalid('excepcion');

    const motivo = x.motivo != null ? String(x.motivo).trim() : '';
    if (!motivo) return this._invalid('excepcion.motivo');

    // Destino DERIVADO de la naturaleza (o declarado si es un destino valido).
    const naturaleza = this._naturaleza(x.naturaleza);
    const destino = this._destino(x.destino, naturaleza);

    // Clave del asunto: declarada o derivada del origen+naturaleza+motivo (determinista).
    const asunto = x.asunto != null && String(x.asunto).trim() !== '' ? String(x.asunto).trim() : null;
    const clave = asunto != null
      ? `${naturaleza}|${asunto}`
      : `${naturaleza}|${x.origen != null ? String(x.origen) : 'sin-origen'}|${motivo}`;

    const cola = this._obtenerOCrear(pid);
    const existente = cola.excepciones.get(clave);
    if (existente) {
      // Idempotencia: mismo asunto → no se engorda la cola.
      return {
        status: 200,
        data: { project_id: pid, excepcion: existente, encolada: false, motivo_duplicado: 'el asunto ya estaba en la cola' }
      };
    }

    const excepcion = {
      clave,
      id: `x${cola.excepciones.size + 1}`,
      asunto,
      naturaleza,
      destino,
      motivo,
      detalle: x.detalle && typeof x.detalle === 'object' ? x.detalle : null,
      origen: x.origen != null ? String(x.origen) : null,
      estado: 'PENDIENTE',
      historial: [{ estado: 'PENDIENTE', en: new Date().toISOString() }],
      encolada_en: new Date().toISOString(),
      tomada_en: null
    };
    cola.excepciones.set(clave, excepcion);
    cola.updated_at = excepcion.encolada_en;
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, excepcion, encolada: true } };
  }

  // ── proyeccion de desatasco (marca, no borra): tomar una excepcion ──
  _tomar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cola = this._obtenerOCrear(pid);
    const clave = input.clave != null ? String(input.clave) : null;
    const destino_pedido = input.destino != null ? String(input.destino).toUpperCase() : null;

    if (clave) {
      const x = cola.excepciones.get(clave) || null;
      if (!x) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'excepcion no encontrada', { clave });
      }
      return { status: 200, data: { project_id: pid, excepcion: this._marcarTomada(cola, pid, x) } };
    }

    // Sin clave: la primera PENDIENTE (orden de entrada, determinista), filtrada por destino.
    for (const x of cola.excepciones.values()) {
      if (x.estado !== 'PENDIENTE') continue;
      if (destino_pedido && x.destino !== destino_pedido) continue;
      return { status: 200, data: { project_id: pid, excepcion: this._marcarTomada(cola, pid, x) } };
    }

    // Cola vacia: no es un error del flujo — no hay nada que desatascar.
    return {
      status: 200,
      data: { project_id: pid, excepcion: null, pendientes: this._pendientes(cola, destino_pedido).length, motivo: 'no hay excepciones pendientes' }
    };
  }

  _marcarTomada(cola, pid, x) {
    x.estado = 'TOMADA';
    x.tomada_en = new Date().toISOString();
    x.historial = Array.isArray(x.historial) ? x.historial : [];
    x.historial.push({ estado: 'TOMADA', en: x.tomada_en });
    cola.updated_at = x.tomada_en;
    this._persist.marcarDirty(pid);
    return x;
  }

  _pendientes(cola, destino) {
    return [...cola.excepciones.values()].filter(x => x.estado === 'PENDIENTE' && (!destino || x.destino === destino));
  }

  _naturaleza(raw) {
    const n = raw != null ? String(raw).toUpperCase() : 'CONTABLE';
    return Object.prototype.hasOwnProperty.call(NATURALEZA_DESTINO, n) ? n : 'CONTABLE';
  }

  // Destino: declarado si es valido; si no, DERIVADO de la naturaleza.
  _destino(declarado, naturaleza) {
    const d = declarado != null ? String(declarado).toUpperCase() : null;
    if (d && DESTINOS.has(d)) return d;
    return NATURALEZA_DESTINO[naturaleza] || 'ASESOR';
  }

  _obtenerOCrear(pid) {
    let c = this._colas.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-encolado-excepcion-v1', excepciones: new Map() };
      this._colas.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Lectura directa de la cola (mismo proceso) — no muta.
  colaDe(pid, destino) {
    const c = pid ? this._colas.get(pid) : null;
    if (!c) return [];
    const d = destino != null ? String(destino).toUpperCase() : null;
    return [...c.excepciones.values()].filter(x => !d || x.destino === d);
  }

  // ── Tools ──
  toolEncolar(params) { return this._encolar(params); }
  toolTomar(params) { return this._tomar(params); }
}

module.exports = EncoladoExcepcion;
