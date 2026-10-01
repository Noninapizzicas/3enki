/**
 * contabilidad-analitica/frontera-ficha-producto — CONVERSOR STATELESS (H2, hoja del plan).
 *
 * LA UNICA PUERTA ficha-de-producto → DATO CONTABLE. El diseno lo dice literal:
 * `entrar(ficha):CosteInterno`, con `forma:ParametroDeclarable`.
 *
 * CRUZA EL FORMATO, NO DECIDE EL CONTENIDO NI LA VALORACION: por aqui entra la ficha de producto
 * del negocio (la de su vertical/proveedor) y sale con la FORMA INTERNA del coste contable. El
 * modulo NO valora el producto, NO calcula margenes, NO decide el coste — TRANSPORTA lo que la
 * ficha declara, con la forma que el negocio DECLARA (`forma`: por campo interno, su ruta en la
 * ficha + requeridos). Sin `forma` declarada, la regla es identidad por nombre interno y se
 * declara asi (`forma_declarada:false`) — jamas se cablea una forma de ficha.
 *
 * Invariante: dato ausente = desconocido. El campo que no llega ni se declara queda `null` y se
 * lista en `faltantes` ([ABIERTO], nada se estima). Los importes se COPIAN si vienen; no se
 * derivan del precio ni de ningun margen.
 *
 * Es el PUERTO DECLARABLE del coste de cada negocio: si falta, se CREA la frontera para el
 * (`puerto.frontera` declara su nombre); el mismo modulo sirve a todos los negocios sin conocer
 * ninguno de memoria.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja H2 del plan-construccion y diseno-oop.md (CLASE FronteraFichaProducto).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// La FORMA INTERNA del coste contable: los NOMBRES internos (no valores, no reglas legales).
// Su origen en la ficha es DECLARABLE (regla `forma`); sin regla, identidad por nombre interno.
const CAMPOS_COSTE = [
  'clave_natural', 'producto', 'referencia', 'unidad',
  'coste_unitario', 'cantidad', 'coste_total', 'moneda',
  'proveedor', 'fecha', 'vertical', 'atributos'
];

class FronteraFichaProducto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'frontera-ficha-producto';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'frontera-ficha-producto.entrar.response', async (d) => {
      const res = this._entrar(d);
      // Conversor puro: no valora, no decide, no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('frontera-ficha-producto.entrar.failed', res);
      return res;
    });
  }

  // ── proyeccion: entrar(ficha) → CosteInterno (cruza formato; no valora ni decide) ──
  _entrar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    const ficha = input.ficha != null ? input.ficha
      : (input.producto != null && typeof input.producto === 'object' ? input.producto
        : (input.crudo != null ? input.crudo : null));
    if (!ficha || typeof ficha !== 'object') return this._invalid('ficha');

    // La ficha puede venir envuelta por la vertical ({vertical, tipo, payload}) o plana.
    const origen_ficha = ficha.payload && typeof ficha.payload === 'object' ? ficha.payload : ficha;
    const vertical = ficha.vertical != null ? String(ficha.vertical)
      : (input.vertical != null ? String(input.vertical) : null);

    // LA FORMA ES DECLARABLE: {campos:{interno: ruta}, requeridos:[...], clave_natural: ruta}
    const forma = input.forma || ficha.forma || null;
    const forma_declarada = Boolean(forma && typeof forma === 'object');
    const mapa = forma_declarada && forma.campos && typeof forma.campos === 'object' ? forma.campos : {};
    const requeridos = forma_declarada && Array.isArray(forma.requeridos) ? forma.requeridos.map(String) : [];

    const coste = {};
    const faltantes = [];
    for (const campo of CAMPOS_COSTE) {
      // Ruta declarada (soporta 'a.b') o identidad por nombre interno (forma por defecto).
      const ruta = mapa[campo] != null ? String(mapa[campo]) : campo;
      const val = this._leerRuta(origen_ficha, ruta);
      if (val === undefined || val === null || val === '') {
        coste[campo] = null;
        faltantes.push(campo);            // [ABIERTO] — no se estima
      } else if (this._esImporte(campo)) {
        // LOS IMPORTES SE COPIAN: no se derivan del precio ni de ningun margen (no es su trabajo).
        const n = this._num(val);
        coste[campo] = n;
        if (n === null) faltantes.push(campo);
      } else {
        coste[campo] = val;
      }
    }

    // La vertical: del sobre o de la ficha; resuelta sale de faltantes.
    coste.vertical = vertical || coste.vertical;
    if (coste.vertical && faltantes.includes('vertical')) faltantes.splice(faltantes.indexOf('vertical'), 1);
    if (!coste.vertical) faltantes.push('vertical');

    // La clave natural: declarada en la peticion/la ficha/la regla, o derivada del molde. NO se inventa identidad.
    coste.clave_natural = input.clave_natural != null ? String(input.clave_natural)
      : (coste.clave_natural != null ? String(coste.clave_natural) : null);
    if (coste.clave_natural === null && forma_declarada && forma.clave_natural) {
      const v = this._leerRuta(origen_ficha, String(forma.clave_natural));
      if (v != null && v !== '') coste.clave_natural = String(v);
    }
    if (coste.clave_natural === null) coste.clave_natural = this._clave(coste, vertical);
    if (coste.clave_natural !== null && faltantes.includes('clave_natural')) {
      faltantes.splice(faltantes.indexOf('clave_natural'), 1);
    }
    if (coste.clave_natural === null) faltantes.push('clave_natural');

    // La ficha tambien puede traer campos extra: se conservan bajo `atributos` (no se pierde nada).
    const conocidos = new Set(CAMPOS_COSTE);
    if (!coste.atributos || typeof coste.atributos !== 'object') {
      const extra = {};
      for (const [k, v] of Object.entries(origen_ficha)) if (!conocidos.has(k)) extra[k] = v;
      if (Object.keys(extra).length > 0) coste.atributos = extra;
    }

    // Requeridos declarados que falten → la conversion no es utilizable (se declara, no se completa).
    const requeridos_faltantes = requeridos.filter((c) => coste[c] === undefined || coste[c] === null || coste[c] === '');

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        origen_ficha: vertical != null ? 'ficha' : 'plana',
        // LA FRONTERA ES DECLARABLE: si el negocio no tiene puerto, se CREA para el (no se conoce de memoria).
        puerto: {
          frontera: input.puerto != null ? String(input.puerto) : (vertical != null ? `frontera:${vertical}` : 'frontera:ficha-producto'),
          creado: input.puerto == null,
          declarable: true
        },
        coste: {
          ...coste,
          // La forma interna: el coste queda listo para el dato contable (no valorado, no decidido).
          forma_interna: true,
          valorado_aqui: false,
          calculado_aqui: false,
          faltantes
        },
        forma_declarada,
        requeridos_faltantes,
        // Cruza el FORMATO; no decide el contenido ni la valoracion.
        decide: false,
        valora: false,
        cruza_formato: true,
        faltantes,
        abierto: faltantes.length > 0
      }
    };
  }

  _esImporte(campo) {
    return campo === 'coste_unitario' || campo === 'coste_total' || campo === 'cantidad';
  }

  _leerRuta(obj, ruta) {
    if (!obj || !ruta) return undefined;
    return String(ruta).split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
  }

  _clave(coste, vertical) {
    const partes = [coste.referencia !== null ? coste.referencia : null,
      coste.producto !== null ? coste.producto : null,
      vertical !== null ? vertical : null].filter((v) => v !== null && v !== undefined && v !== '');
    if (partes.length === 0) return null;
    return partes.map(String).join('|');
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = FronteraFichaProducto;
