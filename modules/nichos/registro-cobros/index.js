/**
 * nichos/registro-cobros — CUSTODIO CON PERSISTENCIA (F1, hoja del plan).
 *
 * Registro APPEND-ONLY e inmutable de los cobros por proyecto: cada cobro se
 * asienta distinguiendo EFECTIVO (entró el dinero) vs COMPROMETIDO (promesa/
 * suscripción que genera flujo a caja). JAMAS se sobrescribe: el historial es
 * la fuente de verdad de la salud financiera (F3) y del bucle de reglas
 * aprendidas (C7).
 *
 * CUSTODIO (patrón real, distinto del reflejo stateless): un solo escritor del
 * store — el MOTOR_COBRO (E3) asienta vía guard de rol en _appendUnico; la
 * lectura (_consultar) no muta; la escritura valida, apila y guarda. Persiste
 * por proyecto con PosPersistencia (storage /prisma/nichos/registro-cobros.json),
 * restaura en project.activated y vuelca en onUnload. Emisor/par de fallo.
 *
 * Ver hoja F1 del plan-construccion y arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol único escritor — el MOTOR_COBRO (E3). Los demás son solo lectores.
const ROL_MOTOR_COBRO = 'MOTOR_COBRO';

// Tipos de cobro permitidos — EFECTIVO (entró el dinero) | COMPROMETIDO (promesa).
const TIPOS_COBRO = new Set(['EFECTIVO', 'COMPROMETIDO']);

class RegistroCobros extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'registro-cobros';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, cobros: [append-only] }
    this._historiales = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'registro-cobros.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const h = this._historiales.get(pid);
        return h ? { project_id: pid, historial: h } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.historial) this._historiales.set(pid, data.historial);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el historial del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender) ──
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'nichos.cobro.registrar.response', async (d) => {
      const res = this._appendUnico(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.cobro_registrado', {
          project_id: res.data.project_id,
          cobro: res.data.cobro,
          registrado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.cobro.registrar.failed', res);
      }
      return res;
    });
  }

  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.cobro.consultar.response', d => this._consultar(d));
  }

  // Fire-and-forget del flujo de cobro (E3 -> F1): motor-cobro publicó ejecutado.
  onCobroEjecutado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._appendUnico({
      project_id: d.project_id,
      rol: d.duenyo || ROL_MOTOR_COBRO,
      cobro: d.cobro
    });
    if (res.status === 200) {
      this.eventBus?.publish('nichos.cobro_registrado', {
        project_id: res.data.project_id,
        cobro: res.data.cobro,
        registrado: true,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('nichos.cobro.registrar.failed', res);
    }
    return res;
  }

  // ── proyección de lectura (NO muta) ──
  _obtenerOCrear(pid) {
    let h = this._historiales.get(pid);
    if (!h) {
      h = { esquema: 'nichos-registro-cobros-v1', cobros: [] };
      this._historiales.set(pid, h);
      this._persist.marcarDirty(pid);
    }
    return h;
  }

  _consultar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const h = this._obtenerOCrear(pid);
    return { status: 200, data: { project_id: pid, historial: h } };
  }

  // Alias semántico para F3/K1: historial plano de cobros del proyecto.
  historialCobros(pid) {
    if (!pid) return [];
    const h = this._historiales.get(pid);
    return h ? h.cobros : [];
  }

  // ── proyección de escritura (el único escritor: MOTOR_COBRO) — APPEND-ONLY ──
  _appendUnico(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el MOTOR_COBRO (E3) puede asentar un cobro.
    if (input.rol !== ROL_MOTOR_COBRO) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el MOTOR_COBRO puede asentar cobros', {
        rol_esperado: ROL_MOTOR_COBRO, rol_recibido: input.rol
      });
    }

    const cobro = input.cobro;
    if (!cobro || typeof cobro !== 'object') {
      return this._invalid('cobro');
    }
    const importe = Number(cobro.importe);
    if (!Number.isFinite(importe) || importe <= 0) {
      return this._invalid('cobro.importe');
    }
    const tipo = String(cobro.tipo || '').toUpperCase();
    if (!TIPOS_COBRO.has(tipo)) {
      return this._invalid('cobro.tipo');
    }

    const hist = this._obtenerOCrear(pid);
    // Append-only: el cobro se apila con su secuencia; NUNCA se sobrescribe.
    const asiento = {
      id: `${pid}-c${hist.cobros.length + 1}`,
      importe,
      tipo,
      pagador: (cobro.pagador && String(cobro.pagador).trim()) ? String(cobro.pagador).trim() : null,
      fecha: cobro.fecha || new Date().toISOString(),
      registrado_por: ROL_MOTOR_COBRO
    };
    hist.cobros.push(asiento);
    hist.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, cobro: asiento, registrado: true } };
  }

  // ── Tools ──
  toolRegistrar(params) { return this._appendUnico(params); }
  toolConsultar(params) { return this._consultar(params); }
}

module.exports = RegistroCobros;
