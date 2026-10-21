/**
 * contabilidad-fiscal/acuse-presentacion — PUENTE STATELESS (D13, hoja del plan).
 *
 * Recoge y LIGA el justificante/acuse de la administracion a su modelo y a su asiento.
 * CIERRA EL BUCLE HACIA FUERA: lo presentado queda justificado.
 *
 * Es un PUENTE, no un custodio: NO guarda estado propio. RECOGE lo que le declaran, lo LIGA
 * (modelo ↔ acuse ↔ asiento) y SUBE por EVENTO a los tres modulos que si actuan:
 *   estado-presentacion-fiscal.avanzar.request  (el modelo avanza de estado)
 *   escritor-diario.asentar.request             (el asiento de la declaracion, si toca)
 *   expediente-documental.archivar.request      (el acuse queda archivado)
 * y anuncia el hecho `contabilidad.declaracion_justificada`.
 *
 * Invariante (13): sin ACUSE declarado NO se liga nada — no se finge una justificacion. Un
 * acuse sin modelo ni asiento referenciados se liga a medias y se declara `abierto`.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated. ORDEN → ui_handler.
 * Ver hoja D13 del plan-construccion y diseno-oop.md (CLASE AcusePresentacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AcusePresentacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'acuse-presentacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onLigarRequest(e) {
    return this._atender(e, 'ligar', 'acuse-presentacion.ligar.response', async (d) => {
      const res = this._ligar(d);
      if (res.status === 200) {
        // R2 · el puente CIERRA el bucle: anuncia el HECHO de que la declaracion quedo justificada.
        this.eventBus?.publish('contabilidad.declaracion_justificada', {
          project_id: res.data.project_id,
          modelo: res.data.modelo,
          acuse: res.data.acuse,
          ligado: res.data.ligado,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
        // SUBE por EVENTO a los tres que si actuan (no guarda estado propio).
        this.eventBus?.publish('estado-presentacion-fiscal.avanzar.request', {
          project_id: res.data.project_id, modelo: res.data.modelo,
          justificada: res.data.ligado, acuse: res.data.acuse, correlation_id: d.correlation_id
        });
        if (res.data.asiento) {
          this.eventBus?.publish('escritor-diario.asentar.request', {
            project_id: res.data.project_id, asiento: res.data.asiento, origen: 'acuse-presentacion', correlation_id: d.correlation_id
          });
        }
        if (res.data.acuse) {
          this.eventBus?.publish('expediente-documental.archivar.request', {
            project_id: res.data.project_id, documento: res.data.acuse, ref: res.data.modelo, correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('acuse-presentacion.ligar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _ligar(input) → { status, data }  ·  liga acuse ↔ modelo ↔ asiento
  // ══════════════════════════════════════════════════════════════════════
  _ligar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El ACUSE/justificante: DECLARADO. Sin el no hay nada que ligar (no se finge).
    const acuse = (input.acuse != null ? input.acuse
      : (input.justificante != null ? input.justificante : input.documento));
    if (acuse === undefined || acuse === null || (typeof acuse === 'object' && Object.keys(acuse).length === 0)) {
      return this._invalid('acuse');
    }

    // El MODELO al que pertenece el acuse (referencia). Ausente → se declara el hueco.
    const modelo = input.modelo != null ? String(input.modelo)
      : (input.obligacion != null ? String(input.obligacion) : null);
    // El ASIENTO con el que se liga (si toca). Ausente → no se sube asiento.
    const asiento = (input.asiento && typeof input.asiento === 'object') ? input.asiento : null;

    const ligado = Boolean(modelo);
    // Normaliza el acuse: id/ref + fecha si vienen; lo ausente queda null (no se inventa).
    const acuseNorm = (typeof acuse === 'object')
      ? {
        ref: acuse.ref != null ? String(acuse.ref) : (acuse.id != null ? String(acuse.id) : null),
        fecha: acuse.fecha != null ? String(acuse.fecha) : null,
        csv: acuse.csv != null ? String(acuse.csv) : null,
        tipo: acuse.tipo != null ? String(acuse.tipo) : null
      }
      : { ref: String(acuse), fecha: null, csv: null, tipo: null };

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'acuse-presentacion',
        modelo,
        acuse: acuseNorm,
        asiento,
        // Ligado = el acuse queda atado a su modelo (y asiento si vino).
        ligado,
        liga: { modelo: Boolean(modelo), asiento: Boolean(asiento) },
        // El puente NO guarda estado: su cara es el bus.
        persistido: false,
        sube: ['estado-presentacion-fiscal.avanzar.request', 'escritor-diario.asentar.request', 'expediente-documental.archivar.request'],
        abierto: {
          modelo: modelo ? null : 'el acuse no declara el modelo al que pertenece: se liga a medias (no se inventa el modelo)',
          asiento: asiento ? null : 'el acuse no trae asiento: no se sube asiento al libro (no se fabrica)'
        }
      }
    };
  }

  // ── Tools ──
  toolLigar(params) { return this._ligar(params); }
}

module.exports = AcusePresentacion;
