/**
 * contabilidad-entrada/encolado-excepcion — CUSTODIO CON PERSISTENCIA (A8.1, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * LA PARCELA DE LO DUDOSO. UN SOLO ESCRITOR. **El flujo CONTINUA; lo dudoso espera.**
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Cuando algo no se puede resolver automaticamente, NO se inventa el dato y NO se para el
 * flujo: se ENCOLA la excepcion para que un humano la revise. Aqui solo se apunta; el
 * empujon al canal de avisos lo da `aviso-revision` (A8.2), que ESCUCHA el hecho de esta
 * cola — no se pisan.
 *
 * Invariantes:
 *  - UN escritor por parcela (guard rol ENCOLADO_EXCEPCION; segundo escritor → 403).
 *  - IDEMPOTENTE por clave: la misma excepcion (misma clave) no se encola dos veces
 *    (at-least-once del bus); se declara `duplicada:true`, no se duplica en silencio.
 *  - APPEND-ONLY de pendientes: encolar AÑADE; tomar NO borra — MARCA como tomada
 *    (append-only de la historia: la excepcion sigue visible, con quien la tomo).
 *  - Dato ausente = desconocido: sin motivo/clave declarada se anota el hueco, no se estima.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R2 · ESCRIBE → ANUNCIA: al encolar publica `contabilidad.excepcion_encolada` (el hecho que
 * escucha aviso-revision A8.2 y demas). Sin ese hecho, la revision seria invisible.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + single-writer + append-only.
 * Ver hoja A8.1 del plan-construccion y diseno-oop.md (CLASE EncoladoExcepcion).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela de excepciones.
const ROL_ESCRITOR = 'ENCOLADO_EXCEPCION';

class EncoladoExcepcion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'encolado-excepcion';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, cola: [Excepcion append-only], claves:Set }
    this._colas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'encolado-excepcion.json',
      dir: '/contabilidad/encolado-excepcion',
      snapshot: (pid) => {
        const c = this._colas.get(pid);
        if (!c) return null;
        return { project_id: pid, esquema: c.esquema, cola: c.cola };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const cola = Array.isArray(data.cola) ? data.cola : [];
        const claves = new Set(cola.map((e) => e && e.clave).filter(Boolean));
        this._colas.set(pid, { esquema: data.esquema || 'contabilidad-encolado-excepcion-v1', cola, claves });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la cola del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC de escritura (ORDEN → ui_handler) ──
  onEncolarRequest(e) {
    return this._atender(e, 'encolar', 'encolado-excepcion.encolar.response', (d) => {
      const res = this._encolar(d);
      if (res.status === 200 && res.data && res.data.encolada) {
        // R2 · si ESCRIBE, anuncia el HECHO: hay una excepcion en espera de revision.
        this.eventBus?.publish('contabilidad.excepcion_encolada', {
          project_id: res.data.project_id,
          excepcion_id: res.data.excepcion.excepcion_id,
          clave: res.data.excepcion.clave,
          motivo: res.data.excepcion.motivo,
          origen: res.data.excepcion.origen,
          pendientes: res.data.pendientes,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        this.eventBus?.publish('encolado-excepcion.encolar.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC de lectura (PREGUNTA → sin ui_handler) ──
  onTomarRequest(e) {
    return this._atender(e, 'tomar', 'encolado-excepcion.tomar.response', (d) => {
      const res = this._tomar(d);
      if (res.status !== 200) this.eventBus?.publish('encolado-excepcion.tomar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _encolar(input) → { status, data }  ·  encola lo dudoso (no lo resuelve)
  // ══════════════════════════════════════════════════════════════════════
  _encolar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // UN escritor: si OTRO rol intenta escribir, se rechaza. Sin rol declarado, este
    // custodio es el unico escritor por construccion (la puerta no se cierra al vacio).
    if (input.rol != null && input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor de la parcela de excepciones (ENCOLADO_EXCEPCION) puede encolar',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol });
    }

    const clave = input.clave != null ? String(input.clave)
      : (input.ref != null ? String(input.ref)
      : (input.entidad != null ? String(input.entidad) + ':' + String(input.entidad_id ?? '') : null));
    if (!clave) return this._invalid('clave');

    const cola = this._obtenerOCrear(pid);

    // IDEMPOTENTE por clave: la misma excepcion no se encola dos veces (append-only).
    if (cola.claves.has(clave)) {
      return {
        status: 200,
        data: {
          project_id: pid,
          excepcion: null,
          encolada: false,
          duplicada: true,
          pendientes: this._pendientes(cola),
          motivo: 'la excepcion ya estaba en la cola (misma clave): no se duplica (append-only)'
        }
      };
    }

    const ahora = new Date().toISOString();
    const excepcion = {
      excepcion_id: `exc_${pid}_${crypto.randomUUID().slice(0, 8)}`,
      clave,
      motivo: input.motivo != null ? String(input.motivo) : null,
      origen: input.origen != null ? String(input.origen) : (input.vertical != null ? String(input.vertical) : null),
      entidad: input.entidad != null ? String(input.entidad) : null,
      entidad_id: input.entidad_id != null ? String(input.entidad_id) : null,
      payload: input.payload && typeof input.payload === 'object' ? input.payload : null,
      estado: 'pendiente',
      tomada_por: null,
      tomada_en: null,
      encolada_en: ahora
    };
    // APPEND-ONLY: se apila; NUNCA se borra.
    cola.cola.push(excepcion);
    cola.claves.add(clave);
    cola.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        excepcion,
        encolada: true,
        duplicada: false,
        pendientes: this._pendientes(cola),
        append_only: true,
        // El flujo CONTINUA: encolar no bloquea nada (lo dudoso espera, el resto sigue).
        flujo_continua: true,
        abierto: {
          motivo: excepcion.motivo ? null : 'la excepcion no declaro motivo (se apila el hueco, no se inventa)',
          origen: excepcion.origen ? null : 'la excepcion no declaro su origen'
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // _tomar(input) → { status, data }  ·  toma (marca) una excepcion de la cola
  // ══════════════════════════════════════════════════════════════════════
  _tomar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cola = this._colas.get(pid) || null;
    if (!cola || cola.cola.length === 0) {
      return { status: 200, data: { project_id: pid, excepcion: null, pendientes: 0, vacia: true } };
    }

    // Tomar la primera PENDIENTE (o la de la clave declarada). NO se borra: se MARCA.
    const idx = input.clave != null
      ? cola.cola.findIndex((x) => x.clave === String(input.clave) && x.estado === 'pendiente')
      : cola.cola.findIndex((x) => x.estado === 'pendiente');

    if (idx === -1) {
      return { status: 200, data: { project_id: pid, excepcion: null, pendientes: this._pendientes(cola), vacia: this._pendientes(cola) === 0 } };
    }

    const excepcion = cola.cola[idx];
    const ahora = new Date().toISOString();
    // APPEND-ONLY de la HISTORIA: se marca tomada; la excepcion SIGUE en la cola.
    excepcion.estado = 'tomada';
    excepcion.tomada_por = input.revisor != null ? String(input.revisor) : null;
    excepcion.tomada_en = ahora;
    cola.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        excepcion,
        pendientes: this._pendientes(cola),
        append_only: true,
        abierto: { revisor: excepcion.tomada_por ? null : 'no se declaro quien la toma (se anota el hueco, no se inventa)' }
      }
    };
  }

  _pendientes(cola) {
    return cola.cola.filter((x) => x.estado === 'pendiente').length;
  }

  _obtenerOCrear(pid) {
    let c = this._colas.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-encolado-excepcion-v1', cola: [], claves: new Set() };
      this._colas.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // ── Tools ──
  toolEncolar(params) { return this._encolar(params); }
  toolTomar(params) { return this._tomar(params); }
}

module.exports = EncoladoExcepcion;
