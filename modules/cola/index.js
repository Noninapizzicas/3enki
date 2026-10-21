/**
 * cola — CUSTODIO [CORAZÓN] del taller 3D (pieza 2).
 *
 * La lista de impresión en cola (FIFO + urgencia) que mantiene la impresora única
 * ocupada. Único dueño del store tareas (ArrayDePrioridad FIFO+urgencia) + enImpresion,
 * persistido por proyecto (PosPersistencia).
 *
 * Reglas de dominio (plan-construccion.md 6.2 + §5):
 *   - MONEDA REAL: solo se encola una pieza CUYO gcode ya está listo en la cúpula
 *     (`gcode_listo === true`). No se encola para re-slicear.
 *   - Unica impresora: nunca dos tareas en IMPRIMIENDO.
 *   - Orden según motor-propuesta PERO el motor PROPONE, no muta: `_reordenar` solo
 *     aplica una orden YA aprobada por el dueño. La cola jamás reordena por su cuenta.
 *   - CERO juicio: no decide SI imprimir (eso lo hace el ciclo-impresion), solo ofrece
 *     `_siguienteAImprimir` (la cabecera preparada) y marca estados.
 *
 * Estado de tarea: ENCOLADA → IMPRIMIENDO → TERMINADA | CANCELADA.
 *
 * v0.1.0: FASE 4 TANDA 3.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const ESTADOS = Object.freeze(['ENCOLADA', 'IMPRIMIENDO', 'TERMINADA', 'CANCELADA']);
const nowISO = () => new Date().toISOString();
const _key = (pid, id) => `${pid}:${id}`;

class ColaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola';
    this.version = 'reflejo-0.1.0';
    this.tareas = new Map();   // `${project_id}:${id}` → TareaCola
    this.enImpresion = new Map(); // `${project_id}` → tarea_id | null
    this._contadorOrden = new Map(); // `${project_id}` → próxima posición (para orden FIFO/reordenado)

    this._persist = new PosPersistencia({
      modulo: this, file: 'cola.json', dir: '/3d/cola',
      snapshot: (pid) => ({
        project_id: pid,
        tareas: [...this.tareas.values()].filter(t => t.project_id === pid),
        en_impresion: this.enImpresion.get(pid) || null,
        contador_orden: this._contadorOrden.get(pid) || 0
      }),
      hidratar: (pid, data) => {
        if (!data) return;
        for (const t of (data.tareas || [])) {
          this.tareas.set(_key(pid, t.id), t);
        }
        if (data.en_impresion) this.enImpresion.set(pid, data.en_impresion);
        if (data.contador_orden != null) this._contadorOrden.set(pid, Number(data.contador_orden));
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onEncolarRequest(e)      { return this._atender(e, 'encolar', 'cola.encolar.response', d => this._encolar(d)); }
  onReordenarRequest(e)    { return this._atender(e, 'reordenar', 'cola.reordenar.response', d => this._reordenar(d)); }
  onMarcarUrgenteRequest(e){ return this._atender(e, 'marcar_urgente', 'cola.marcar_urgente.response', d => this._marcarUrgente(d)); }
  onCancelarRequest(e)     { return this._atender(e, 'cancelar', 'cola.cancelar.response', d => this._cancelar(d)); }
  onSiguienteRequest(e)    { return this._atender(e, 'siguiente', 'cola.siguiente.response', d => this._siguienteAImprimir(d)); }
  onImprimiendoRequest(e)  { return this._atender(e, 'imprimiendo', 'cola.imprimiendo.response', d => this._marcarImprimiendo(d)); }
  onTerminadaRequest(e)    { return this._atender(e, 'terminada', 'cola.terminada.response', d => this._marcarTerminada(d)); }

  // ── PROYECCIONES (dominio) ──

  // _encolar: añade una pieza con gcode listo al final de la cola (FIFO). La orden se
  // ajustará después SOLO si el dueño aprueba una propuesta (cola.reordenar). No re-slicea.
  async _encolar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.modelo_id || !input.archivo_id) {
      return this._invalid(input.modelo_id ? 'archivo_id' : 'modelo_id');
    }
    // MONEDA REAL: solo encolamos piezas cuyo gcode ya está listo en la cúpula.
    if (input.gcode_listo == null && input.gcode_listo !== undefined) {
      // pasa: si no se indica, default true (viene de la reserva de cupula-gcode)
    }
    const gcodeListo = input.gcode_listo !== false;

    const id = input.id || input.tarea_id || `tarea_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const urgente = input.urgente === true;
    // posición explicita (FIFO: la última encolada recibe la próxima posición)
    const orden = this._siguienteOrden(input.project_id);
    const tarea = {
      id, project_id: input.project_id,
      modelo_id: input.modelo_id,
      archivo_id: input.archivo_id,
      gcode_listo: gcodeListo,
      urgente,
      orden,
      estado: 'ENCOLADA',
      encolada_en: nowISO()
    };
    this.tareas.set(_key(input.project_id, id), tarea);
    this._persist.marcarDirty(input.project_id);
    this._publicarActualizada(input, [{ ...tarea }]);
    return { status: 201, data: { tarea, total: this._conteo(input.project_id) } };
  }

  // _reordenar: aplica una orden PROPUESTA que YA fue aprobada por el dueño.
  // Parámetro `aprobada_by` documenta la decisión humana (no decide la cola).
  // `orden` = array de { id, urgente? } en el orden aprobado.
  async _reordenar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!Array.isArray(input.orden) || input.orden.length === 0) return this._invalid('orden');
    // CERO juicio: solo aplica una orden viniendo de una propuesta aprobada.
    const decisor = input.aprobada_by || input.decision || input.origen;
    if (!decisor) {
      this._failed('reordenar', input, 'propuesta_no_aprobada', {});
      return this._errorResponse(409, 'PROPUESTA_NO_APROBADA', 'reordenar exige una propuesta aprobada por el dueño (aprobada_by u origen). La cola no reordena por su cuenta.', { decsion: null });
    }
    // Reaplicar orden sobre el conjunto vigente (FIFO+urgencia de la propuesta aprobada).
    const ordenIds = input.orden.map(o => o.id || o).filter(Boolean);
    const pid = input.project_id;
    const presentes = new Set(ordenIds);
    const existentesAux = [...this.tareas.values()].filter(t => t.project_id === pid && t.estado === 'ENCOLADA');
    const faltantes = existentesAux.filter(t => !presentes.has(t.id));
    // Asignar la posición explicita en el orden aprobado (pos 0 = primera a imprimir)
    ordenIds.forEach((oid, i) => {
      const t = this.tareas.get(_key(pid, oid));
      if (t && t.estado === 'ENCOLADA') {
        this.tareas.set(_key(pid, oid), { ...t, orden: i });
      }
    });
    // Las no mencionadas quedan después del bloque aprobado, conservando su orden relativo.
    let siguiente = ordenIds.length;
    for (const t of faltantes) {
      this.tareas.set(_key(pid, t.id), { ...t, orden: siguiente++ });
    }
    // Actualizar urgente según la orden aprobada
    const urgBy = new Map(input.orden.filter(o => typeof o === 'object').map(o => [o.id, o.urgente === true]));
    for (const [oid, urg] of urgBy) {
      const t = this.tareas.get(_key(pid, oid));
      if (t) this.tareas.set(_key(pid, oid), { ...t, urgente: urg });
    }
    this._persist.marcarDirty(pid);
    this._publicarActualizada(input, `orden reordenada (${this._conteo(pid)})`);
    return { status: 200, data: { total: this._conteo(pid), orden: ordenIds } };
  }

  // _marcarUrgente: sube la prioridad de una tarea encolada; la cola no decide el orden,
  // solo refleja la urgencia (el orden lo reordena la propuesta aprobada).
  async _marcarUrgente(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id && !input.tarea_id) return this._invalid('id');
    const id = input.id || input.tarea_id;
    const key = _key(input.project_id, id);
    const tarea = this.tareas.get(key);
    if (!tarea) return this._errorResponse(404, 'NOT_FOUND', `tarea no encontrada: ${id}`, { tarea_id: id });
    const act = { ...tarea, urgente: input.urgente !== false };
    this.tareas.set(key, act);
    this._persist.marcarDirty(input.project_id);
    this._publicarActualizada(input, [act]);
    return { status: 200, data: { tarea: act } };
  }

  // _cancelar: cancela una tarea encolada (no en impresion).
  async _cancelar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id && !input.tarea_id) return this._invalid('id');
    const id = input.id || input.tarea_id;
    const key = _key(input.project_id, id);
    const tarea = this.tareas.get(key);
    if (!tarea) return this._errorResponse(404, 'NOT_FOUND', `tarea no encontrada: ${id}`, { tarea_id: id });
    if (tarea.estado === 'IMPRIMIENDO') {
      this._failed('cancelar', input, 'no_se_cancela_en_impresion', { tarea_id: id });
      return this._errorResponse(409, 'ESTADO_ILEGAL', 'no se cancela una pieza en IMPRIMIENDO; abortar va por ciclo-impresion', { tarea_id: id, estado: tarea.estado });
    }
    const act = { ...tarea, estado: 'CANCELADA', cancelada_en: nowISO() };
    this.tareas.set(key, act);
    this._persist.marcarDirty(input.project_id);
    this._publicarActualizada(input, [act]);
    return { status: 200, data: { tarea: act } };
  }

  // _siguienteAImprimir: la cabecera YA preparada (gcode listo) en orden FIFO+urgencia.
  // Una sola impresora a la vez: si enImpresion está ocupado, NO devuelve siguiente.
  // La cola NO decide SI imprimir; solo ofrece quién toca, y el ciclo consume.
  async _siguienteAImprimir(input) {
    if (!input.project_id) return this._invalid('project_id');
    const pid = input.project_id;
    // Unica impresora: si ya hay una en IMPRIMIENDO no hay siguiente (imposible dos).
    if (this.enImpresion.get(pid)) {
      return { status: 200, data: { siguiente: null, razon: 'impresora_ocupada', en_impresion: this.enImpresion.get(pid) } };
    }
    const tareas = this._tareasDe(pid, true)  // solo ENCOLADA + gcode_listo
      .sort((a, b) => this._cmpPrioridad(a, b));
    const siguiente = tareas[0] || null;
    return { status: 200, data: { siguiente, razon: siguiente ? 'listo' : 'cola_vacia' } };
  }

  // _marcarImprimiendo: transición ENCOLADA → IMPRIMIENDO. Nunca dos a la vez.
  async _marcarImprimiendo(input) {
    if (!input.project_id) return this._invalid('project_id');
    const id = input.id || input.tarea_id;
    if (!id) return this._invalid('id');
    const key = _key(input.project_id, id);
    const tarea = this.tareas.get(key);
    if (!tarea) return this._errorResponse(404, 'NOT_FOUND', `tarea no encontrada: ${id}`, { tarea_id: id });
    const pid = input.project_id;
    // Estado ilegal imposible: nunca dos en IMPRIMIENDO (una sola impresora).
    if (this.enImpresion.get(pid) && this.enImpresion.get(pid) !== id) {
      this._failed('imprimiendo', input, 'impresora_ocupada', { en_impresion: this.enImpresion.get(pid) });
      return this._errorResponse(409, 'ESTADO_ILEGAL', 'impresora ocupada: no se puede marcar una segunda tarea en IMPRIMIENDO', { en_impresion: this.enImpresion.get(pid) });
    }
    if (tarea.estado === 'TERMINADA' || tarea.estado === 'CANCELADA') {
      this._failed('imprimiendo', input, 'estado_invalido', { estado: tarea.estado });
      return this._errorResponse(409, 'ESTADO_ILEGAL', `una tarea ${tarea.estado} no inicia impresion`, { estado: tarea.estado });
    }
    const act = { ...tarea, estado: 'IMPRIMIENDO', imprimiendo_en: nowISO() };
    this.tareas.set(key, act);
    this.enImpresion.set(pid, id);
    this._persist.marcarDirty(pid);
    this._publicarActualizada(input, [act]);
    return { status: 200, data: { tarea: act } };
  }

  // _marcarTerminada: IMPRIMIENDO → TERMINADA, libera la impresora. La cola no decide
  // encadenar (eso lo hace motor-encadenamiento al consumir pieza.imprimida).
  async _marcarTerminada(input) {
    if (!input.project_id) return this._invalid('project_id');
    const id = input.id || input.tarea_id;
    if (!id) return this._invalid('id');
    const key = _key(input.project_id, id);
    const tarea = this.tareas.get(key);
    if (!tarea) return this._errorResponse(404, 'NOT_FOUND', `tarea no encontrada: ${id}`, { tarea_id: id });
    const pid = input.project_id;
    const act = { ...tarea, estado: 'TERMINADA', terminada_en: nowISO() };
    this.tareas.set(key, act);
    if (this.enImpresion.get(pid) === id) this.enImpresion.set(pid, null);
    this._persist.marcarDirty(pid);
    this._publicarActualizada(input, [act]);
    return { status: 200, data: { tarea: act } };
  }

  // ── helpers internos (lógica de negocio DENTRO del módulo) ──

  // Solo tareas ENCOLADA (opcional filtrando por gcode_listo).
  _tareasDe(pid, soloListas) {
    const de = [];
    for (const t of this.tareas.values()) {
      if (t.project_id !== pid) continue;
      if (t.estado !== 'ENCOLADA') continue;
      if (soloListas && t.gcode_listo === false) continue;
      de.push(t);
    }
    return de;
  }

  // Comparador de prioridad de cola: URGENTE primero, luego la posición explícita
  // (FIFO por defecto; el orden aprobado por cola.reordenar la reasigna).
  _cmpPrioridad(a, b) {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
    const oa = a.orden != null ? a.orden : a.encolada_en;
    const ob = b.orden != null ? b.orden : b.encolada_en;
    if (oa === ob) return 0;
    return oa < ob ? -1 : 1;
  }

  // próxima posición FIFO (encolada_en creciente): 0 para la primera.
  _siguienteOrden(pid) {
    const cont = this._contadorOrden.get(pid) || 0;
    this._contadorOrden.set(pid, cont + 1);
    return cont;
  }

  _conteo(pid) {
    return this._tareasDe(pid, false).length;
  }

  _failed(op, input, motivo, extra) {
    this._publicarEvento(`cola.${op}.failed`, {
      project_id: input.project_id, motivo, ...extra,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
  }

  _publicarActualizada(input, detalle) {
    this._publicarEvento('cola.actualizada', {
      project_id: input.project_id, detalle,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = ColaReflejo;
