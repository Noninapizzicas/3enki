/**
 * contabilidad-entrada/aviso-revision — PUENTE STATELESS (A8.2, hoja del plan).
 *
 * El EMPUJON al canal de avisos: "esto necesita revision". Convierte lo que ya esta en la
 * cola (`contabilidad.excepcion_encolada`, A8.1) en UN AVISO con su MOTIVO y su COLA DE
 * DESTINO, DERIVADA de la naturaleza del asunto — lo contable al ASESOR, lo del negocio
 * al DUEÑO.
 *
 * Invariantes:
 *  - NO resuelve, NO decide, NO inventa el destino: lo DERIVA de la naturaleza (o lo copia
 *    de la excepcion que ya lo traia). Si no hay naturaleza, no se afirma destino inventado.
 *  - Sin destino ni motivo no hay aviso: se declara y se cierra el circulo con el par failed.
 *  - Es PURO y sin estado: un puente que enruta el empujon; no recuerda avisos.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A8.2 del plan-construccion y diseno-oop.md (CLASE AvisoRevision).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Naturaleza declarable → cola de destino. Lo contable al ASESOR; lo del negocio al DUEÑO.
const NATURALEZA_DESTINO = {
  CONTABLE: 'ASESOR',
  NEGOCIO: 'DUENO'
};

class AvisoRevision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aviso-revision';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onEmpujarRequest(e) {
    return this._atender(e, 'empujar', 'aviso-revision.empujar.response', async (d) => {
      const res = this._empujar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el aviso quedo empujado al canal (lo consume motor-avisos).
        this.eventBus?.publish('contabilidad.aviso_revision', {
          project_id: res.data.project_id,
          aviso: res.data.aviso,
          destino: res.data.aviso.destino,
          naturaleza: res.data.aviso.naturaleza,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('aviso-revision.empujar.failed', res);
      }
      return res;
    });
  }

  // ── Fire-and-forget del flujo: una excepcion encolada se empuja como aviso ──
  onExcepcionEncolada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const ex = d.excepcion || d;
    const res = this._empujar({
      project_id: d.project_id,
      excepcion: ex,
      naturaleza: ex ? ex.naturaleza : d.naturaleza,
      destino: ex ? ex.destino : d.destino,
      correlation_id: d.correlation_id
    });
    if (res.status === 200) {
      this.eventBus?.publish('contabilidad.aviso_revision', {
        project_id: res.data.project_id,
        aviso: res.data.aviso,
        destino: res.data.aviso.destino,
        naturaleza: res.data.aviso.naturaleza,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('aviso-revision.empujar.failed', res);
    }
    return res;
  }

  // ── proyeccion: empujar(e:Excepcion) → Aviso ──
  _empujar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ex = input.excepcion || input.ex;
    if (!ex || typeof ex !== 'object') return this._invalid('excepcion');

    const motivo = ex.motivo != null ? String(ex.motivo).trim() : '';
    if (!motivo) return this._invalid('excepcion.motivo');

    const naturaleza = this._naturaleza(input.naturaleza != null ? input.naturaleza : ex.naturaleza);
    const destino = this._destino(input.destino != null ? input.destino : ex.destino, naturaleza);

    const aviso = {
      // Un aviso ES su excepcion + su motivo + su cola de destino. Nada mas se inventa.
      clave: ex.clave != null ? String(ex.clave) : null,
      id_excepcion: ex.id != null ? String(ex.id) : null,
      asunto: ex.asunto != null ? String(ex.asunto) : null,
      naturaleza,
      destino,
      motivo,
      detalle: ex.detalle && typeof ex.detalle === 'object' ? ex.detalle : null,
      origen: ex.origen != null ? String(ex.origen) : null,
      requiere_revision: true,
      empujado_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        aviso,
        // Se declara de donde sale el destino: derivado de la naturaleza, no inventado.
        destino_origen: this._destinoEsDeclarado(input.destino != null ? input.destino : ex.destino) ? 'declarado' : 'derivado',
        resuelto_por_este_puente: false
      }
    };
  }

  _naturaleza(raw) {
    const n = raw != null ? String(raw).toUpperCase() : 'CONTABLE';
    return Object.prototype.hasOwnProperty.call(NATURALEZA_DESTINO, n) ? n : 'CONTABLE';
  }

  _destinoEsDeclarado(raw) {
    if (raw === undefined || raw === null || raw === '') return false;
    const d = String(raw).toUpperCase();
    return d === 'ASESOR' || d === 'DUENO';
  }

  _destino(declarado, naturaleza) {
    if (this._destinoEsDeclarado(declarado)) return String(declarado).toUpperCase();
    return NATURALEZA_DESTINO[naturaleza] || 'ASESOR';
  }

  toolEmpujar(params) { return this._empujar(params); }
}

module.exports = AvisoRevision;
