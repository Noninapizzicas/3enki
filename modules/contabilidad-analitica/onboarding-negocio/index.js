/**
 * contabilidad-analitica/onboarding-negocio — CUSTODIO CON PERSISTENCIA (K1, hoja del plan).
 *
 * LA PUERTA DE ENTRADA DE CADA NEGOCIO (multi-tenant). Aqui se da de alta un negocio nuevo
 * RECOGIENDO sus datos DECLARABLES — el plan contable, las fuentes de hechos, los parametros del
 * negocio — y se AISLA su parcela: lo de un negocio no se fuga a otro.
 *
 * ATRIBUTOS del diseno: `config:Map<Clave,Valor>`.
 *   METODOS: recoger(negocio, datos), leer(clave):Opcion<Valor>.
 *   REGLA: recoge los datos declarables del negocio nuevo (plan, fuentes, parametros). UN escritor.
 *
 * LOS DATOS SON DECLARABLES Y NADA SE ESTIMA: el plan, las fuentes y los parametros entran como
 * DATO declarado por quien da de alta el negocio. Una clave que no llega NO existe: queda `[ABIERTO]`
 * con su valor null y se declara en `abierto` — jamas se rellena con un valor por defecto, ni se
 * hereda de otro negocio (heredar seria una fuga y una invencion a la vez).
 *
 * LA PLATAFORMA SE CONSUME POR EVENTO, NUNCA POR require: la existencia del proyecto se comprueba y
 * se LIGA pidiendosela a `project-manager` POR EVENTO (`project.get.request`, best-effort). Si
 * project-manager no responde, el alta sigue siendo DECLARADA (`proyecto_verificado:false`) — no se
 * finge la verificacion ni se inventa el proyecto.
 *
 * ALTA EFECTIVA → EMITE LA ACTIVACION DE LA VERTICAL POR EVENTO: al quedar el negocio dado de alta
 * se publica `contabilidad.negocio_onboarded`, que consume `activacion-vertical` (K4). Este modulo
 * NO enciende nada por su cuenta: declara el alta y emite; quien enciende es K4.
 *
 * AISLAMIENTO POR NEGOCIO (invariante dura): cada negocio tiene SU parcela. `leer` devuelve solo lo
 * de ese negocio; quien declare otro negocio como solicitante → 403 (un negocio no ve otro). Sin
 * negocio declarado no se abre parcela huerfana.
 *
 * UN SOLO ESCRITOR: solo el alta del negocio (rol ALTA_NEGOCIO) recoge datos; cualquier otro rol es
 * rechazado (segundo escritor → 403). `leer` es LECTURA y no muta.
 *
 * Invariantes:
 *  - El JEFE/ALTA DECIDE Y DECLARA: nada se infiere; dato ausente → [ABIERTO].
 *  - Un negocio no se fuga a otro (guard de aislamiento en las dos ops).
 *  - LEY/PARAMETRO COMO DATO: el plan, las fuentes y los parametros son entrada; cero constantes.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja K1 del plan-construccion y diseno-oop.md (CLASE OnboardingNegocio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor: el alta del negocio la declara quien da de alta (dueno/operador del alta).
const ROL_ESCRITOR = 'ALTA_NEGOCIO';

// Claves DECLARABLES del negocio nuevo (el molde): plan · fuentes · parametros.
// Solo los NOMBRES del molde — ningun valor cableado, ningun default.
const CLAVES_CONOCIDAS = ['plan', 'fuentes', 'parametros'];

class OnboardingNegocio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'onboarding-negocio';
    this.version = 'reflejo-0.1.0';
    // store: project_id → { esquema, negocios: Map<negocio_id, Config> }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'onboarding-negocio.json',
      dir: '/contabilidad/onboarding-negocio',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, negocios: [...p.negocios.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const negocios = new Map();
        for (const n of (data.negocios || [])) {
          if (n && n.negocio != null) negocios.set(String(n.negocio), n);
        }
        this._parcelas.set(pid, { esquema: data.esquema || 'contabilidad-onboarding-negocio-v1', negocios });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las parcelas de alta del proyecto activado (multi-negocio aislado).
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onRecogerRequest(e) {
    return this._atender(e, 'recoger', 'onboarding-negocio.recoger.response', async (d) => {
      const res = await this._recoger(d);
      if (res.status === 200) {
        // ALTA EFECTIVA → evento de dominio: la activacion de la vertical la dispara K4 (por evento).
        // Este modulo NO enciende nada: declara el alta y emite.
        if (res.data.alta_efectiva) {
          this.eventBus?.publish('contabilidad.negocio_onboarded', {
            project_id: res.data.project_id,
            negocio: res.data.negocio,
            config: res.data.config,
            plan: res.data.config.plan ?? null,
            fuentes: res.data.config.fuentes ?? null,
            parametros: res.data.config.parametros ?? null,
            abierto: res.data.abierto,
            faltan: res.data.faltan,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('onboarding-negocio.recoger.failed', res);
      }
      return res;
    });
  }

  onLeerRequest(e) {
    return this._atender(e, 'leer', 'onboarding-negocio.leer.response', async (d) => {
      const res = this._leer(d);
      if (res.status !== 200) this.eventBus?.publish('onboarding-negocio.leer.failed', res);
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor): el alta del negocio nuevo ──
  async _recoger(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el alta (ALTA_NEGOCIO) recoge los datos del negocio.
    const guard = this._guardEscritor(input.rol);
    if (guard) return guard;

    const negocio = this._negocio(pid, input);

    // GUARD de AISLAMIENTO: un negocio no se fuga a otro. El alta declara SU negocio.
    const aislamiento = this._guardAislamiento(negocio, input.solicitante_negocio);
    if (aislamiento) return aislamiento;

    // Los DATOS declarados del negocio (el alta los declara; no se infiere ninguno).
    const datos = (input.datos && typeof input.datos === 'object') ? input.datos : input;

    const parcela = this._obtenerOCrear(pid);
    const existente = parcela.negocios.get(negocio) || null;
    const ahora = new Date().toISOString();

    const config = existente || {
      negocio,
      proyecto: pid,
      plan: null,
      fuentes: null,
      parametros: null,
      licencia: null,
      estado: 'EN_ALTA',
      alta_por: null,
      alta_en: null,
      abierto: [],
      claves_abiertas: [],
      historial: []
    };

    // Las CLAVES CONOCIDAS del molde: se toman DECLARADAS. Ausente → null y se declara el hueco.
    const claves_abiertas = [];
    for (const clave of CLAVES_CONOCIDAS) {
      const v = datos[clave];
      const tiene = v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')
        && !(Array.isArray(v) && v.length === 0);
      if (tiene) {
        config[clave] = v;
      } else if (existente && config[clave] !== null && config[clave] !== undefined) {
        // Ya declarado antes: se conserva (una declaracion parcial no borra lo declarado).
      } else {
        config[clave] = null;
        claves_abiertas.push(clave);
      }
    }
    // La LICENCIA por negocio (K8 [ABIERTO]) tambien es declarable; ausente → null, no se inventa.
    if (datos.licencia !== undefined && datos.licencia !== null) config.licencia = datos.licencia;

    // Claves EXTRA declaradas (mapa abierto): se recogen tal cual, sin molde cerrado.
    config.extra = (config.extra && typeof config.extra === 'object') ? config.extra : {};
    for (const [k, v] of Object.entries(datos)) {
      if (['project_id', 'rol', 'negocio', 'negocio_id', 'solicitante_negocio', 'datos', 'correlation_id', 'request_id'].includes(k)) continue;
      if (CLAVES_CONOCIDAS.includes(k) || k === 'licencia') continue;
      if (v === undefined || v === null) continue;
      config.extra[k] = v;
    }

    const yaEstaba = Boolean(existente);
    config.estado = claves_abiertas.length === 0 ? 'ALTA' : 'EN_ALTA';
    config.alta_por = ROL_ESCRITOR;
    config.alta_en = config.alta_en || ahora;
    config.updated_at = ahora;
    config.claves_abiertas = claves_abiertas;
    config.abierto = claves_abiertas;
    config.historial = Array.isArray(config.historial) ? config.historial : [];
    config.historial.push({ estado: config.estado, claves_abiertas, por: ROL_ESCRITOR, en: ahora });

    // La PLATAFORMA se consulta POR EVENTO (nunca por require): se LIGA el proyecto a
    // project-manager. Si no responde, no se finge: `proyecto_verificado:false`.
    const verif = await this._verificarProyecto(pid);
    config.proyecto_verificado = verif.verificado;
    config.proyecto_nombre = verif.nombre;

    parcela.negocios.set(negocio, config);
    parcela.updated_at = ahora;
    this._persist.marcarDirty(pid);

    // El alta es EFECTIVA cuando el negocio ya declaro lo minimo del molde (plan y fuentes).
    const minimo = ['plan', 'fuentes'];
    const alta_efectiva = minimo.every(k => config[k] !== null && config[k] !== undefined);

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio,
        config,
        alta: !yaEstaba,
        actualizado: yaEstaba,
        alta_efectiva,
        proyecto_verificado: verif.verificado,
        fuente_plataforma: verif.fuente,
        // Lo que el negocio aun no ha declarado (nada se rellena solo, nada se hereda de otro negocio).
        abierto: claves_abiertas.length > 0,
        faltan: claves_abiertas,
        aislado: true,
        motivo: claves_abiertas.length > 0
          ? 'el alta queda [ABIERTO]: el negocio no ha declarado ' + claves_abiertas.join(', ')
            + ' (nada se estima ni se hereda de otro negocio)'
          : null
      }
    };
  }

  // ── proyeccion de lectura: leer(clave) → Opcion<Valor> (NO muta) ──
  _leer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const negocio = this._negocio(pid, input);

    // GUARD de AISLAMIENTO: un negocio no ve otro. Toda lectura de parcela ajena → 403.
    const aislamiento = this._guardAislamiento(negocio, input.solicitante_negocio);
    if (aislamiento) return aislamiento;

    const parcela = this._obtenerOCrear(pid);
    const config = parcela.negocios.get(negocio) || null;

    // Negocio no dado de alta: se declara el hueco; no se inventa una configuracion.
    if (!config) {
      return {
        status: 200,
        data: {
          project_id: pid, negocio, clave: input.clave != null ? String(input.clave) : null,
          valor: null, opcion: null, declarado: false, config: null,
          abierto: true, faltan: ['alta'],
          motivo: 'el negocio no esta dado de alta: no hay configuracion que leer'
        }
      };
    }

    const clave = input.clave != null ? String(input.clave) : null;
    // Sin clave declarada: devuelve la configuracion COMPLETA de ESE negocio (solo de ese).
    if (clave === null) {
      return {
        status: 200,
        data: {
          project_id: pid, negocio, clave: null,
          valor: config, opcion: { some: true, valor: config }, config,
          declarado: config.estado === 'ALTA',
          abierto: Array.isArray(config.abierto) && config.abierto.length > 0,
          faltan: Array.isArray(config.abierto) ? config.abierto : [],
          aislado: true
        }
      };
    }

    const valor = config[clave] !== undefined ? config[clave] : (config.extra ? config.extra[clave] : undefined);
    const declarado = valor !== undefined && valor !== null;

    return {
      status: 200,
      data: {
        project_id: pid, negocio, clave,
        // Opcion<Valor>: ausente = opcion vacia, NO un valor por defecto.
        valor: declarado ? valor : null,
        opcion: { some: declarado, valor: declarado ? valor : null },
        config,
        declarado,
        abierto: !declarado,
        faltan: declarado ? [] : [clave],
        aislado: true,
        motivo: declarado ? null : 'el negocio no ha declarado esa clave: queda [ABIERTO] (nada se estima)'
      }
    };
  }

  // GUARD de un solo escritor: el segundo escritor no espera ni hace cola.
  _guardEscritor(rol) {
    if (rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el alta del negocio (ALTA_NEGOCIO) recoge los datos declarables',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: rol ?? null });
    }
    return null;
  }

  // GUARD de aislamiento: un negocio no se fuga a otro. Pedir/declarar la parcela de otro → 403.
  _guardAislamiento(negocio, solicitanteRaw) {
    const solicitante = this._clave(solicitanteRaw);
    if (solicitante !== null && solicitante !== negocio) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'un negocio no ve otro negocio: la parcela de alta pertenece a otro negocio',
        { negocio: solicitante, parcela: negocio, aislamiento: 'negocio↔negocio' });
    }
    return null;
  }

  // La CLAVE del negocio: declarada. En Enki cada cliente/negocio ES un proyecto, asi que sin
  // negocio explicito se toma el propio project_id — y se DECLARA el origen (no es una invencion).
  _negocio(pid, input = {}) {
    const explicito = this._clave(input.negocio != null ? input.negocio : input.negocio_id);
    this._negocio_origen = explicito !== null ? 'declarado' : 'project_id';
    return explicito !== null ? explicito : this._clave(pid);
  }

  // La plataforma (project-manager) se consume POR EVENTO, nunca por require. Best-effort.
  async _verificarProyecto(pid) {
    const r = await this._rpc('project.get.request', { project_id: pid }, { timeout_ms: 4000 }).catch(() => null);
    const data = r && r.data ? r.data : null;
    if (!data) return { verificado: false, nombre: null, fuente: null };
    const proyecto = data.project || data.proyecto || data;
    return {
      verificado: true,
      nombre: proyecto && proyecto.name != null ? String(proyecto.name) : null,
      fuente: 'project-manager'
    };
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-onboarding-negocio-v1', negocios: new Map() };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Lectura directa (mismo proceso) — no muta. Solo la parcela de ESE negocio.
  configDe(pid, negocio) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p ? (p.negocios.get(String(negocio)) || null) : null;
  }

  _clave(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return this._clave(v.id ?? v.clave ?? v.nombre ?? v.negocio);
    return String(v);
  }

  // ── Tools ──
  toolRecoger(params) { return this._recoger(params); }
  toolLeer(params) { return this._leer(params); }
}

module.exports = OnboardingNegocio;
