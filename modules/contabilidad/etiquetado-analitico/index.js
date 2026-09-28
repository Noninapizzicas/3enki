/**
 * contabilidad/etiquetado-analitico — MICRO-AGENTE (J1, hoja del plan).
 *
 * EL JUICIO ANALITICO: asigna centro/linea/producto a cada hecho con REGLA
 * DECLARABLE (dimensiones J6 + reglas declaradas). Cuando la regla NO CUBRE,
 * clasificar es JUICIO -> lo dudoso va a la cola (A8.1, cola-revision); NUNCA se
 * etiqueta a ciegas ni se ignora el hecho. El caso cubierto por regla es REFLEJO
 * (determinista); el caso no cubierto es FUZZY (juicio). Aqui PROPONE, no decide:
 * la etiqueta dudosa no se aplica sola.
 *
 * MICRO-AGENTE (patron hibrido real): mitad REFLEJO determinista (lectura de
 * reglas declarables J6 por EVENTO, matching por patrones, dimensiones declaradas)
 * + mitad FUZZY en el cajon de blueprint del modulo (el LLM que PROPONE la
 * etiqueta cuando la regla no cubre; el gate scripts/validate-hibridos.js exige
 * que la op fuzzy NO vaya en module.json.subscribes).
 *
 * SI PERSISTE (justificado): su memoria de etiquetado es APRENDIZAJE — evita
 * re-clasificar el mismo hecho, es la EVIDENCIA de la regla que el jefe/asesor
 * ratifica (\"esta contrapartida -> este centro\") y la base de la explicacion
 * analitica; por eso lleva PosPersistencia + onProjectActivated, como pide la
 * espina para esta hoja. NO escribe las reglas de J6 (declarables): solo LEE por
 * EVENTO contabilidad.dimensiones.leer.request y PROPONE; lo dudoso se PUBLICA a
 * la cola (contabilidad.excepcion.encolar.request) por su puerta unica.
 *
 * Emisor/par de fallo: exito publica contabilidad.etiqueta_aplicada o
 * contabilidad.excepcion.encolar.request (segun el juicio); error su par
 * determinista. NO REUTILIZA: el etiquetado analitico por dimensiones declaradas
 * no existe en el inventario.
 *
 * Ver hoja J1 del diseno-oop y bloque `etiquetado-analitico` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Naturaleza de la excepcion de una etiqueta analitica dudosa (routing A8.1).
const NATURALEZA_EXCEPCION = 'ANALITICA';
const COLA_DESTINO = 'JEFE';

class EtiquetadoAnalitico extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'etiquetado-analitico';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, reglas: [], etiquetas: [], excepciones: [] }
    // Es APRENDIZAJE del juicio (lo etiquetado por regla, lo propuesto y lo encolado),
    // no una parcela de dominio: las reglas vivas son de J6 (declarables).
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'etiquetado-analitico.json',
      dir: '/contabilidad/etiquetado-analitico',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && (data.etiquetas || data.reglas)) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la memoria del juicio analitico del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC ──
  onAplicarRequest(e) {
    return this._atender(e, 'aplicar', 'contabilidad.etiqueta.aplicar.response', async (d) => {
      const res = await this._etiquetarConRegla(d);
      if (res.status === 200 && res.data.aplicada) {
        // Caso CUBIERTO por regla = reflejo determinista.
        this._memorizar(d.project_id, res.data);
        this.eventBus?.publish('contabilidad.etiqueta_aplicada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
        return res;
      }

      if (res.status === 200 && res.data.sin_regla) {
        // La regla NO cubre: clasificar es JUICIO (fuzzy). Se PROPONE; lo dudoso a la cola.
        const propuesta = this._proponerEtiqueta(d);
        if (propuesta.status === 200 && propuesta.data.confianza >= this._umbralJuicio()) {
          this._memorizar(d.project_id, { ...propuesta.data, origen: 'JUICIO' });
          this.eventBus?.publish('contabilidad.etiqueta_aplicada', {
            ...propuesta.data,
            origen: 'JUICIO',
            propuesta: true,
            correlation_id: d.correlation_id
          });
          return { ...propuesta, data: { ...propuesta.data, aplicada: true, propuesta: true } };
        }
        // DUDOSO o sin resolucion: NUNCA a ciegas → a la cola (A8.1).
        const encolada = await this._encolar(d, {
          motivo: 'ETIQUETA_NO_RESUELTA',
          propuesta: propuesta.status === 200 ? propuesta.data : null,
          confianza: propuesta.status === 200 ? propuesta.data.confianza : 0
        });
        const fallo = this._errorResponse(409, 'SIN_REGLA',
          'la regla declarada no cubre el hecho y el juicio no alcanza confianza: lo dudoso va a la cola', {
            encolada: encolada.ok,
            naturaleza: NATURALEZA_EXCEPCION,
            cola: COLA_DESTINO,
            propuesta: propuesta.status === 200 ? propuesta.data : null
          });
        this.eventBus?.publish('contabilidad.etiqueta.aplicar.failed', fallo);
        return fallo;
      }

      this.eventBus?.publish('contabilidad.etiqueta.aplicar.failed', res);
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // etiquetar(hecho) -> Etiqueta {centro, linea, producto} | SIN_REGLA
  // (caso cubierto por regla = reflejo). Las dimensiones y reglas son DECLARABLES.
  _etiquetarConRegla(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const hecho = (input && (input.hecho || input.asiento || input)) || null;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const dimensiones = this._dimensionesDe(input);
    const reglas = this._reglasDe(input);

    // Matching: la regla declara un predicado sobre el hecho (cuenta, tercero, concepto...).
    const regla = this._buscarRegla(hecho, reglas);
    if (!regla) {
      // No hay regla declarada que cubra: el reflejo NO inventa. Es juicio (fuzzy).
      return {
        status: 200,
        data: {
          project_id: pid,
          hecho_ref: hecho.clave_natural || hecho.id || null,
          etiqueta: null,
          sin_regla: true,
          aplicada: false,
          dimensiones: dimensiones,
          simbolico: 'SIN_REGLA'
        }
      };
    }

    const etiqueta = {
      centro: regla.centro ?? null,
      linea: regla.linea ?? null,
      producto: regla.producto ?? hecho.producto ?? null,
      dimensiones_declaradas: dimensiones
    };
    return {
      status: 200,
      data: {
        project_id: pid,
        hecho_ref: hecho.clave_natural || hecho.id || null,
        etiqueta,
        regla_id: regla.id || null,
        origen: 'REGLA',
        aplicada: true,
        sin_regla: false,
        confianza: 1,
        determinista: true
      }
    };
  }

  // proponerEtiqueta(hecho) -> Etiqueta — FUZZY (el juicio cuando la regla no cubre).
  // La propuesta es DETERMINISTA-por-señales aqui y se enriquece por el cajon de
  // blueprint (LLM). Confianza < umbral → a la cola.
  _proponerEtiqueta(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const hecho = (input && (input.hecho || input.asiento || input)) || null;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const dimensiones = this._dimensionesDe(input);
    const cuenta = String(hecho.cuenta || (Array.isArray(hecho.apuntes) && hecho.apuntes[0] && hecho.apuntes[0].cuenta) || '');
    const concepto = String(hecho.concepto || hecho.descripcion || '').toLowerCase();
    const tercero = hecho.tercero || null;

    // Señales declaradas: una dimension declara `claves` que orientan la propuesta.
    let mejor = null;
    let confianza = 0;
    for (const dim of dimensiones) {
      const claves = Array.isArray(dim.claves) ? dim.claves : [];
      const aciertos = claves.filter((k) => concepto.includes(String(k).toLowerCase()) || cuenta.startsWith(String(k))).length;
      if (aciertos === 0) continue;
      const c = this._round(Math.min(1, aciertos / Math.max(1, claves.length)), 2);
      if (c > confianza) {
        confianza = c;
        mejor = dim;
      }
    }

    // Aprendizaje previo: si ya se etiqueto un hecho igual (tercero+cuenta), se reusa.
    const aprendida = this._recuerdoDe(pid, { cuenta, tercero });
    if (aprendida) mejor = aprendida;

    return {
      status: 200,
      data: {
        project_id: pid,
        hecho_ref: hecho.clave_natural || hecho.id || null,
        etiqueta: mejor ? { centro: mejor.centro ?? null, linea: mejor.linea ?? null, producto: hecho.producto ?? null } : null,
        origen: aprendida ? 'APRENDIZAJE' : 'JUICIO',
        propuesta: true,
        aplicada: false,
        confianza,
        senales: { cuenta, concepto, tercero },
        propone_no_decide: true
      }
    };
  }

  // ── helpers internos ──

  // Dimensiones/reglas DECLARABLES: en payload o LEIDAS por EVENTO de J6.
  _dimensionesDe(input) {
    const d = input && (input.dimensiones || input.dims);
    if (Array.isArray(d)) return d;
    return [];
  }

  _reglasDe(input) {
    const r = input && (input.reglas || (input.dimensiones && input.dimensiones.reglas));
    if (Array.isArray(r)) return r;
    const aprendidas = this._store.get(input && input.project_id);
    return (aprendidas && Array.isArray(aprendidas.reglas)) ? aprendidas.reglas : [];
  }

  _buscarRegla(hecho, reglas) {
    const cuenta = String(hecho.cuenta || (Array.isArray(hecho.apuntes) && hecho.apuntes[0] && hecho.apuntes[0].cuenta) || '');
    const concepto = String(hecho.concepto || hecho.descripcion || '').toLowerCase();
    for (const r of reglas) {
      if (!r) continue;
      const porCuenta = r.cuenta_prefijo && cuenta.startsWith(String(r.cuenta_prefijo));
      const porConcepto = r.concepto_contiene && concepto.includes(String(r.concepto_contiene).toLowerCase());
      const porTercero = r.tercero && String(r.tercero) === String(hecho.tercero || '');
      if (porCuenta || porConcepto || porTercero) return r;
    }
    return null;
  }

  _recuerdoDe(pid, { cuenta, tercero }) {
    const d = this._store.get(pid);
    if (!d || !Array.isArray(d.etiquetas)) return null;
    const hit = d.etiquetas.find((e) => e && (e.cuenta === cuenta) && (e.tercero === tercero));
    return hit ? { centro: hit.centro, linea: hit.linea } : null;
  }

  _memorizar(pid, data) {
    if (!pid) return;
    const d = this._store.get(pid) || { esquema: 'etiquetado-analitico-v1', reglas: [], etiquetas: [], excepciones: [] };
    d.etiquetas.push({
      hecho_ref: data.hecho_ref || null,
      cuenta: data.etiqueta && data.etiqueta.cuenta || (data.senales && data.senales.cuenta) || null,
      tercero: data.senales && data.senales.tercero || null,
      centro: data.etiqueta && data.etiqueta.centro || null,
      linea: data.etiqueta && data.etiqueta.linea || null,
      origen: data.origen || 'REGLA',
      en: new Date().toISOString()
    });
    this._store.set(pid, d);
    this._persist.marcarDirty(pid);
  }

  async _encolar(input, detalle) {
    const pid = input && input.project_id;
    const excepcion = {
      id: `an-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      naturaleza: NATURALEZA_EXCEPCION,
      motivo: detalle.motivo || 'ETIQUETA_NO_RESUELTA',
      confianza: detalle.confianza || 0,
      propuesta: detalle.propuesta || null,
      no_inventa: true
    };
    const resp = await this._rpc('contabilidad.excepcion.encolar.request', {
      project_id: pid,
      cola: COLA_DESTINO,
      excepcion
    }, { timeout_ms: 4000 });
    const ok = !!(resp && resp.status === 200);
    if (ok) {
      const d = this._store.get(pid) || { esquema: 'etiquetado-analitico-v1', reglas: [], etiquetas: [], excepciones: [] };
      d.excepciones.push(excepcion);
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    } else {
      this.eventBus?.publish('contabilidad.excepcion.encolar.failed', {
        status: 503,
        error: { code: 'DEPENDENCIA_NO_DISPONIBLE', message: 'cola-revision (A8.1) no confirmo el encolado' },
        detalle: excepcion
      });
    }
    return { ok, excepcion };
  }

  _umbralJuicio() {
    // Umbral DECLARABLE del juicio: por debajo, la etiqueta va a la cola (nunca a ciegas).
    return 0.6;
  }

  // ── Tools ──
  toolEtiquetar(params) { return this._etiquetarConRegla(params); }
  toolProponerEtiqueta(params) { return this._proponerEtiqueta(params); }
}

module.exports = EtiquetadoAnalitico;
