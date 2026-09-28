/**
 * contabilidad/factura-electronica — CONVERSOR STATELESS (D9, hoja del plan).
 *
 * LA FRONTERA DEL FORMATO ESTRUCTURADO DE LA FACTURA: un solo cruce, en los dos
 * sentidos.
 *   - emitirEstructurada(factura) -> DocumentoEstructurado  (sale en Facturae/UBL)
 *   - interpretarEstructurado(documento) -> Factura          (entra UN documento
 *     ya estructurado → SIN extraccion: no pasa por A4.1)
 * El formato concreto es DECLARABLE ([ABIERTO]): Facturae es el valor por defecto
 * declarable (Espana), no una constante cableada; el escritor puede declarar otro
 * (UBL, CII...) y el conversor lo respeta. Si falta una forma → se CREA
 * (invariante de puerto abierto).
 *
 * CONVERSOR (patron real, stateless): sin PosPersistencia ni project.activated.
 * Entra objeto, sale objeto. El catalogo de formatos declarados vive en memoria
 * del propio conversor (es configuracion del adaptador de formato, no parcela
 * persistente). NO emite el documento fiscal (eso es emision-factura-venta O1) ni
 * lo registra (registro-verifactu D8): solo TRADUCE forma.
 *
 * Emisor/par de fallo: exito publica contabilidad.factura_estructurada /
 * contabilidad.factura_interpretada; error su par determinista.
 * NO REUTILIZA: la factura electronica estructurada no existe en el inventario;
 * el formato concreto es declarable.
 *
 * Ver hoja D9 del diseno-oop y bloque `factura-electronica` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Formatos estructurados que el conversor SABE traducir de fabrica. Un formato
// nuevo se registra con _registrarFormato (invariante de puerto abierto).
const FORMATOS_BASE = new Set(['FACTURAE', 'UBL', 'CII', 'JSON_ESTRUCTURADO']);

// Formato por defecto DECLARABLE: valor declarable inicial (Espana), no ley cableada.
const FORMATO_DEFECTO = 'FACTURAE';

const VERSION_FACTURAE = '3.2.2';

class FacturaElectronica extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'factura-electronica';
    this.version = 'reflejo-0.1.0';
    // Conversor stateless: catalogo de formatos declarados en memoria (por formato).
    this._formatos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onEstructurarRequest(e) {
    return this._atender(e, 'estructurar', 'contabilidad.factura.estructurar.response', async (d) => {
      const res = this._emitirEstructurada(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.factura_estructurada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.factura.estructurar.failed', res);
      }
      return res;
    });
  }

  onInterpretarRequest(e) {
    return this._atender(e, 'interpretar', 'contabilidad.factura.interpretar.response', async (d) => {
      const res = this._interpretarEstructurado(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.factura_interpretada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.factura.interpretar.failed', res);
      }
      return res;
    });
  }

  onRegistrarFormatoRequest(e) {
    return this._atender(e, 'registrar_formato', 'contabilidad.factura.registrar_formato.response', async (d) => {
      const res = this._registrarFormato(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.factura.registrar_formato.failed', res);
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  _formatoDe(input) {
    const f = String((input && (input.formato || input.estructura)) || FORMATO_DEFECTO).toUpperCase();
    return f;
  }

  _formatoConocido(formato) {
    return this._formatos.has(formato) || FORMATOS_BASE.has(formato);
  }

  _desgloseDe(factura) {
    if (factura && factura.desglose && Array.isArray(factura.desglose.lineas)) return factura.desglose;
    const lineas = Array.isArray(factura && factura.lineas) ? factura.lineas : [];
    const d = lineas.map((l) => {
      const base = Number(l && (l.base ?? l.importe ?? l.precio)) || 0;
      const tipo = Number(l && (l.tipo_impuesto ?? l.tipo_iva ?? l.tipo)) || 0;
      const cuota = this._round(base * tipo / 100, 2);
      return { concepto: (l && (l.concepto || l.descripcion)) || null, base: this._round(base, 2), tipo, cuota, total: this._round(base + cuota, 2) };
    });
    const sumaBases = this._round(d.reduce((s, x) => s + x.base, 0), 2);
    const sumaCuotas = this._round(d.reduce((s, x) => s + x.cuota, 0), 2);
    return { lineas: d, suma_bases: sumaBases, suma_cuotas: sumaCuotas, total: this._round(sumaBases + sumaCuotas, 2) };
  }

  // emitirEstructurada(factura) -> DocumentoEstructurado (D9: una sola frontera de cruce).
  _emitirEstructurada(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const factura = (input && (input.factura || input.objeto)) || null;
    if (!factura || typeof factura !== 'object') return this._invalid('factura');

    const formato = this._formatoDe(input);
    if (!this._formatoConocido(formato)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `no hay adaptador de formato ${formato}: la forma se DECLARA, no se fuerza`, {
          formato, accion: 'REGISTRAR_FORMATO', invariante: 'puerto_abierto_se_crea'
        });
    }

    const desglose = this._desgloseDe(factura);
    if (desglose.lineas.length === 0 && !Number.isFinite(Number(factura.total))) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'la factura no trae lineas ni total: no hay documento estructurado que emitir', { formato });
    }

    const documento = {
      formato,
      version: formato === 'FACTURAE' ? VERSION_FACTURAE : (this._formatos.get(formato) || {}).version || '1.0',
      estructura: 'FACTURA_ELECTRONICA',
      emisor: {
        nif: factura.nif_emisor || factura.nif || null,
        nombre: factura.emisor || factura.razon_social || null
      },
      receptor: {
        nif: factura.nif_receptor || factura.cliente_nif || (factura.cliente && factura.cliente.nif) || null,
        nombre: factura.cliente || (factura.cliente && factura.cliente.nombre) || null
      },
      factura: {
        id_factura: factura.id_factura || null,
        serie: factura.serie || null,
        numero: factura.numero || null,
        fecha_emision: factura.fecha_emision || factura.fecha || null,
        clave_natural: factura.clave_natural || null
      },
      lineas: desglose.lineas,
      totales: {
        suma_bases: desglose.suma_bases,
        suma_cuotas: desglose.suma_cuotas,
        total: desglose.total
      },
      formateado_por: 'factura-electronica (D9)',
      generado_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        documento,
        formato,
        un_solo_cruce: true,
        nota: 'frontera unica del FORMATO estructurado: el conversor TRADUCE forma; no emite (O1) ni registra (D8)'
      }
    };
  }

  // interpretarEstructurado(documento) -> Factura (D9: entra SIN extraccion, no pasa por A4.1).
  _interpretarEstructurado(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const documento = (input && (input.documento || input.estructurado || input.objeto)) || null;
    if (!documento || typeof documento !== 'object') return this._invalid('documento');

    const formato = String(documento.formato || (input && input.formato) || '').toUpperCase();
    if (formato && !this._formatoConocido(formato)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `no hay adaptador de formato ${formato} para interpretar el documento`, {
          formato, accion: 'REGISTRAR_FORMATO'
        });
    }

    const lineas = Array.isArray(documento.lineas) ? documento.lineas.map((l) => ({
      concepto: (l && (l.concepto || l.descripcion)) || null,
      base: this._round(Number(l && (l.base ?? l.importe)) || 0, 2),
      tipo: Number(l && (l.tipo ?? l.tipo_impuesto)) || 0,
      cuota: this._round(Number(l && l.cuota) || 0, 2)
    })) : [];

    const factura = {
      id_factura: (documento.factura && documento.factura.id_factura) || documento.id_factura || null,
      serie: (documento.factura && documento.factura.serie) || documento.serie || null,
      numero: (documento.factura && documento.factura.numero) || documento.numero || null,
      fecha_emision: (documento.factura && documento.factura.fecha_emision) || documento.fecha || null,
      clave_natural: (documento.factura && documento.factura.clave_natural) || null,
      nif: (documento.emisor && documento.emisor.nif) || documento.nif || null,
      emisor_nombre: (documento.emisor && documento.emisor.nombre) || null,
      receptor_nif: (documento.receptor && documento.receptor.nif) || null,
      receptor_nombre: (documento.receptor && documento.receptor.nombre) || null,
      lineas,
      total: (documento.totales && documento.totales.total) !== undefined
        ? this._round(Number(documento.totales.total) || 0, 2)
        : this._round(lineas.reduce((s, l) => s + (l.base + l.cuota), 0), 2),
      origen: 'DOCUMENTO_ESTRUCTURADO'
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        factura,
        formato: formato || null,
        sin_extraccion: true,
        no_pasa_por_A4_1: true,
        determinista: true,
        nota: 'un documento estructurado entra SIN extraccion (no pasa por A4.1): el formato ya trae la forma'
      }
    };
  }

  // registrarFormato(formato) — catalogo DECLARABLE; si falta una forma, SE CREA.
  _registrarFormato(input) {
    const formato = String((input && (input.formato || input.estructura)) || '').toUpperCase();
    if (!formato) return this._invalid('formato');

    const estado = {
      formato,
      version: (input && input.version) || null,
      declarado_por: String((input && input.rol) || 'DUENO').toUpperCase(),
      registrado_en: new Date().toISOString()
    };
    this._formatos.set(formato, estado);
    this.logger?.info(`${this.name}.formato_registrado`, { formato });

    return {
      status: 200,
      data: { project_id: (input && input.project_id) || null, formato, estado, creado: true, formato_defecto: FORMATO_DEFECTO }
    };
  }

  // ── Tools ──
  toolEmitirEstructurada(params) { return this._emitirEstructurada(params); }
  toolInterpretarEstructurado(params) { return this._interpretarEstructurado(params); }
  toolRegistrarFormato(params) { return this._registrarFormato(params); }
}

module.exports = FacturaElectronica;
