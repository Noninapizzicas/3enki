/**
 * contabilidad/onboarding-negocio — CUSTODIO (K1·K4, hoja del plan).
 *
 * ALTA DE UN NEGOCIO NUEVO EN LA CONTABILIDAD. Dos clases en una parcela:
 *   K1 OnboardingNegocio  recoge los datos DECLARABLES del negocio (plan de
 *                         cuentas, fuentes, parametros) — un solo escritor, DUENO.
 *   K4 ActivacionVertical enciende la vertical: MECANICO, cero juicio, y SOLO
 *                         si los parametros estan declarados.
 *
 * AISLAMIENTO POR NEGOCIO (invariante 13): dar de alta un negocio es crear su
 * PARCELA y su parcela queda AISLADA — ningun calculo de un negocio lee ni
 * escribe la de otro salvo consolidacion DECLARADA. La dependencia con
 * aislamiento-negocio (I4) es por EVENTO: aqui se PIDE la parcela publicando
 * contabilidad.parcela_negocio.registrar.request (contrato TOLERANTE: si I4 no
 * responde, el negocio queda configurado localmente y se DECLARA que la parcela
 * no se pudo abrir — nunca se afirma que esta aislado cuando no lo esta).
 *
 * SIN PARAMETROS NO SE ACTIVA: si los parametros declarables estan [ABIERTO],
 * K4 responde FALTA con la lista de lo que falta — el hueco se DECLARA, no se
 * rellena ni se asume. Un negocio INCOMPLETO no finge estar en marcha.
 *
 * CUSTODIO (patron real): store en memoria (negocios por id + secuencia
 * append-only); PosPersistencia (storage /contabilidad/onboarding-negocio/*.json);
 * restaura en project.activated; flush en onUnload. GUARD de un solo escritor:
 * solo DUENO configura el negocio — cualquier otro se rechaza con
 * ERROR_DOS_ESCRITORES. La dependencia con cola-declaraciones-criterio (K9) y
 * project-manager es por EVENTO, NUNCA por require cruzado.
 * Emisor/par de fallo: exito publica contabilidad.negocio_configurado ·
 * contabilidad.vertical_activada; error su par determinista.
 * NO REUTILIZA: el onboarding de un negocio contable no existe; `project-manager`
 * gestiona el proyecto, no la configuracion contable.
 *
 * Ver hoja K1/K4 del diseno-oop y bloque `onboarding-negocio` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Un solo escritor del onboarding (K1): el DUENO configura el negocio.
const ROL_ESCRITOR = 'DUENO';

// Codigo simbolico determinista del cerrojo.
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';

// Lo que hay que declarar para que el negocio este CONFIGURADO (K1).
const PARAMETROS_REQUERIDOS = ['plan_de_cuentas', 'fuentes', 'parametros'];

// Marca de lo NO declarado: no se rellena, no se asume.
const MARCA_ABIERTO = 'ABIERTO';

class OnboardingNegocio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'onboarding-negocio';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, negocios:{}, secuencia:[] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'onboarding-negocio.json',
      dir: '/contabilidad/onboarding-negocio',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.negocios) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los negocios configurados del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onConfigurarRequest(e) {
    return this._atender(e, 'configurar', 'contabilidad.negocio.configurar.response', async (d) => {
      const res = await this._recogerConParcela(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.negocio_configurado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.negocio.configurar.failed', res);
      }
      return res;
    });
  }

  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'contabilidad.negocio.estado.response', async (d) => {
      const res = this._estado(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.negocio.estado.failed', res);
      return res;
    });
  }

  onActivarRequest(e) {
    return this._atender(e, 'activar', 'contabilidad.negocio.activar.response', async (d) => {
      const res = this._activar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.vertical_activada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.negocio.activar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-onboarding-negocio-v1', negocios: {}, secuencia: [], escritor: ROL_ESCRITOR };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (K1): solo el DUENO configura el negocio.
  _verificarEscritorUnico(rol) {
    const r = String(rol || '').toUpperCase();
    if (r !== ROL_ESCRITOR) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'el negocio tiene UN escritor: solo el DUENO configura su onboarding', {
          escritor_vigente: ROL_ESCRITOR,
          rol_intentado: r || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  // recoger(rol, negocio, datos) -> ok (K1). Recoge los datos DECLARABLES.
  _recoger(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const negocio = input && (input.negocio || input.id_negocio);
    if (!negocio) return this._invalid('negocio');

    const datos = (input && (input.datos || input.configuracion)) || {};
    if (typeof datos !== 'object') return this._invalid('datos');

    const d = this._obtenerOCrear(pid);
    const existente = d.negocios[negocio] || null;

    const config = {
      negocio: String(negocio),
      // Datos DECLARABLES (K1): plan, fuentes y parametros.
      plan_de_cuentas: datos.plan_de_cuentas !== undefined ? datos.plan_de_cuentas
        : (existente ? existente.plan_de_cuentas : null),
      fuentes: Array.isArray(datos.fuentes) ? datos.fuentes
        : (existente ? existente.fuentes : []),
      parametros: datos.parametros !== undefined ? datos.parametros
        : (existente ? existente.parametros : null),
      territorio: datos.territorio !== undefined ? datos.territorio
        : (existente ? existente.territorio : null),
      sociedad: datos.sociedad !== undefined ? datos.sociedad
        : (existente ? existente.sociedad : null),
      actividad: datos.actividad !== undefined ? datos.actividad
        : (existente ? existente.actividad : null),
      activo: existente ? !!existente.activo : false,
      configurado_por: ROL_ESCRITOR,
      configurado_en: new Date().toISOString(),
      // Aislamiento por negocio (invariante 13): la parcela es propia.
      parcela: (input && input.parcela) || (existente && existente.parcela) || null,
      aislado: !!(input && input.parcela) || !!(existente && existente.aislado),
      reusado: !!existente
    };
    const estado = this._estadoDe(config);
    config.estado = estado.data.estado;
    config.falta = estado.data.falta;
    config.completo = estado.data.completo;

    d.negocios[config.negocio] = config;
    d.secuencia.push({
      negocio: config.negocio,
      estado: config.estado,
      configurado_en: config.configurado_en,
      secuencia: d.secuencia.length + 1
    });
    d.updated_at = config.configurado_en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio: config.negocio,
        configuracion: config,
        estado: config.estado,
        completo: config.completo,
        falta: config.falta,
        reusado: config.reusado,
        no_se_asume_nada: true
      }
    };
  }

  // recoger + parcela aislada (I4) por EVENTO. CONTRATO TOLERANTE: si I4 no
  // responde, el negocio queda configurado y se DECLARA que la parcela no se abrio.
  async _recogerConParcela(d) {
    const res = this._recoger(d);
    if (res.status !== 200) return res;

    const parcela = await this._abrirParcela(d.project_id, res.data.negocio, d.consolidacion);
    const store = this._obtenerOCrear(d.project_id);
    const config = store.negocios[res.data.negocio];
    if (config) {
      config.parcela = parcela.ok ? (parcela.data && parcela.data.parcela) || null : null;
      config.aislado = parcela.ok;
      config.parcela_abierta = parcela.ok;
      store.updated_at = new Date().toISOString();
      this._persist.marcarDirty(d.project_id);
    }
    res.data.parcela = config ? config.parcela : null;
    res.data.aislado = res.data.parcela != null || parcela.ok;
    res.data.parcela_abierta = parcela.ok;
    if (!parcela.ok) {
      // NO se afirma que la parcela este aislada cuando no lo esta.
      res.data.parcela_aviso = {
        status: parcela.status || 503,
        code: 'DEPENDENCIA_NO_DISPONIBLE',
        dependencia: 'aislamiento-negocio',
        message: 'aislamiento-negocio (I4) no confirmo la parcela: el negocio queda configurado, el aislamiento NO se afirma',
        accion: 'NO_AFIRMAR_AISLAMIENTO'
      };
      this.eventBus?.publish('contabilidad.negocio.configurar.failed', {
        status: parcela.status || 503,
        error: res.data.parcela_aviso,
        detalle: { negocio: res.data.negocio, fase: 'PARCELA' }
      });
    }
    return res;
  }

  // estado(negocio) -> CONFIGURADO | FALTA [ABIERTO] (K1).
  _estado(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const negocio = input && (input.negocio || input.id_negocio);
    if (!negocio) return this._invalid('negocio');

    const d = this._obtenerOCrear(pid);
    const config = d.negocios[negocio];
    if (!config) {
      return {
        status: 200,
        data: {
          project_id: pid,
          negocio: String(negocio),
          estado: 'NO_EXISTE',
          completo: false,
          falta: [...PARAMETROS_REQUERIDOS],
          marca: MARCA_ABIERTO,
          asumido: false
        }
      };
    }
    const estado = this._estadoDe(config);
    return {
      status: 200,
      data: {
        project_id: pid,
        negocio: String(negocio),
        estado: estado.data.estado,
        completo: estado.data.completo,
        falta: estado.data.falta,
        marca: estado.data.falta.length ? MARCA_ABIERTO : null,
        configuracion: config,
        activo: !!config.activo,
        no_se_rellena_el_hueco: true
      }
    };
  }

  // Determinista: CONFIGURADO si TODOS los parametros requeridos estan
  // declarados; si no, FALTA con la lista (el hueco se declara, no se estima).
  _estadoDe(config) {
    const falta = [];
    if (config.plan_de_cuentas === null || config.plan_de_cuentas === undefined || config.plan_de_cuentas === '') falta.push('plan_de_cuentas');
    if (!Array.isArray(config.fuentes) || config.fuentes.length === 0) falta.push('fuentes');
    if (config.parametros === null || config.parametros === undefined) falta.push('parametros');
    return {
      status: 200,
      data: {
        estado: falta.length === 0 ? 'CONFIGURADO' : 'FALTA',
        completo: falta.length === 0,
        falta
      }
    };
  }

  // activar(negocio) -> ok (K4: mecanico, cero juicio; sin parametros NO se activa).
  _activar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const negocio = input && (input.negocio || input.id_negocio);
    if (!negocio) return this._invalid('negocio');

    const d = this._obtenerOCrear(pid);
    const config = d.negocios[negocio];
    if (!config) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `el negocio ${negocio} no esta configurado: no hay nada que activar`, {
          negocio: String(negocio), accion: 'CONFIGURAR_PRIMERO'
        });
    }

    const estado = this._estadoDe(config);
    if (!estado.data.completo) {
      // Sin parametros declarados la vertical NO se activa: se declara el hueco.
      return this._errorResponse(409, 'NEGOCIO_INCOMPLETO',
        `la vertical NO se activa: faltan datos declarables (${estado.data.falta.join(', ')})`, {
          negocio: String(negocio),
          falta: estado.data.falta,
          marca: MARCA_ABIERTO,
          activado: false,
          asumido: false,
          senal: 'HUECO_DECLARADO'
        });
    }

    if (config.activo) {
      return {
        status: 200,
        data: {
          project_id: pid,
          negocio: String(negocio),
          activado: true,
          reusado: true,
          configuracion: config,
          mecanico: true,
          cero_juicio: true
        }
      };
    }

    config.activo = true;
    config.activado_en = new Date().toISOString();
    d.updated_at = config.activado_en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio: String(negocio),
        activado: true,
        reusado: false,
        configuracion: config,
        parcela: config.parcela || null,
        // Aislamiento por negocio: la parcela del negocio queda propia.
        parcela_aislada: !!config.parcela,
        mecanico: true,
        cero_juicio: true
      }
    };
  }

  // abrirParcela(negocio) -> I4 la registra por EVENTO (nunca por require cruzado).
  async _abrirParcela(pid, negocio, consolidacion) {
    const resp = await this._rpc('contabilidad.parcela_negocio.registrar.request', {
      project_id: pid,
      rol: 'SISTEMA',
      negocio,
      dueno: ROL_ESCRITOR,
      consolidacion: Array.isArray(consolidacion) ? consolidacion : undefined
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) {
      return { ok: false, status: (resp && resp.status) || 503, error: (resp && resp.error) || null };
    }
    return { ok: true, data: resp.data || {} };
  }

  // ── Tools ──
  toolRecoger(params) { return this._recoger(params); }
  toolEstado(params) { return this._estado(params); }
  toolActivar(params) { return this._activar(params); }
}

module.exports = OnboardingNegocio;
