/**
 * contabilidad-entrada/normalizador-hecho — CONVERSOR (A2, hoja del plan).
 *
 * ÚNICA PUERTA DE FORMATO: homogeneiza el hecho de cada vertical a FORMA ASENTABLE.
 * Homogeneiza la FORMA (fechas a ISO, moneda a mayúsculas, texto recortado, mapeo declarado),
 * NO decide CONTENIDO: no calcula importes, no elige contrapartida (eso es de otros). Cruza forma.
 *
 * Invariantes:
 *  - "Forma asentable" DECLARABLE: el `mapeo` (campo canónico → clave del crudo) entra como DATO.
 *    Si no hay mapeo y el crudo no trae las claves canónicas, la forma no se fabrica: se declara ABIERTO.
 *  - Dato ausente = desconocido: un campo canónico que no viene queda `null` y se declara en `abierto`.
 *    JAMÁS se estima ni se completa.
 *  - Conversor puro: no escribe → no hay hecho que anunciar (R2). Su cara es el bus (entrar.response).
 *
 * R3 · ESCUCHA (la deriva que se EVITA): el plan declara escucha de `contabilidad.hecho_recibido`
 * (EMITIDO por puerto-evento-vertical) y `contabilidad.documento_recibido` (emitido por
 * puerto-documento-digital A4, que AÚN NO EXISTE en el repo). Se declara SOLO hecho_recibido;
 * documento_recibido NO (daría cadena colgada). Se cableará cuando su emisor exista.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
 * Ver hoja A2 del plan-construccion y diseno-oop.md (CLASE NormalizadorHecho).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// La FORMA ASENTABLE canónica: los campos que un hecho necesita para poder asentarse.
// Es el contrato de formato del dominio; lo que NO venga queda null y se declara en `abierto`.
const CAMPOS_ASENTABLE = ['fecha', 'fecha_valor', 'concepto', 'importe', 'moneda', 'cuenta', 'contrapartida', 'origen', 'vertical', 'referencia'];

// Claves del crudo que reconocemos como variantes mecánicas de un campo canónico (mapa por defecto).
const ALIAS = {
  fecha: ['fecha', 'date', 'fecha_operacion', 'fecha_factura'],
  fecha_valor: ['fecha_valor', 'value_date'],
  concepto: ['concepto', 'descripcion', 'desc', 'concept', 'detalle'],
  importe: ['importe', 'amount', 'total', 'cuantia'],
  moneda: ['moneda', 'currency', 'divisa'],
  cuenta: ['cuenta', 'cuenta_bancaria', 'iban'],
  contrapartida: ['contrapartida', 'contra_cuenta'],
  origen: ['origen', 'source'],
  vertical: ['vertical'],
  referencia: ['referencia', 'ref', 'numero', 'documento', 'documento_id']
};

function esFecha(v) {
  if (v == null || v === '') return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

class NormalizadorHecho extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'normalizador-hecho';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'normalizador-hecho.entrar.response', async (d) => {
      const res = this._entrar(d);
      // Conversor puro: no escribe → no hay hecho que anunciar (R2). Su cara es el bus.
      if (res.status !== 200) this.eventBus?.publish('normalizador-hecho.entrar.failed', res);
      else if (res.data && res.data.forma_declarada === false) {
        this._subirPeticionCriterio(res.data.project_id, res.data.vertical);
      }
      return res;
    });
  }

  // ── handler de dominio: al recibir un hecho crudo admitido, lo normaliza (misma lógica). ──
  // No publica hecho de dominio (el conversor no escribe): solo homogeneiza y, si falta el
  // mapeo/forma declarada, deja la petición al JEFE en la cola (best-effort, sin suplantar).
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    const res = this._entrar({
      project_id: d.project_id,
      hecho: d.hecho || d.documento,
      vertical: d.vertical,
      mapeo: d.mapeo
    });
    if (res.status === 200 && res.data && res.data.forma_declarada === false) {
      this._subirPeticionCriterio(res.data.project_id, res.data.vertical);
    }
    return res;
  }

  // ══════════════════════════════════════════════════════════════════════
  // entrar(crudo) → hecho en forma asentable (homogeneizado, sin decidir contenido)
  // ══════════════════════════════════════════════════════════════════════
  _entrar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    const crudo = input.hecho !== undefined ? input.hecho
      : (input.documento !== undefined ? input.documento : input.d);
    if (!crudo || typeof crudo !== 'object') return this._invalid('hecho');

    // El mapeo (campo canónico → clave del crudo) es DECLARABLE; sin él se usa el mapa por defecto (alias).
    const mapeo = (input.mapeo && typeof input.mapeo === 'object') ? input.mapeo : null;

    const forma = {};
    const faltantes = [];
    for (const campo of CAMPOS_ASENTABLE) {
      const clave = this._clave(campo, crudo, mapeo);
      const raw = clave != null ? crudo[clave] : undefined;
      if (raw === undefined || raw === null || raw === '') {
        forma[campo] = null;             // ausente = desconocido — NO se estima
        faltantes.push(campo);
      } else {
        forma[campo] = this._normCampo(campo, raw);
      }
    }

    // Lo que no es canónico se conserva bajo `metadatos` (no se pierde nada del crudo).
    const conocidas = new Set();
    for (const campo of CAMPOS_ASENTABLE) {
      const clave = this._clave(campo, crudo, mapeo);
      if (clave != null) conocidas.add(clave);
    }
    const metadatos = {};
    for (const [k, v] of Object.entries(crudo)) if (!conocidas.has(k)) metadatos[k] = v;
    forma.metadatos = metadatos;

    const vertical = input.vertical != null ? String(input.vertical)
      : (forma.vertical != null ? forma.vertical : (crudo.vertical != null ? String(crudo.vertical) : null));

    // "Forma declarada" = se declaró un mapeo, o el crudo traía al menos una clave canónica reconocida.
    const reconocidas = [...conocidas].filter((k) => crudo[k] !== undefined && crudo[k] !== null && crudo[k] !== '');
    const forma_declarada = Boolean(mapeo) || reconocidas.length > 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        forma_asentable: forma,
        // Cruza FORMATO, no decide CONTENIDO: se declara que no se compuso nada.
        contenido_compuesto: false,
        mapeo_declarado: Boolean(mapeo),
        forma_declarada,
        faltantes,
        abierto: forma_declarada ? null : {
          forma: 'el crudo no trae claves canónicas ni se declaró `mapeo`: la forma asentable no se fabrica'
        }
      }
    };
  }

  // Resuelve la clave del crudo para un campo canónico (mapeo declarado > alias por defecto).
  _clave(campo, crudo, mapeo) {
    if (mapeo && mapeo[campo] != null) return String(mapeo[campo]);
    const alias = ALIAS[campo] || [campo];
    for (const a of alias) if (Object.prototype.hasOwnProperty.call(crudo, a)) return a;
    return null;
  }

  // Homogeneización MECÁNICA del valor (no decide negocio): fecha→ISO, moneda→mayúsculas, texto→trim.
  _normCampo(campo, raw) {
    if (campo === 'fecha' || campo === 'fecha_valor') {
      if (esFecha(raw)) return new Date(raw).toISOString();
      return String(raw).trim();               // no parseable: se conserva el literal (no se inventa fecha)
    }
    if (campo === 'moneda') return String(raw).trim().toUpperCase();
    if (typeof raw === 'object') return raw;
    return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : raw;
  }

  // Peticion best-effort a la cola declarativa cuando falta la forma declarada (sin suplantar al JEFE).
  _subirPeticionCriterio(pid, vertical) {
    try {
      if (pid) this._rpc('cola-declaraciones-criterio.fijar.request', {
        project_id: pid,
        clave: `forma_asentable:${vertical || 'desconocida'}`,
        origen: 'normalizador-hecho'
      }, { timeout_ms: 2000 });
    } catch (_) { /* best-effort */ }
  }

  // ── Tools ──
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = NormalizadorHecho;
