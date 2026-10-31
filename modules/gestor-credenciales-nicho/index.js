/**
 * gestor-credenciales-nicho — REFLEJO JS del puente que ADAPTA credential-manager
 * al dominio nichos (esquematizador-negocio autónomo).
 *
 * Contrato (plan-construccion.md HOJA gestor-credenciales-nicho · ADAPTAR):
 *   entrada = canal.asegurar(tipo_canal) desde el ojo/arnés
 *   salida  = gestor.canal_asegurado({tipo, credencial_id, ok, es_nueva}) ·
 *             gestor.canal.failed({motivo: tope|riesgo_baneo|credential_unavailable})
 *   garantía = REUTILIZA credential-manager (CRUD + cascada CUSTOM→CLIENT→PROJECT→GLOBAL)
 *              VÍA RPC, sin require cruzado; añade la capa de autoaprovisionamiento:
 *              reuso-primero, tope de cuentas (Q-CRED-1), guardia anti-baneo (Q-CRED-3).
 *   no hace = no ELIGE canal (eso es Q-OJO-1); no garantiza los datos base del alta
 *             (Q-CRED-2 — parametrizado); no contacta el servicio si hay riesgo reputacional.
 *
 * FORMA: REFLEJO del híbrido — op determinista (reuso → tope → riesgo → crear) + evento de
 * dominio. El contacto real con el servicio de registro gratuito ES un puente parametrizado
 * por canal (Q-CRED-2); aquí vive el REGISTRO de cuentas aprovisionadas (persist por proyecto)
 * y la resolución de credenciales delegando en credential-manager via `credential.resolve.request`.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

class GestorCredencialesNicho extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'gestor-credenciales-nicho';
    this.version = 'reflejo-0.1.0';
    this.cuentas = new Map();               // tipo -> { credencial_id, es_nueva, creada_ts, ultimo_uso_ts, volumen_reciente, activa }
    this.volumenReciente = new Map();       // tipo -> contador de altas recientes (guardia anti-baneo Q-CRED-3)
    this._persistencia = new PosPersistencia({
      modulo: this,
      file: 'gestor-credenciales.json',
      dir: '/proceso-negocio',
      snapshot: (pid) => ({
        cuentas: [...this.cuentas.entries()].map(([tipo, c]) => ({ tipo, ...c })),
        volumenReciente: [...this.volumenReciente.entries()].map(([tipo, n]) => ({ tipo, n }))
      }),
      hidratar: (pid, data) => {
        (data.cuentas || []).forEach((c) => this.cuentas.set(c.tipo, c));
        (data.volumenReciente || []).forEach((v) => this.volumenReciente.set(v.tipo, v.n));
      }
    });
  }

  async onLoad(context) {
    await super.onLoad(context);
    // Egress consciente: el gestor puede crear/validar cuentas en servicios externos gratuitos.
    this.eventBus?.publish('interruptor.registrar', {
      id: 'gestor-credenciales',
      label: 'Gestor de credenciales de nichos (egress a servicios gratuitos)',
      grupo: 'esquematizador-negocio',
      descripcion: 'Autoaprovisiona cuentas de servicios gratuitos para el ojo. Apagarlo bloquea la creación nueva (solo reuso).',
      default: false
    });
  }

  // ── Handlers ──
  onCanalAsegurarRequest(e) {
    return this._atender(e, 'canal.asegurar', 'gestor-credenciales-nicho.canal.asegurar.response', (d) => this._asegurarCanal(d));
  }

  onListarCuentasRequest(e) {
    return this._atender(e, 'lista', 'gestor-credenciales-nicho.listar.response', (d) => this._listarCuentas(d));
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    const project_id = d.project_id;
    if (!project_id) return;
    await this._persistencia.restaurar(project_id);
  }

  // ── Ops (REFLEJO: deterministas) ──

  // Hidratación LAZY tras restart (mismo patrón que sonda: mapa vacío → restaurar).
  async _asegurarCanal(input) {
    const tipo = input.tipo;
    if (!tipo) return this._invalid('tipo');
    const project_id = input.project_id;
    if (project_id && this.cuentas.size === 0) {
      await this._persistencia.restaurar(project_id);
    }

    // 1. Reuso-primero (Q-CRED-2/plan): si ya hay una cuenta activa para el tipo, devolverla.
    const existente = this.cuentas.get(tipo);
    if (existente && existente.activa === false) {
      return {
        status: 409,
        data: { ok: false, motivo: 'riesgo_baneo', message: `Cuenta de '${tipo}' inactiva por guardia reputacional. No se crea nueva sin decisión del dueño (Q-CRED-3).` }
      };
    }
    if (existente) {
      existente.ultimo_uso_ts = new Date().toISOString();
      this._persistencia.marcarDirty(project_id);
      this._publicarEvento('gestor.canal_asegurado', { tipo, credencial_id: existente.credencial_id, ok: true, es_nueva: false }, input);
      return { status: 200, data: { ok: true, credencial_id: existente.credencial_id, es_nueva: false } };
    }

    // 2. Tope de cuentas (Q-CRED-1): no crear si el registrador declarado lo excede.
    if (this._topeExcedido(tipo, this.cuentas.size)) {
      return {
        status: 409,
        data: { ok: false, motivo: 'tope', message: `Tope de cuentas alcanzado para '${tipo}' (Q-CRED-1). Reuso o nueva cuenta tras decisión del dueño.` }
      };
    }

    // 3. Guardia anti-baneo (Q-CRED-3): volumen reciente de altas demasiado alto → no saturar.
    if (this._riesgoBaneo(tipo)) {
      return {
        status: 409,
        data: { ok: false, motivo: 'riesgo_baneo', message: `Volumen de altas reciente de '${tipo}' excede el umbral de riesgo (Q-CRED-3). Pausa de creación.` }
      };
    }

    // 4. Reuso en credential-manager (cascada) ANTES de crear — reuso-primero real.
    const resuelta = await this._reusarEnCredentialManager(input);
    if (resuelta && resuelta.ok) {
      this._registrar(tipo, resuelta.credencial_id, project_id, false);
      return { status: 200, data: { ok: true, credencial_id: resuelta.credencial_id, es_nueva: false, resolved_from: resuelta.resolved_from } };
    }

    // 5. Crear nueva (autoaprovisionamiento Q-CRED-2 — datos_base parametrizados, no inventados).
    const alta = await this._crearEnServicio(tipo, input, project_id);
    if (alta && alta.ok) {
      this._registrar(tipo, alta.credencial_id, project_id, true);
      return { status: 200, data: { ok: true, credencial_id: alta.credencial_id, es_nueva: true } };
    }

    return this._publicarFalloYResponder(input, alta ? alta.motivo : 'credential_unavailable');
  }

  _registrar(tipo, credencial_id, project_id, es_nueva) {
    const now = new Date().toISOString();
    const prev = this.volumenReciente.get(tipo) || 0;
    this.volumenReciente.set(tipo, prev + (es_nueva ? 1 : 0));
    this.cuentas.set(tipo, { credencial_id, es_nueva, creada_ts: now, ultimo_uso_ts: now, volumen_reciente: prev + (es_nueva ? 1 : 0), activa: true });
    this._persistencia.marcarDirty(project_id);
  }

  // Reuso-primero en credential-manager: cascada CUSTOM→CLIENT→PROJECT→GLOBAL via RPC.
  async _reusarEnCredentialManager(input) {
    const provider = input.provider || `nicho_${input.tipo}`;
    const resp = await this._rpc('credential.resolve.request', {
      provider, project_id: input.project_id, client_id: input.client_id, customId: input.custom_id
    });
    const d = resp?.data || resp;
    if (d && d.api_key) {
      return { ok: true, credencial_id: provider, resolved_from: d.resolved_from || 'cascade' };
    }
    return null;
  }

  // Crear nueva cuenta en el servicio GRATUITO (Q-CRED-2). Es un puente parametrizado por tipo:
  // los datos_base del alta SIEMPRE vienen declarados (input.datos_base), nunca inventados.
  async _crearEnServicio(tipo, input, project_id) {
    // Interruptor propio: sin egress encendido, no se abre cuenta nueva (solo reuso).
    const estado = await this._rpc('interruptores.estado.request', { id: 'gestor-credenciales' });
    const e = estado?.data || estado;
    if (e && e.enabled === false) {
      return { ok: false, motivo: 'interruptor_apagado' };
    }
    const datos_base = input.datos_base;
    if (!datos_base || typeof datos_base !== 'object') {
      return { ok: false, motivo: 'datos_base_no_declarados', message: 'Q-CRED-2: el alta requiere datos_base declarados para crear la cuenta. Sin inventar.' };
    }
    // El alta real al servicio se registra como hook determinista: guarda la credencial
    // en credential-manager. El servicio externo concreto (crear/vigilar/girar) lo decide
    // el canal parametrizado (Q-CRED-2) — aquí solo se persiste el aprovisionamiento.
    const provider = input.provider || `nicho_${tipo}`;
    const guardado = await this._rpc('credential.create.request', {
      provider, level: 'PROJECT', identifier: datos_base.identifier || null, api_key: datos_base.api_key
    });
    const g = guardado?.data || guardado;
    if (g && (g.key || g.provider)) {
      return { ok: true, credencial_id: provider };
    }
    return { ok: false, motivo: 'create_failed' };
  }

  // Proyecciones internas puras (según plan):
  _topeExcedido(tipo, contador) {
    const tope = (this.config && this.config.topeCuentas) || 10;
    return contador >= tope;
  }

  _riesgoBaneo(tipo) {
    const recientes = this.volumenReciente.get(tipo) || 0;
    const umbral = (this.config && this.config.volumenBaneoUmbral) || 3;
    return recientes >= umbral;
  }

  // Vista del registro (para el arnés / auditoría), sin valores de clave.
  _listarCuentas(input) {
    if (input.project_id && this.cuentas.size === 0) {
      return { status: 200, data: { cuentas: [], total: 0 } };
    }
    const cuentas = [...this.cuentas.entries()].map(([tipo, c]) => ({
      tipo, credencial_id: c.credencial_id, es_nueva: c.es_nueva, creada_ts: c.creada_ts, ultimo_uso_ts: c.ultimo_uso_ts, activa: c.activa
    }));
    return { status: 200, data: { cuentas, total: cuentas.length } };
  }

  _publicarFalloYResponder(input, motivo) {
    this._publicarEvento('gestor.canal.failed', { tipo: input.tipo, motivo }, input);
    return { status: 503, data: { ok: false, motivo } };
  }

  _publicarEvento(evento, payload, source = null) {
    this.eventBus?.publish(evento, {
      correlation_id: (source && source.correlation_id) || undefined,
      timestamp: new Date().toISOString(),
      ...payload
    });
  }
}

module.exports = GestorCredencialesNicho;
