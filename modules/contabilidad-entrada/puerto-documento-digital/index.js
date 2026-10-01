/**
 * contabilidad-entrada/puerto-documento-digital — PUENTE STATELESS (A5, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * LA RECEPCION DIGITAL DECLARABLE (frontera hacia los canales emisores).
 * ══════════════════════════════════════════════════════════════════════════════════════
 * ADAPTA el strategy-pattern REAL de `facturacion/fuentes` (Telegram push / Gmail pull,
 * extensible), que ya entrega un documento digital a un pipeline. Aqui NO se reescribe
 * ese modulo: se ADAPTA su contrato — su `factura.entrada` se traduce al contrato contable
 * `contabilidad.*`. El ADAPTADOR de cada fuente lo pone el SITIO (se declara): este puente
 * NO cablea ningun canal — CERO fuentes hardcodeadas.
 *
 * CIRCULO:
 *   (Telegram push / Gmail pull / …) → puerto-documento-digital.recibir  (RECIBE)
 *      → normalizador-hecho.entrar.request  (A2, normaliza el hecho)
 *      → extraccion-dato.juzgar.request     (A4.1, lo vuelve dato)
 *   y publica el HECHO `contabilidad.documento_recibido` (lo escucha captura-documento A3).
 *
 * Invariante (honestidad): sin documento NO se anuncia una recepcion. Sin fuente declarada
 * NO se admite el canal (dato ausente = desconocido).
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia. RPC recibir = ORDEN → ui_handler.
 * Ver hoja A5 del plan-construccion y diseno-oop.md (CLASE PuertoDocumentoDigital).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuertoDocumentoDigital extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-documento-digital';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (ORDEN → ui_handler). Una linea, delega a _atender ──
  onRecibirRequest(e) {
    return this._atender(e, 'recibir', 'puerto-documento-digital.recibir.response', (d) => {
      const res = this._recibir(d);
      if (res.status === 200) {
        // R2 · ESCRIBE (recibe el documento) → anuncia el HECHO: hay un documento recibido.
        this.eventBus?.publish('contabilidad.documento_recibido', {
          project_id: res.data.project_id,
          documento: res.data.documento,
          fuente: res.data.fuente,
          formato: res.data.formato,
          origen: res.data.origen,
          recibido_en: res.data.recibido_en,
          correlation_id: d.correlation_id
        });
        // SUBE (best-effort por EVENTO) la recepcion al pipeline de entrada.
        this._encadenar(res, d);
      } else {
        // Sin documento o fuente → par de fallo determinista.
        this.eventBus?.publish('puerto-documento-digital.recibir.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _recibir(input) → { status, data }  ·  RECIBE el documento digital
  // ══════════════════════════════════════════════════════════════════════
  _recibir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const documento = input.documento;
    if (!documento || typeof documento !== 'object') return this._invalid('documento');

    // La FUENTE declarable (canal emisor): el adaptador lo pone el sitio, no se cablea.
    const fuente = input.fuente != null ? String(input.fuente) : (documento.fuente != null ? String(documento.fuente) : null);
    if (!fuente) {
      return this._errorResponse(400, 'FUENTE_NO_DECLARADA',
        'hay que declarar la fuente/canal digital (el adaptador lo pone el sitio)', {
          fuentes_declarables: this._fuentes(input)
        });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'puerto-documento-digital',
        fuente,
        recibido: true,
        documento,
        formato: input.formato != null ? String(input.formato) : (documento.formato != null ? String(documento.formato) : null),
        origen: input.origen != null ? String(input.origen) : (documento.origen != null ? String(documento.origen) : 'digital'),
        metadatos: input.metadatos && typeof input.metadatos === 'object' ? input.metadatos : {},
        // ADAPTA facturacion/fuentes (strategy-pattern): se declara el contrato de origen traducido.
        adapta: 'facturacion/fuentes',
        contrato_traducido: { de: 'factura.entrada', a: 'contabilidad.documento_recibido' },
        recibido_en: new Date().toISOString(),
        encadenado_a: 'normalizador-hecho',
        abierto: {
          fuente: null,
          documento: null
        }
      }
    };
  }

  // Encadena la recepcion al pipeline de entrada por EVENTO (best-effort).
  //   A2 normaliza el hecho; A4.1 lo vuelve dato. Aqui NO se interpreta ni se escribe.
  _encadenar(res, d) {
    const base = {
      project_id: res.data.project_id,
      documento: res.data.documento,
      fuente: res.data.fuente,
      formato: res.data.formato,
      origen: 'puerto-documento-digital',
      correlation_id: d.correlation_id
    };
    try {
      this.eventBus?.publish('normalizador-hecho.entrar.request', base);
      this.eventBus?.publish('extraccion-dato.juzgar.request', base);
    } catch (_) { /* best-effort */ }
  }

  _fuentes(input = {}) {
    return Array.isArray(input.fuentes_declarables)
      ? input.fuentes_declarables.map((f) => String(f)).filter(Boolean)
      : [];
  }

  // ── Tools ──
  toolRecibir(params) { return this._recibir(params); }
}

module.exports = PuertoDocumentoDigital;
