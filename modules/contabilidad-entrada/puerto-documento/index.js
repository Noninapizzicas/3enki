/**
 * contabilidad-entrada/puerto-documento — CONVERSOR STATELESS (A4.2, hoja del plan).
 *
 * FRONTERA de las FORMAS DECLARABLES del documento de entrada. El ADAPTADOR lo pone
 * el SITIO (se declara), no el modulo: aqui solo se traduce la FORMA.
 *
 * LA LEY / LA FORMA ENTRA COMO DATO: el `formato` y el `mapeo` (campo canonico →
 * clave externa) son DECLARABLES. NO hay NINGUN esquema cableado. Sin `formato`
 * declarado NO se traduce; si el formato no tiene `mapeo` declarado y no es el
 * canonico → 422 FORMATO_NO_DECLARABLE.
 *
 * Invariante: dato ausente = desconocido. Un campo que no viene del exterior queda
 * `null` y se declara en `abierto` (jamas se estima).
 *
 * NO interpreta el CONTENIDO (eso es `extraccion-dato` A4.1): si el documento trae
 * algo interpretable, lo SUBE por EVENTO a `extraccion-dato.juzgar.request`.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia. PREGUNTA (entrar) → sin ui_handler.
 * Ver hoja A4.2 del plan-construccion y diseno-oop.md (CLASE PuertoDocumento).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos de un DOCUMENTO de entrada. Su ORIGEN externo es declarable (mapeo).
const CAMPOS_DOCUMENTO = ['tipo', 'contenido', 'file_path', 'mime', 'origen', 'fecha', 'importe_total', 'tercero'];

class PuertoDocumento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-documento';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (PREGUNTA → sin ui_handler) ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'puerto-documento.entrar.response', async (d) => {
      const res = this._entrar(d);
      // Conversor puro: no escribe → no hay hecho que anunciar. Su cara es el bus.
      if (res.status !== 200) this.eventBus?.publish('puerto-documento.entrar.failed', res);
      // Si el documento trae algo interpretable, se encadena a extraccion-dato (best-effort).
      else this._encadenar(res, d);
      return res;
    });
  }

  // ── entrar: forma externa → forma canonica del documento ──
  _entrar(input = {}) {
    const formato = this._formato(input);
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato del documento de entrada', { esquemas_declarables: this._esquemas(input) });
    }
    const externo = input.documento || input.externo;
    if (!externo || typeof externo !== 'object') return this._invalid('documento');

    const mapeo = this._mapeoDe(input, formato, this._esquemas(input));
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado',
        { formato, esquemas_declarables: this._esquemas(input) });
    }

    const documento = {};
    const faltantes = [];
    for (const campo of CAMPOS_DOCUMENTO) {
      const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
      const raw = externo[clave];
      if (raw === undefined || raw === null || raw === '') { documento[campo] = null; faltantes.push(campo); }
      else documento[campo] = raw;
    }
    // Los campos extra del exterior se conservan bajo `metadatos` (no se pierde nada).
    const conocidas = new Set(CAMPOS_DOCUMENTO.map((c) => (mapeo[c] != null ? String(mapeo[c]) : c)));
    const metadatos = {};
    for (const [k, v] of Object.entries(externo)) if (!conocidas.has(k)) metadatos[k] = v;
    documento.metadatos = metadatos;

    return {
      status: 200,
      data: {
        project_id: input.project_id || this.project_id || null,
        formato,
        direccion: 'entrar',
        documento,
        adaptador_declarado: Boolean(input.mapeo),
        // Cruza FORMA, no decide CONTENIDO: se declara que no se interpreto nada.
        contenido_interpretado: false,
        abierto: faltantes
      }
    };
  }

  // La frontera TRADUCE la forma; si el documento trae algo interpretable se sube a
  // extraccion-dato (A4.1) por EVENTO, que es quien lo vuelve DATO. No se inventa nada.
  _encadenar(res, d) {
    const doc = res.data.documento || {};
    if (!doc.tipo && !doc.contenido && !doc.file_path && !doc.mime) return;   // sin documento NO se fabrica
    try {
      this.eventBus?.publish('extraccion-dato.juzgar.request', {
        project_id: res.data.project_id,
        documento: doc,
        formato: res.data.formato,
        origen: 'puerto-documento',
        correlation_id: d.correlation_id
      });
    } catch (_) { /* best-effort */ }
  }

  _formato(input = {}) {
    const f = input.formato != null ? String(input.formato).trim() : '';
    return f || null;
  }

  _esquemas(input = {}) {
    return Array.isArray(input.esquemas_declarables)
      ? input.esquemas_declarables.map((f) => String(f)).filter(Boolean)
      : [];
  }

  _mapeoDe(input, formato, esquemas) {
    if (input.mapeo && typeof input.mapeo === 'object') return input.mapeo;
    const canonico = formato === 'canonico' || formato === 'enki';
    if (canonico || esquemas.includes(formato)) {
      const identidad = {};
      for (const c of CAMPOS_DOCUMENTO) identidad[c] = c;
      return identidad;
    }
    return null;
  }

  // ── Tools ──
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = PuertoDocumento;
