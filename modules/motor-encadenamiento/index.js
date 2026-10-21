/**
 * motor-encadenamiento — REFLEJO del taller 3D (pieza 10).
 *
 * Al terminar una impresión (consumo de `pieza.imprimida` → `motor-encadenamiento.
 * al_terminar.request`), el motor ELIGE la siguiente de la cola (cabecera YA preparada
 * en la cúpula, una sola impresora) y la encadena disparando `ciclo-impresion.iniciar.request`.
 * Si no hay nada listo emite `cola_vacia` (impresora ociosa).
 *
 * CERO juicio: este motor no decide SI imprimir (eso vive en el ciclo de impresión),
 * solo encadena la cabecera lista. Encadena SOLO lo que la cola ofrece como siguiente
 * (`cola.siguiente.request`: gcode listo + impresora libre).
 *
 * El ciclo-impresion se construye en la TANDA 4: aquí su invocación queda DECLARADA como
 * RPC (`ciclo-impresion.iniciar.request`) que esta tanda deja lista para cablear.
 *
 * Operaciones del plano (plan-construccion.md 6.7): _alTerminar.
 * Par de fallo motor-encadenamiento.al_terminar.failed.
 *
 * v0.1.0: FASE 4 TANDA 3.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

class MotorEncadenamientoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-encadenamiento';
    this.version = 'reflejo-0.1.0';
  }

  // ── Handler RPC ──
  onAlTerminarRequest(e) {
    return this._atender(e, 'al_terminar', 'motor-encadenamiento.al_terminar.response', d => this._alTerminar(d));
  }

  // ── PROYECCIONES (dominio) ──

  // _alTerminar: al terminar una impresión, marca la tarea terminada en la cola, obtiene
  // la siguiente (cabecera preparada) y la encadena. Si no hay nada listo → cola_vacia.
  //   input: { project_id, tarea_id } y opcionalmente { siguiente } si el llamante ya la
  //   resolvió; en despliegue real se delega por RPC a la cola (cola.terminada / cola.siguiente).
  //   El ciclo se dispara como RPC declarado (ciclo-impresion.iniciar.request), a cablear en tanda 4.
  async _alTerminar(input) {
    if (!input.project_id) return this._invalid('project_id');

    // 1) Marcar la tarea terminada en la cola (best-effort; en el bus real es RPC). La cola
    //    libera la impresora y avisa con cola.actualizada.
    if (input.tarea_id && this.eventBus?.publish) {
      try { await this._rpc('cola.terminada.request', { project_id: input.project_id, id: input.tarea_id }); }
      catch (_) { /* mejor esfuerzo; el fallo real pasa por cola.terminada.failed */ }
    }

    // 2) Resolver la siguiente: la provee el llamante (input.siguiente) o se delega por RPC
    //    a la cola (cola.siguiente.request → cabecera YA preparada en la cúpula).
    let siguiente = input.siguiente != null ? (input.siguiente === null ? null : input.siguiente)
      : (await this._rpc('cola.siguiente.request', { project_id: input.project_id }));
    // Normalizar la respuesta del RPC: puede venir envuelta como { data: { siguiente } },
    // como { siguiente }, o como null.
    if (siguiente && typeof siguiente === 'object') {
      if (siguiente.data && 'siguiente' in siguiente.data) siguiente = siguiente.data.siguiente;
      else if ('siguiente' in siguiente) siguiente = siguiente.siguiente;
    }

    // 3) Si hay siguiente lista → encadenar disparando el ciclo (RPC declarado; el ciclo-impresion
    //    se construye en la tanda 4). Si NULO → impresora ociosa (cola_vacia).
    if (siguiente) {
      const pieza = {
        project_id: input.project_id,
        tarea_id: siguiente.id || siguiente.tarea_id,
        modelo_id: siguiente.modelo_id,
        archivo_id: siguiente.archivo_id,
        correlation_id: input.correlation_id
      };
      // Invocación al ciclo DECLARADA (se cablea cuando exista ciclo-impresion, tanda 4).
      try { await this._rpc('ciclo-impresion.iniciar.request', pieza); } catch (_) { /* tanda 4 */ }
      this._publicarEvento('motor-encadenamiento.al_terminar.response', { ...pieza, encadenada: true });
      return { status: 200, data: { encadenada: true, pieza } };
    }

    this._publicarColaVacia(input);
    return { status: 200, data: { encadenada: false, cola_vacia: true } };
  }

  // helpers internos (lógica de negocio DENTRO del módulo)
  _publicarColaVacia(input) {
    this._publicarEvento('cola_vacia', {
      project_id: input.project_id,
      correlation_id: input.correlation_id,
      timestamp: new Date().toISOString()
    });
  }

  _failed(op, input, motivo, extra) {
    this._publicarEvento(`motor-encadenamiento.${op}.failed`, {
      project_id: input.project_id, motivo, ...extra,
      correlation_id: input.correlation_id, timestamp: new Date().toISOString()
    });
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = MotorEncadenamientoReflejo;
