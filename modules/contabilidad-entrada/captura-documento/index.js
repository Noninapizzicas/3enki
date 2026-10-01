/**
 * contabilidad-entrada/captura-documento — REFLEJO STATELESS (A3, hoja del plan).
 *
 * Admite y VALIDA el documento recibido. MECANICO, CERO JUICIO: no interpreta el
 * contenido (eso es `extraccion-dato` A4.1). Comprueba que el documento EXISTE y trae
 * al menos un ANCLAJE (tipo / file_path / contenido / mime). Si no lo trae → RECHAZA
 * con motivo declarado; jamas se inventa un documento.
 *
 * Al admitir, ENCADENA la entrada por EVENTO:
 *   · declara `formato`  → sube `puerto-documento.entrar.request` (A4.2 traduce la forma
 *                          y sigue hacia extraccion-dato)
 *   · ya viene canonico → sube `extraccion-dato.juzgar.request` (A4.1 lo vuelve dato)
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (admitir) → sin ui_handler.
 * Ver hoja A3 del plan-construccion y diseno-oop.md (CLASE CapturaDocumento).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Anclajes que hacen ADMISIBLE un documento. Sin NINGUNO, no hay documento que admitir.
const ANCLAJES = ['tipo', 'file_path', 'contenido', 'mime', 'url'];

class CapturaDocumento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'captura-documento';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onAdmitirRequest(e) {
    return this._atender(e, 'admitir', 'captura-documento.admitir.response', (d) => {
      const res = this._admitir(d);
      if (res.status !== 200) this.eventBus?.publish('captura-documento.admitir.failed', res);
      // Reflejo: no escribe → no hay hecho que anunciar (R2). Solo encadena la entrada.
      else this._encadenar(res, d);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): llego un documento por el canal digital ──
  onDocumentoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id && !this.project_id) return;
    let res;
    try {
      res = this._admitir({
        project_id: d.project_id || this.project_id,
        documento: d.documento && typeof d.documento === 'object' ? d.documento : d,
        formato: d.formato,
        origen: d.origen,
        correlation_id: d.correlation_id
      });
    } catch (err) {
      this.logger?.error(`${this.name}.documento_recibido.error`, { error: err.message });
      return;
    }
    // Solo se encadena si el documento es admisible (sin documento NO se fabrica nada).
    if (res.status === 200 && res.data && res.data.admitido) this._encadenar(res, d);
  }

  // ══════════════════════════════════════════════════════════════════════
  // admitir(input) → { admitido, documento, encadenado_a, abierto }
  // ══════════════════════════════════════════════════════════════════════
  _admitir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const documento = input.documento;
    if (!documento || typeof documento !== 'object') return this._invalid('documento');

    // Validacion MECANICA: al menos un anclaje presente. Sin anclaje NO es admisible.
    const anclajes = ANCLAJES.filter((k) => documento[k] !== undefined && documento[k] !== null && documento[k] !== '');
    const admitido = anclajes.length > 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'captura-documento',
        admitido,
        documento,
        formato: input.formato != null ? String(input.formato) : null,
        origen: input.origen != null ? String(input.origen) : null,
        anclajes,
        // CERO JUICIO: se declara que no se interpreto el contenido (eso es extraccion-dato).
        contenido_interpretado: false,
        encadenado_a: admitido
          ? (input.formato != null ? 'puerto-documento' : 'extraccion-dato')
          : null,
        abierto: {
          documento: admitido
            ? null
            : 'el documento no trae ningun anclaje (tipo/file_path/contenido/mime/url): no se admite, no se inventa'
        }
      }
    };
  }

  // Encadena la entrada por EVENTO. Si declara formato → puerto-documento (traduce la forma);
  // si ya es canonico → extraccion-dato (lo vuelve dato). No se decide nada de negocio aqui.
  _encadenar(res, d) {
    if (!res.data || !res.data.admitido) return;
    const payload = {
      project_id: res.data.project_id,
      documento: res.data.documento,
      formato: res.data.formato,
      origen: res.data.origen || 'captura-documento',
      correlation_id: d.correlation_id
    };
    try {
      if (res.data.formato != null) this.eventBus?.publish('puerto-documento.entrar.request', payload);
      else this.eventBus?.publish('extraccion-dato.juzgar.request', payload);
    } catch (_) { /* best-effort */ }
  }

  // ── Tools ──
  toolAdmitir(params) { return this._admitir(params); }
}

module.exports = CapturaDocumento;
