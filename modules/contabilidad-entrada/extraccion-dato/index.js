/**
 * contabilidad-entrada/extraccion-dato — MICRO-AGENTE (A4.1, hoja del plan).
 *
 * Abre un documento NO estructurado y lo vuelve DATO. Interpreta y PROPONE; NO asienta.
 * El JUICIO (leer un PDF/foto, entender un formato raro) es la mitad FUZZY del hibrido y vive en
 * su blueprint. Esta mitad REFLEJA es la parte DETERMINISTA y HONESTA: extrae los campos con el
 * ESQUEMA y los PATRONES **DECLARADOS** por el sitio — un campo que no casa con ningun patron
 * declarado NO se inventa: se declara en `abierto` (es juicio fuzzy, no extraccion).
 *
 *   · la propuesta (los campos extraidos) se SUBE por EVENTO a control-cuadre-documento.cuadra.request
 *     (A5) para que el documento se cuadre, y el dato bruto queda PROPUESTO (no se asienta: el
 *     asiento es de escritor-diario B2).
 *   · si el documento queda INCOMPLETO/ambiguo, se SUBE best-effort encolado-excepcion.encolar.request
 *     (A8.1) para que lo dudoso espere (flujo_continua).
 *
 * ADAPTA `facturas` (su pipeline real de OCR/IA existe): aqui se toma su salida como documento
 * declarado y se adapta al contrato contabilidad.* sin romper su proyecto.
 *
 * NO escribe, NO persiste (su extraccion es una PROPUESTA en la respuesta). RPC juzgar es CLASE
 * PREGUNTA → sin ui_handler. Publica extraccion-dato.juzgar.response y su par .failed.
 * Ver hoja A4.1 del plan-construccion y diseno-oop.md (CLASE ExtraccionDato).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ExtraccionDato extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'extraccion-dato';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'extraccion-dato.juzgar.response', async (d) => {
      const res = this._juzgar(d);
      // Micro-agente (mitad refleja): PROPONE; no asienta → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) {
        this.eventBus?.publish('extraccion-dato.juzgar.failed', res);
        return res;
      }
      // SUBE (best-effort) el documento a cuadre (A5) y lo dudoso a cola (A8.1) SOLO si procede.
      const pid = res.data.project_id;
      if (res.data.propuesta) {
        this.eventBus?.publish('control-cuadre-documento.cuadra.request', {
          project_id: pid, documento: res.data.documento, extraido: res.data.extraido,
          correlation_id: d.correlation_id
        });
      }
      if (res.data.encolar === true) {
        this.eventBus?.publish('encolado-excepcion.encolar.request', {
          project_id: pid, rol: 'ENCOLADO_EXCEPCION',
          clave: res.data.clave_excepcion, motivo: 'documento incompleto/ambiguo',
          origen: 'extraccion-dato', payload: res.data.extraido,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // juzgar(documento, esquema) → { extraido, propuesta, abierto }
  // ══════════════════════════════════════════════════════════════════════
  _juzgar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El DOCUMENTO no estructurado: viene declarado (la salida de `facturas` u OCR).
    const documento = this._documento(input);
    if (!documento) return this._invalid('documento');

    // El ESQUEMA de extraccion es DECLARABLE (campo → patron/path). No se cablea ningun formato.
    const esquema = this._esquema(input);
    const campos = Object.keys(esquema);

    const extraido = {};
    const faltantes = [];
    for (const campo of campos) {
      const regla = esquema[campo];
      const valor = this._extraer(documento, regla);
      if (valor === null || valor === undefined) { faltantes.push(campo); extraido[campo] = null; }
      else extraido[campo] = valor;
    }

    // Sin esquema declarado NO se extrae a ojo: es juicio fuzzy, se declara.
    const sinEsquema = campos.length === 0;
    // La propuesta es valida solo si hay esquema y no faltan campos obligatorios declarados.
    const obligatorios = Array.isArray(input.obligatorios) ? input.obligatorios : campos;
    const faltanObligatorios = faltantes.filter((c) => obligatorios.includes(c));
    const propuesta = !sinEsquema && faltanObligatorios.length === 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'extraccion-dato',
        documento: this._refDocumento(documento),
        campos: campos,
        extraido,
        faltantes,
        propuesta,
        // El dato queda PROPUESTO, no asentado (el asiento es de escritor-diario B2).
        asienta: false,
        // Si el documento queda incompleto/ambiguo se encola best-effort (no bloquea).
        encolar: Boolean(sinEsquema || faltanObligatorios.length > 0),
        clave_excepcion: this._clave(documento, input),
        determinista: true,
        abierto: {
          esquema: sinEsquema
            ? 'no se declaro esquema de extraccion (campo → patron): interpretar libremente es juicio (mitad fuzzy)'
            : null,
          campos: faltanObligatorios.length
            ? `${faltanObligatorios.length} campo(s) obligatorio(s) sin extraer: la propuesta no se completa (no se inventa el valor)`
            : null
        }
      }
    };
  }

  _documento(input) {
    if (input.documento && typeof input.documento === 'object') return input.documento;
    if (input.texto != null || input.contenido != null) return { texto: input.texto != null ? input.texto : input.contenido };
    return null;
  }

  // El referente del documento (id/ruta) para la respuesta y la clave: no el contenido entero.
  _refDocumento(doc) {
    return {
      id: doc.id != null ? String(doc.id) : null,
      ruta: doc.ruta != null ? String(doc.ruta) : (doc.path != null ? String(doc.path) : null),
      tipo: doc.tipo != null ? String(doc.tipo) : null
    };
  }

  _esquema(input) {
    const e = (input.esquema && typeof input.esquema === 'object') ? input.esquema
      : ((input.mapeo && typeof input.mapeo === 'object') ? input.mapeo : {});
    return e && typeof e === 'object' ? e : {};
  }

  // Extrae un campo segun su regla DECLARADA: {path} (ruta en el documento) o {regex} sobre el texto.
  _extraer(documento, regla) {
    if (regla === null || regla === undefined) return null;
    // Regla simple: el nombre del campo es una ruta directa.
    if (typeof regla === 'string') return this._porRuta(documento, regla);
    if (typeof regla !== 'object') return null;
    if (regla.path != null) {
      const v = this._porRuta(documento, regla.path);
      if (v !== undefined && v !== null) return v;
    }
    if (regla.regex != null || regla.patron != null) {
      const fuente = documento.texto != null ? String(documento.texto) : (documento.contenido != null ? String(documento.contenido) : '');
      const rx = new RegExp(String(regla.regex != null ? regla.regex : regla.patron), regla.flags != null ? String(regla.flags) : '');
      const m = fuente.match(rx);
      if (m) return m[1] != null ? m[1] : m[0];
    }
    return null;
  }

  _porRuta(obj, ruta) {
    if (!obj || typeof obj !== 'object') return null;
    let cur = obj;
    for (const parte of String(ruta).split('.')) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return null;
      cur = cur[parte];
    }
    return cur === undefined ? null : cur;
  }

  _clave(documento, input) {
    if (input.clave != null) return String(input.clave);
    if (documento.id != null) return `doc:${documento.id}`;
    if (documento.ruta != null || documento.path != null) return `doc:${documento.ruta != null ? documento.ruta : documento.path}`;
    return `doc:${Date.now()}`;
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = ExtraccionDato;
