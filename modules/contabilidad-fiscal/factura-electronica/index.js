/**
 * contabilidad-fiscal/factura-electronica — CONVERSOR STATELESS (D9, hoja del plan).
 *
 * LA FRONTERA UNICA DE FORMATO de la factura: convierte entre la representacion EXTERNA
 * (formato estructurado que pida el sitio: Facturae, UBL, JSON de un programa externo…) y
 * la `FacturaEmitida` canonica del dominio. Cruza FORMATO, no decide CONTENIDO: no calcula
 * importes, no compone el desglose (eso es emision-factura-venta O1), no firma y no presenta.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): el `formato` y el `mapeo` (campo canonico → clave
 * externa) son DECLARABLES y entran como DATO. NO hay ningun esquema Facturae cableado — ni
 * versiones, ni etiquetas XML, ni namespaces, ni codigos de impuesto. Sin `formato` declarado
 * NO se convierte; si el formato no tiene `mapeo` declarado y no es el canonico, se rechaza
 * (422 FORMATO_NO_DECLARABLE). Los `esquemas_declarables` los declara el sitio.
 *
 * Invariante: dato ausente = desconocido. Un campo que no viene del exterior queda `null` y
 * se declara en `abierto` (jamas se estima ni se completa).
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja D9 del plan-construccion y diseno-oop.md (CLASE FacturaElectronica).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos de la FacturaEmitida. Su ORIGEN externo es declarable (mapeo).
const CAMPOS_FACTURA = ['serie', 'numero', 'fecha', 'emisor', 'receptor', 'base', 'impuestos', 'total', 'moneda'];

class FacturaElectronica extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'factura-electronica';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC (una linea cada uno: delegan a _atender) ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'factura-electronica.entrar.response', async (d) => {
      const res = this._entrar(d);
      if (res.status !== 200) this.eventBus?.publish('factura-electronica.entrar.failed', res);
      return res;
    });
  }

  onSalirRequest(e) {
    return this._atender(e, 'salir', 'factura-electronica.salir.response', async (d) => {
      const res = this._salir(d);
      if (res.status !== 200) this.eventBus?.publish('factura-electronica.salir.failed', res);
      return res;
    });
  }

  // ── entrar: externo (formato estructurado) → FacturaEmitida canonica ──
  _entrar(input = {}) {
    const formato = this._formato(input);
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato estructurado de entrada', { esquemas_declarables: this._esquemas(input) });
    }

    const externo = input.externo;
    if (!externo || typeof externo !== 'object') return this._invalid('externo');

    const mapeo = this._mapeoDe(input, formato, this._esquemas(input));
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado',
        { formato, esquemas_declarables: this._esquemas(input) });
    }

    const f = this._aFactura(externo, mapeo);
    return {
      status: 200,
      data: {
        project_id: input.project_id || this.project_id || null,
        formato,
        direccion: 'entrar',
        factura: f.value,
        adaptador_declarado: Boolean(input.mapeo),
        // Cruza FORMATO, no decide CONTENIDO: se declara que no se compuso nada.
        contenido_compuesto: false,
        abierto: f.faltantes
      }
    };
  }

  // ── salir: FacturaEmitida canonica → externo (formato declarado) ──
  _salir(input = {}) {
    const formato = this._formato(input);
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato estructurado de salida', { esquemas_declarables: this._esquemas(input) });
    }

    const factura = input.factura;
    if (!factura || typeof factura !== 'object') return this._invalid('factura');

    const mapeo = this._mapeoDe(input, formato, this._esquemas(input));
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado',
        { formato, esquemas_declarables: this._esquemas(input) });
    }

    const externo = {};
    for (const campo of CAMPOS_FACTURA) {
      const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
      externo[clave] = factura?.[campo] ?? null;   // ausente → null, no se estima
    }

    return {
      status: 200,
      data: {
        project_id: input.project_id || this.project_id || null,
        formato,
        direccion: 'salir',
        externo,
        adaptador_declarado: Boolean(input.mapeo),
        // Cruza FORMATO, no decide CONTENIDO: no firma ni presenta (eso es del asesor).
        firmado: false,
        presentado: false
      }
    };
  }

  // Traduce una representacion externa a la FacturaEmitida canonica.
  _aFactura(externo, mapeo) {
    const value = {};
    const faltantes = [];
    for (const campo of CAMPOS_FACTURA) {
      const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
      const raw = externo[clave];
      if (raw === undefined || raw === null || raw === '') {
        value[campo] = null;              // desconocido — NO se estima
        faltantes.push(campo);
      } else {
        value[campo] = raw;
      }
    }
    // Los campos extra del exterior se conservan bajo `metadatos` (no se pierde nada).
    const conocidas = new Set(CAMPOS_FACTURA.map((c) => (mapeo[c] != null ? String(mapeo[c]) : c)));
    const metadatos = {};
    for (const [k, v] of Object.entries(externo)) if (!conocidas.has(k)) metadatos[k] = v;
    value.metadatos = metadatos;
    return { value, faltantes };
  }

  // El formato es DECLARABLE: entra como dato; sin el, no se adivina la codificacion.
  _formato(input = {}) {
    const f = input.formato != null ? String(input.formato).trim() : '';
    return f || null;
  }

  // Los esquemas declarables los declara el sitio; el modulo NO conoce ninguno de memoria.
  _esquemas(input = {}) {
    return Array.isArray(input.esquemas_declarables)
      ? input.esquemas_declarables.map((f) => String(f)).filter(Boolean)
      : [];
  }

  // Resuelve el mapeo declarado. Sin mapeo, solo el formato canonico declarado o un esquema declarado.
  _mapeoDe(input, formato, esquemas) {
    if (input.mapeo && typeof input.mapeo === 'object') return input.mapeo;
    const canonico = formato === 'canonico' || formato === 'enki';
    if (canonico || esquemas.includes(formato)) {
      const identidad = {};
      for (const c of CAMPOS_FACTURA) identidad[c] = c;
      return identidad;
    }
    return null;
  }

  // ── Tools ──
  toolEntrar(params) { return this._entrar(params); }
  toolSalir(params) { return this._salir(params); }
}

module.exports = FacturaElectronica;
