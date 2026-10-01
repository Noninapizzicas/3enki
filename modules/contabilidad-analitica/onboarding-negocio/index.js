/**
 * contabilidad-analitica/onboarding-negocio — CUSTODIO CON PERSISTENCIA (K1, hoja del plan).
 *
 * RECOGE los datos DECLARABLES del negocio nuevo: su plan, sus fuentes y sus parametros. UN escritor.
 * Es la puerta de alta: lo que el negocio declara al nacer queda guardado y se anuncia el hecho.
 *
 * La parcela aislada del negocio y el plan contable NO se reimplementan aqui:
 *  · SUBE a `aislamiento-negocio.parcela.request` (I4) por EVENTO — la parcela la crea su custodio.
 *  · SUBE a `catalogo-cuentas.buscar.request` (B1) por EVENTO — el plan declarado lo custodia B1.
 *
 *   · recoger — ORDEN: recoge/actualiza los datos declarables del negocio y anuncia el hecho.
 *   · leer    — PREGUNTA: devuelve lo declarado del negocio; lo que falte queda ABIERTO (no se estima).
 *
 * Invariantes:
 *  - Dato ausente = desconocido: un dato no declarado queda `null` y se declara en `abierto`
 *    (jamas se estima ni se completa). Un negocio sin plan declarado NO se inventa un plan.
 *  - No se borra: re-recoger APPENDEA al historial; el estado vigente es el ultimo declarado.
 *  - UN escritor por parcela (guard rol ONBOARDING_NEGOCIO; segundo escritor → 403).
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R3 · ESCUCHA: el plan NO declara escucha de dominio (—) y no se anade ninguna sin emisor.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja K1 del plan-construccion y diseno-oop.md (CLASE OnboardingNegocio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela de onboarding.
const ROL_ESCRITOR = 'ONBOARDING_NEGOCIO';

// Los datos DECLARABLES que recoge el onboarding (se declaran, no se estiman).
const CAMPOS_DECLARABLES = ['nombre', 'nif', 'plan', 'fuentes', 'parametros'];

class OnboardingNegocio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'onboarding-negocio';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, negocios: Map<negocio_id, NegocioDeclarado> }
    this._negocios = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'onboarding-negocio.json',
      dir: '/contabilidad/onboarding-negocio',
      snapshot: (pid) => {
        const n = this._negocios.get(pid);
        if (!n) return null;
        return { project_id: pid, esquema: n.esquema, negocios: [...n.negocios.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const negocios = new Map();
        for (const n of (data.negocios || [])) if (n && n.negocio_id != null) negocios.set(String(n.negocio_id), n);
        this._negocios.set(pid, { esquema: data.esquema || 'contabilidad-onboarding-negocio-v1', negocios });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los negocios declarados del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC ORDEN (ui_handler: el humano da de alta el negocio) ──
  onRecogerRequest(e) {
    return this._atender(e, 'recoger', 'onboarding-negocio.recoger.response', async (d) => {
      const res = await this._recoger(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: un negocio quedo registrado (sus datos declarables recogidos).
        this.eventBus?.publish('contabilidad.negocio_registrado', {
          project_id: res.data.project_id,
          negocio_id: res.data.negocio_id,
          negocio: res.data.negocio,
          registrado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('onboarding-negocio.recoger.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'onboarding-negocio.leer.response', async (d) => {
      const res = this._leer(d);
      // PREGUNTA: deriva; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('onboarding-negocio.leer.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // recoger(negocio_id, datos declarables) → alta/actualizacion (ORDEN)
  // ══════════════════════════════════════════════════════════════════════
  async _recoger(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor de la parcela (ONBOARDING_NEGOCIO) recoge los datos declarables del negocio',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const negocio_id = input.negocio_id != null ? String(input.negocio_id).trim()
      : (input.negocio != null && typeof input.negocio !== 'object' ? String(input.negocio).trim() : '');
    if (!negocio_id) return this._invalid('negocio_id');

    const ahora = new Date().toISOString();
    const store = this._obtenerOCrear(pid);
    const existente = store.negocios.get(negocio_id) || null;

    const negocio = existente || {
      negocio_id,
      nombre: null,
      nif: null,
      plan: null,
      fuentes: [],
      parametros: null,
      parcela: null,
      declarado_en: null,
      historial: []
    };

    // Se copian SOLO los datos DECLARADOS; lo ausente queda null (no se estima).
    const declarado = (input.datos && typeof input.datos === 'object') ? input.datos : input;
    for (const campo of CAMPOS_DECLARABLES) {
      if (declarado[campo] !== undefined && declarado[campo] !== null) negocio[campo] = declarado[campo];
    }
    negocio.declarado_en = ahora;
    negocio.historial = Array.isArray(negocio.historial) ? negocio.historial : [];
    negocio.historial.push({ nombre: negocio.nombre, nif: negocio.nif, plan: negocio.plan, fuentes: negocio.fuentes, en: ahora });

    // SUBE la creacion de la parcela a aislamiento-negocio (I4) por EVENTO — best-effort.
    const parcelaResp = await this._rpc('aislamiento-negocio.parcela.request', { project_id: pid, negocio_id });
    if (parcelaResp && parcelaResp.status === 200 && parcelaResp.data && parcelaResp.data.parcela) {
      negocio.parcela = parcelaResp.data.parcela;
    }

    // SUBE al plan declarado de catalogo-cuentas (B1) por EVENTO — best-effort (contraste).
    const planResp = negocio.plan != null
      ? await this._rpc('catalogo-cuentas.buscar.request', { project_id: pid, texto: String(negocio.plan) })
      : null;

    store.negocios.set(negocio_id, negocio);
    store.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio_id,
        negocio,
        registrado: true,
        total_negocios: store.negocios.size,
        parcela: negocio.parcela,
        plan_contrastado: Boolean(planResp && planResp.status === 200),
        abierto: {
          nombre: negocio.nombre ? null : 'no se declaro el nombre del negocio (se anota el hueco, no se inventa)',
          nif: negocio.nif ? null : 'no se declaro el NIF del negocio',
          plan: negocio.plan ? null : 'no se declaro el plan contable del negocio: el sistema pregunta, no lo asigna',
          fuentes: (Array.isArray(negocio.fuentes) && negocio.fuentes.length) ? null : 'no se declararon las fuentes de datos del negocio',
          parametros: negocio.parametros ? null : 'no se declararon los parametros del negocio'
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // leer(negocio_id) → lo declarado (PREGUNTA, no muta)
  // ══════════════════════════════════════════════════════════════════════
  _leer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const negocio_id = input.negocio_id != null ? String(input.negocio_id).trim() : '';
    if (!negocio_id) return this._invalid('negocio_id');

    const store = this._negocios.get(pid) || null;
    const negocio = store ? (store.negocios.get(negocio_id) || null) : null;

    if (!negocio) {
      return {
        status: 200,
        data: {
          project_id: pid,
          negocio_id,
          negocio: null,
          existe: false,
          abierto: { negocio: 'el negocio no esta declarado: el sistema pregunta, no lo inventa' }
        }
      };
    }

    const faltan = CAMPOS_DECLARABLES.filter((c) => {
      const v = negocio[c];
      return v === null || v === undefined || (Array.isArray(v) && v.length === 0);
    });

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio_id,
        negocio,
        existe: true,
        faltan,
        completo: faltan.length === 0,
        abierto: faltan.length ? { campos: faltan } : null
      }
    };
  }

  _obtenerOCrear(pid) {
    let n = this._negocios.get(pid);
    if (!n) {
      n = { esquema: 'contabilidad-onboarding-negocio-v1', negocios: new Map() };
      this._negocios.set(pid, n);
      this._persist.marcarDirty(pid);
    }
    return n;
  }

  // Lectura directa (mismo proceso) — no muta.
  negociosDe(pid) {
    const n = pid ? this._negocios.get(pid) : null;
    return n ? [...n.negocios.values()] : [];
  }

  // ── Tools ──
  toolRecoger(params) { return this._recoger(params); }
  toolLeer(params) { return this._leer(params); }
}

module.exports = OnboardingNegocio;
