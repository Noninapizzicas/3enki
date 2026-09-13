/**
 * motor-propuesta — REFLEJO del taller 3D (pieza 11).
 *
 * Ordena la cola de impresión (FIFO + urgencia + preferencia a preparadas + agrupación
 * por afinidad ABIERTO) y PROPONE la próxima tanda al dueño. NO decide solo.
 *
 * La orden propuesta vuelve por la response correlada (`motor-propuesta.proponer.response`);
 * el jefe la aprueba vía `cola.reordenar` (decisión humana). Sin aprobación del dueño la
 * cola jamás se reordena. CERO juicio automático: PROPUESTA ≠ DECISIÓN.
 *
 * Propuesta que el dueño aprueba, y que el motor-encadenamiento NO fabrica por su cuenta:
 * este módulo no muta el store de la cola (reflejo puro) ni dispara imprimir.
 *
 * Operaciones del plano (plan-construccion.md 6.8): _proponerOrden.
 * Par de fallo motor-propuesta.proponer.failed.
 *
 * v0.1.0: FASE 4 TANDA 3.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

class MotorPropuestaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-propuesta';
    this.version = 'reflejo-0.1.0';
  }

  // ── Handler RPC ──
  onProponerRequest(e) { return this._atender(e, 'proponer', 'motor-propuesta.proponer.response', d => this._proponerOrden(d)); }

  // ── PROYECCIONES (dominio) ──

  // _proponerOrden: construye la PROPUESTA de orden de la cola.
  // Prioridad (del plano): 1) URGENTE  → 2) FIFO por antigüedad de encolado → 3) preferencia
  // a las piezas YA preparadas (gcode listo) → 4) [ABIERTO afinidad: agrupar por modelo/color
  // para minimizar cambios de bobina — no implementado; decisión del dueño].
  // Devuelve SOLO una propuesta (lista de ids); NO toca el store de la cola. El jefe aprueba
  // vía cola.reordenar.
  async _proponerOrden(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (input.tareas != null && !Array.isArray(input.tareas)) return this._invalid('tareas');
    const tareas = Array.isArray(input.tareas) ? input.tareas : (input.cola || input.items || []);
    if (!Array.isArray(tareas)) return this._invalid('tareas');

    const vigentes = tareas
      .filter(t => t && (!t.estado || t.estado === 'ENCOLADA'))
      .map(t => ({
        id: t.id || t.tarea_id,
        modelo_id: t.modelo_id,
        archivo_id: t.archivo_id,
        urgente: t.urgente === true,
        gcode_listo: t.gcode_listo !== false,
        encolada_en: t.encolada_en || t.encoladaEn
      }));

    // 1) URGENTE primero
    const urgentes = vigentes.filter(t => t.urgente);
    const normales = vigentes.filter(t => !t.urgente);

    // 2) FIFO por antigüedad, 3) preferencia a preparadas
    const preparadas = (arr) => arr.filter(t => t.gcode_listo);
    const sinPreparar = (arr) => arr.filter(t => !t.gcode_listo);
    const porAntiguedad = (arr) => arr.slice().sort((a, b) => {
      const ka = (t) => t.orden != null ? ['n', Number(t.orden)] : ['s', String(t.encolada_en || '')];
      const [ta, va] = ka(a);
      const [tb, vb] = ka(b);
      if (ta !== tb) return ta < tb ? -1 : 1; // con orden explícita va delante (FIFO/reordenado)
      return va < vb ? -1 : va > vb ? 1 : 0;
    });

    const _orden = (arr) => porAntiguedad(preparadas(arr)).concat(porAntiguedad(sinPreparar(arr)));

    const orden = _orden(urgentes).concat(_orden(normales));

    return {
      status: 200,
      data: {
        // PROPUESTA (no decisión): el jefe la aprueba vía cola.reordenar.
        propuesta: true,
        orden: orden.map(t => ({ id: t.id, modelo_id: t.modelo_id, urgente: t.urgente })),
        total: vigentes.length,
        nota: 'PROPUESTA — el jefe la aprueba vía cola.reordenar; el sistema no decide solo'
      }
    };
  }

  // helpers internos (lógica de negocio DENTRO del módulo)
  _failed(op, input, motivo, extra) {
    this._publicarEvento(`motor-propuesta.${op}.failed`, {
      project_id: input.project_id, motivo, ...extra,
      correlation_id: input.correlation_id, timestamp: new Date().toISOString()
    });
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = MotorPropuestaReflejo;
