/**
 * nichos/cuadro-salud-financiera — CUSTODIO CON PERSISTENCIA (F3, hoja del plan).
 *
 * Declara la SALUD FINANCIERA de cada proyecto: GENERA | SANGRA | NEUTRO + flujo
 * a caja, calculada de HECHOS (F1 cobros efectivo/comprometido + F2 costes
 * construccion/operacion/fuentes), NUNCA de promesas. Medida maestra inalterable:
 *
 *   GENERA  → ingresos  > coste total (el proyecto cierra en positivo)
 *   SANGRA  → coste total >= techo declarado y supera ingresos (alimenta F4/reglas)
 *   NEUTRO  → ninguno (no genera, no sangra: está en equilibrio/coste igual a caja)
 *
 * CUSTODIO (patrón real): un solo escritor — el flujo F1/F2 consume y este
 * cuadro agrega por proyecto (guard rol SISTEMA_SALUD). La lectura (_leer) no
 * muta; la escritura (_agregarPorProyecto / _registrarFlujoACaja) valida y
 * persiste. Persiste por proyecto con PosPersistencia
 * (storage /prisma/nichos/cuadro-salud-financiera.json), restaura en
 * project.activated y vuelca en onUnload. Emisor/par de fallo.
 *
 * Ver hoja F3 del plan-construccion y arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol único escritor — el flujo de salud (F1/F2). Los demás son solo lectores.
const ROL_SISTEMA_SALUD = 'SISTEMA_SALUD';

// Techo de sangría declarado (EUR): sobre este coste acumulado el proyecto SANGRA.
const TECHO_SANGRIA = 1000;

// Estados de salud financiera permitidos.
const ESTADOS = new Set(['GENERA', 'SANGRA', 'NEUTRO']);

class CuadroSaludFinanciera extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuadro-salud-financiera';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> cuadro de salud
    this._cuadros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cuadro-salud-financiera.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const c = this._cuadros.get(pid);
        return c ? { project_id: pid, cuadro: c } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.cuadro) this._cuadros.set(pid, data.cuadro);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el cuadro del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender) ──
  onActualizarRequest(e) {
    return this._atender(e, 'actualizar', 'nichos.salud.actualizar.response', async (d) => {
      const res = this._agregarPorProyecto(d);
      if (res.status === 200) {
        this.eventBus?.publish('nichos.salud.actualizada', {
          project_id: res.data.project_id,
          estado: res.data.estado,
          coste_total: res.data.cuadro.coste_total,
          ingresos: res.data.cuadro.ingresos,
          flujo_a_caja: res.data.cuadro.flujo_a_caja,
          correlation_id: d.correlation_id
        });
        this.eventBus?.publish('nichos.cuadro.flujo_a_caja', {
          project_id: res.data.project_id,
          flujo_a_caja: res.data.cuadro.flujo_a_caja,
          periodo: res.data.cuadro.periodo
        });
      } else {
        this.eventBus?.publish('nichos.salud.actualizar.failed', res);
      }
      return res;
    });
  }

  onLeerRequest(e) {
    return this._atender(e, 'leer', 'nichos.cuadro.leer.response', d => this._leer(d));
  }

  // Fire-and-forget F1->F3: cobro asentado, acumula ingreso real.
  onCobroRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._acumularCobro(d);
    return res;
  }

  // Fire-and-forget F2->F3: coste imputado, recalcula estado.
  onCosteImputado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._acumularCoste(d);
    if (res && res.status === 200 && res.data.actualizado) {
      const cuadro = res.data.cuadro;
      this.eventBus?.publish('nichos.salud.actualizada', {
        project_id: res.data.project_id,
        estado: cuadro.estado,
        coste_total: cuadro.coste_total,
        ingresos: cuadro.ingresos,
        flujo_a_caja: cuadro.flujo_a_caja,
        correlation_id: d.correlation_id
      });
    }
    return res;
  }

  // ── proyección de lectura (NO muta) ──
  _obtenerOCrear(pid) {
    let c = this._cuadros.get(pid);
    if (!c) {
      c = {
        esquema: 'nichos-cuadro-salud-v1',
        proyect_id: pid,
        estado: 'NEUTRO',
        ingresos: 0,
        coste_total: 0,
        flujo_a_caja: 0,
        techo_sangria: TECHO_SANGRIA,
        periodo: 'semana',
        updated_at: null
      };
      this._cuadros.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  _leer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const c = this._obtenerOCrear(pid);
    return { status: 200, data: { project_id: pid, cuadro: c } };
  }

  // Alias semántico para C7/K1: estado actual del proyecto.
  estadoDe(pid) {
    const c = this._cuadros.get(pid);
    return c ? c.estado : 'NEUTRO';
  }

  // ── proyección de escritura (el único escritor: SISTEMA_SALUD) ──
  _agregarPorProyecto(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el flujo de salud puede declarar el cuadro.
    if (input.rol !== ROL_SISTEMA_SALUD) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el SISTEMA_SALUD puede actualizar el cuadro de salud', {
        rol_esperado: ROL_SISTEMA_SALUD, rol_recibido: input.rol
      });
    }

    const cobros = Array.isArray(input.cobros) ? input.cobros : [];
    const coste_total = Number.isFinite(Number(input.coste_total))
      ? Number(input.coste_total)
      : (input.costes ? (Number(input.costes.construccion) + Number(input.costes.operacion) + Number(input.costes.fuentes)) : 0);

    const ingresos = cobros.reduce((acc, c) => acc + (Number(c.importe) || 0), 0);
    if (!Number.isFinite(coste_total) || coste_total < 0) {
      return this._errorResponse(400, 'COSTE_INVALIDO', 'el coste total debe ser un numero >= 0', { project_id: pid });
    }

    const estado = this._calcularEstado(ingresos, coste_total);
    const cuadro = this._obtenerOCrear(pid);
    cuadro.estado = estado;
    cuadro.ingresos = Math.round(ingresos * 100) / 100;
    cuadro.coste_total = Math.round(coste_total * 100) / 100;
    cuadro.flujo_a_caja = Math.round((ingresos - coste_total) * 100) / 100;
    cuadro.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, cuadro, estado, actualizado: true } };
  }

  // ── proyección pura: medida maestra (de hechos, no de promesas) ──
  _calcularEstado(ingresos, coste_total) {
    if (ingresos > coste_total) return 'GENERA';
    if (coste_total >= TECHO_SANGRIA && coste_total > ingresos) return 'SANGRA';
    return 'NEUTRO';
  }

  // Acumula un cobro registrado (F1->F3): suma ingreso real a caja.
  _acumularCobro({ project_id, cobro }) {
    if (!project_id) return null;
    const cuadro = this._obtenerOCrear(project_id);
    const importe = Number(cobro && cobro.importe);
    if (!Number.isFinite(importe) || importe <= 0) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'cobro inválido para acumular en caja' } };
    }
    const previo = this._cuadros.get(project_id);
    cuadro.ingresos = Math.round(((previo ? previo.ingresos : 0) + importe) * 100) / 100;
    cuadro.flujo_a_caja = Math.round((cuadro.ingresos - cuadro.coste_total) * 100) / 100;
    cuadro.estado = this._calcularEstado(cuadro.ingresos, cuadro.coste_total);
    cuadro.updated_at = new Date().toISOString();
    this._persist.marcarDirty(project_id);
    return { status: 200, data: { project_id, cuadro, estado: cuadro.estado } };
  }

  // Acumula un coste imputado (F2->F3): recalcula estado.
  _acumularCoste({ project_id, coste_proyecto }) {
    if (!project_id) return null;
    const cuadro = this._obtenerOCrear(project_id);
    const coste = Number(coste_proyecto && (coste_proyecto.coste_total ?? coste_proyecto));
    if (!Number.isFinite(coste) || coste < 0) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'coste inválido para imputar al cuadro' } };
    }
    cuadro.coste_total = Math.round(coste * 100) / 100;
    cuadro.flujo_a_caja = Math.round((cuadro.ingresos - cuadro.coste_total) * 100) / 100;
    cuadro.estado = this._calcularEstado(cuadro.ingresos, cuadro.coste_total);
    cuadro.updated_at = new Date().toISOString();
    this._persist.marcarDirty(project_id);
    return { status: 200, data: { project_id, cuadro, actualizado: true } };
  }

  // Proyección: registra el flujo a caja de un periodo.
  _registrarFlujoACaja(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const cuadro = this._obtenerOCrear(pid);
    const flujo = Number(input.flujo_a_caja);
    if (!Number.isFinite(flujo)) return this._invalid('flujo_a_caja');
    cuadro.flujo_a_caja = Math.round(flujo * 100) / 100;
    if (input.periodo) cuadro.periodo = String(input.periodo).trim();
    cuadro.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);
    return { status: 200, data: { project_id: pid, flujo_a_caja: cuadro.flujo_a_caja, periodo: cuadro.periodo, registrado: true } };
  }

  // ── Tools ──
  toolActualizar(params) { return this._agregarPorProyecto(params); }
  toolLeer(params) { return this._leer(params); }
  toolRegistrarFlujoACaja(params) { return this._registrarFlujoACaja(params); }
}

module.exports = CuadroSaludFinanciera;
