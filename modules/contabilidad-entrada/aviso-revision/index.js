/**
 * contabilidad-entrada/aviso-revision — PUENTE (A8.2, hoja del plan).
 *
 * EMPUJON al canal de avisos: 'esto necesita revision'. Una EXCEPCION SIEMPRE genera aviso:
 * una pieza dudosa no se queda muda — se pide revision del asesor.
 *
 *   contabilidad.excepcion_encolada (encolado-excepcion A8.1)
 *      → aviso-revision.empujar (da forma al empujon)
 *      → contabilidad.revision_solicitada  (HECHO)
 *      → (lo ESCUCHA motor-avisos K2, que produce el aviso)
 *      y SUBE best-effort motor-avisos.producir.request
 *
 * R3 (honestidad de la escucha): el plan declara escucha de `contabilidad.excepcion_encolada`
 * (encolado-excepcion A8.1), pero ESE MODULO AUN NO EXISTE en el repo (grupo posterior) →
 * declararlo daria cadena colgada. NO se declara hasta que su emisor exista.
 *
 * Invariante: sin excepcion declarada NO se inventa una revision (dato ausente = desconocido).
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia. RPC empujar = ORDEN → ui_handler.
 * Ver hoja A8.2 del plan-construccion y diseno-oop.md (CLASE AvisoRevision).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AvisoRevision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aviso-revision';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onEmpujarRequest(e) {
    return this._atender(e, 'empujar', 'aviso-revision.empujar.response', (d) => {
      const res = this._empujar(d);
      if (res.status === 200) {
        // R2 · si EMPUJA, anuncia el HECHO: una excepcion pide revision del asesor.
        this.eventBus?.publish('contabilidad.revision_solicitada', {
          project_id: res.data.project_id,
          excepcion_id: res.data.excepcion_id,
          motivo: res.data.motivo,
          dudoso: res.data.dudoso,
          correlation_id: d.correlation_id
        });
        // SUBE (best-effort por EVENTO) la produccion del aviso a K2 (motor-avisos).
        this.eventBus?.publish('motor-avisos.producir.request', {
          project_id: res.data.project_id,
          tipo: 'revision',
          titulo: 'esto necesita revision',
          detalle: res.data.motivo,
          severidad: 'media',
          origen: 'aviso-revision',
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('aviso-revision.empujar.failed', res);
      }
      return res;
    });
  }

  // ── handler de DOMINIO (fire-and-forget): una excepcion quedo encolada → SIEMPRE avisa ──
  onExcepcionEncolada(e) {
    const d = (e && (e.data || e)) || {};
    const excepcion = d.excepcion && typeof d.excepcion === 'object' ? d.excepcion : null;
    const res = this._empujar({
      project_id: d.project_id,
      excepcion: excepcion || d,
      excepcion_id: d.excepcion_id || (excepcion && excepcion.excepcion_id),
      motivo: d.motivo || (excepcion && excepcion.motivo),
      correlation_id: d.correlation_id
    });
    if (res.status !== 200) { this.eventBus?.publish('aviso-revision.empujar.failed', res); return; }
    this.eventBus?.publish('contabilidad.revision_solicitada', {
      project_id: res.data.project_id,
      excepcion_id: res.data.excepcion_id,
      motivo: res.data.motivo,
      dudoso: res.data.dudoso,
      correlation_id: d.correlation_id
    });
    this.eventBus?.publish('motor-avisos.producir.request', {
      project_id: res.data.project_id,
      tipo: 'revision',
      titulo: 'esto necesita revision',
      detalle: res.data.motivo,
      severidad: 'media',
      origen: 'aviso-revision',
      correlation_id: d.correlation_id
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _empujar(input) → { status, data }  ·  da forma al empujon de revision
  // ══════════════════════════════════════════════════════════════════════
  _empujar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const excepcion = (input.excepcion && typeof input.excepcion === 'object') ? input.excepcion : null;
    const excepcion_id = input.excepcion_id != null ? String(input.excepcion_id)
      : (excepcion && excepcion.excepcion_id != null ? String(excepcion.excepcion_id) : null);

    // La EXCEPCION: sin ninguna referencia NO se inventa la revision (dato ausente = desconocido).
    if (excepcion_id === null && !excepcion && input.motivo == null) return this._invalid('excepcion');

    const motivo = input.motivo != null ? String(input.motivo)
      : (excepcion && excepcion.motivo != null ? String(excepcion.motivo) : null);
    // `dudoso`: la marca declarada por la excepcion (una excepcion por duda SIEMPRE avisa).
    const dudoso = input.dudoso != null ? input.dudoso === true
      : (excepcion && excepcion.dudoso != null ? excepcion.dudoso === true : null);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'aviso-revision',
        excepcion_id,
        excepcion,
        motivo,
        dudoso,
        // Una excepcion SIEMPRE genera aviso: el empujon no se silencia.
        empujado: true,
        canal: 'motores de avisos',
        abierto: {
          motivo: motivo ? null : 'la excepcion no declara motivo (se anota el hueco, no se inventa)',
          excepcion_id: excepcion_id ? null : 'la excepcion no trae id (se anota el hueco)'
        }
      }
    };
  }

  // ── Tools ──
  toolEmpujar(params) { return this._empujar(params); }
}

module.exports = AvisoRevision;
