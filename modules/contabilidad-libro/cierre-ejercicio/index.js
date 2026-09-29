/**
 * contabilidad-libro/cierre-ejercicio — CUSTODIO CON PERSISTENCIA (C4, hoja del plan).
 *
 * **EL CIERRE.** Cierra el periodo con ajustes. Es IRREVERSIBLE salvo ajuste
 * (invariante 12): reabrir SOLO con un `AsientoAjuste` — y el ajuste SUMA, no borra.
 * El cierre original queda PRESERVADO (append-only); una reapertura se AÑADE como
 * marca, jamás muta ni borra el cierre.
 *
 * Un CIERRE = UN ASIENTO: la clave natural del cierre (`CIERRE|<ejercicio>`) gobierna
 * la idempotencia. Volver a cerrar el mismo ejercicio NO duplica: se devuelve el
 * cierre ya registrado (`cerrado:false`, `ya_cerrado:true`).
 *
 * Depende de (POR EVENTO, nunca por import): balance-situacion (C1) y cuenta-resultados
 * (C2) — de los que LEE los estados, y asiento-ajuste (B5) — por donde los ajustes del
 * cierre ENTRAN al libro (la corrección SUMA). Si un estado no responde, se declara en
 * `abierto` (no se finge el cierre completo).
 *
 * Es un CUSTODIO con estado: un SINGLE-WRITER por la parcela `libro/cierre`. El segundo
 * escritor no cierra (403).
 *
 * Invariantes:
 *  - Un cierre = un asiento (misma clave natural → idempotente).
 *  - El cierre es IRREVERSIBLE salvo ajuste; el ajuste SUMA.
 *  - Un solo escritor por parcela (single-writer, por evento → 403).
 *  - Lo que no se pudo confirmar se DECLARA (`abierto`), no se oculta.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja C4 del plan-construccion y diseno-oop.md (CLASE CierreEjercicio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// La parcela del cierre. El turno lo concede single-writer (M2).
const PARCELA = 'libro/cierre';
// Rol que reclama el turno en single-writer.
const ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR';

class CierreEjercicio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cierre-ejercicio';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, cierres:[append-only], por_ejercicio:Map, reaperturas:[append-only] }
    this._libros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cierre-ejercicio.json',
      dir: '/contabilidad/cierre-ejercicio',
      snapshot: (pid) => {
        const l = this._libros.get(pid);
        if (!l) return null;
        return { project_id: pid, esquema: l.esquema, cierres: l.cierres, reaperturas: l.reaperturas };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const cierres = Array.isArray(data.cierres) ? data.cierres : [];
        const reaperturas = Array.isArray(data.reaperturas) ? data.reaperturas : [];
        const por_ejercicio = new Map();
        for (const c of cierres) if (c && c.ejercicio != null) por_ejercicio.set(String(c.ejercicio), c);
        this._libros.set(pid, { esquema: data.esquema || 'contabilidad-cierre-ejercicio-v1', cierres, por_ejercicio, reaperturas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los cierres del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender) ──
  onCerrarRequest(e) {
    return this._atender(e, 'cerrar', 'cierre-ejercicio.cerrar.response', async (d) => {
      const res = await this._cerrar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el ejercicio quedo cerrado (o ya lo estaba).
        this.eventBus?.publish('contabilidad.ejercicio_cerrado', {
          project_id: res.data.project_id,
          ejercicio: res.data.ejercicio,
          cierre: res.data.cierre,
          clave_natural: res.data.clave_natural,
          cerrado: res.data.cerrado,
          ya_cerrado: Boolean(res.data.ya_cerrado),
          correlation_id: d.correlation_id
        });
      } else {
        // Segundo escritor, ejercicio ausente, etc. → par determinista.
        this.eventBus?.publish('cierre-ejercicio.cerrar.failed', res);
      }
      return res;
    });
  }

  onReabrirRequest(e) {
    return this._atender(e, 'reabrir', 'cierre-ejercicio.reabrir.response', async (d) => {
      const res = await this._reabrir(d);
      // La reapertura NO introduce un estado de dominio nuevo: el ajuste que la habilita
      // ya emite su propio evento de dominio (contabilidad.asiento_ajuste_recibido, B5).
      if (res.status !== 200) this.eventBus?.publish('cierre-ejercicio.reabrir.failed', res);
      return res;
    });
  }

  // ── EL CIERRE (IRREVERSIBLE salvo ajuste; un cierre = un asiento) ──
  async _cerrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');
    const ejercicio = input.ejercicio != null ? String(input.ejercicio).trim() : '';
    if (!ejercicio) return this._invalid('ejercicio');

    // ── 1 · EL TURNO: se pide a single-writer (M2) POR EVENTO y se RESPETA su GUARD. ──
    const escritor_id = input.escritor_id != null ? String(input.escritor_id) : ROL_RECLAMANTE;
    const turno = await this._rpc('single-writer.reclamar.request',
      { project_id: pid, rol: ROL_RECLAMANTE, parcela: PARCELA, id: escritor_id }, { timeout_ms: 4000 });
    const turno_data = turno && turno.data ? turno.data : null;
    if (turno_data && turno_data.concedido === false) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor con el turno de la parcela del cierre puede cerrar el ejercicio',
        { parcela: PARCELA, dueno: turno_data.dueno ?? null, solicitante: escritor_id });
    }
    const turno_confirmado = Boolean(turno_data && turno_data.concedido === true);

    const libro = this._obtenerOCrear(pid);

    // ── 2 · UN CIERRE = UN ASIENTO: clave natural por ejercicio (idempotencia). ──
    const clave = `CIERRE|${ejercicio}`;
    if (libro.por_ejercicio.has(ejercicio)) {
      const existente = libro.por_ejercicio.get(ejercicio);
      return {
        status: 200,
        data: {
          project_id: pid, ejercicio, cierre: existente, cerrado: false, ya_cerrado: true,
          clave_natural: clave, turno_confirmado,
          motivo: 'el ejercicio ya esta cerrado: un cierre = un asiento'
        }
      };
    }

    // ── 3 · LOS AJUSTES ENTRAN por asiento-ajuste (B5) POR EVENTO: la corrección SUMA. ──
    const ajustes = Array.isArray(input.ajustes) ? input.ajustes : [];
    const ajustes_encaminados = [];
    for (const aj of ajustes) {
      const r = await this._rpc('asiento-ajuste.entrar.request',
        { project_id: pid, ajuste: aj, motivo: input.motivo != null ? String(input.motivo) : 'cierre_ejercicio', correlation_id: input.correlation_id },
        { timeout_ms: 4000 });
      const ok = Boolean(r && r.status === 200);
      ajustes_encaminados.push({
        clave_correccion: (r && r.data && r.data.clave_correccion) || null,
        encaminado: ok
      });
    }
    const ajustes_encaminados_ok = ajustes_encaminados.filter(a => a.encaminado).length;

    // ── 4 · LOS ESTADOS SE LEEN de balance-situacion (C1) y cuenta-resultados (C2) POR EVENTO. ──
    const abierto = [];
    const rb = await this._rpc('balance-situacion.calcular.request', { project_id: pid, ejercicio }, { timeout_ms: 4000 });
    const balance = (rb && rb.status === 200 && rb.data) ? rb.data : null;
    if (!balance) abierto.push('balance');

    const rr = await this._rpc('cuenta-resultados.calcular.request', { project_id: pid, ejercicio }, { timeout_ms: 4000 });
    const resultados = (rr && rr.status === 200 && rr.data) ? rr.data : null;
    if (!resultados) abierto.push('resultado');

    // ── 5 · EL CIERRE queda registrado (append-only). Irreversible salvo ajuste. ──
    const ahora = new Date().toISOString();
    const cierre = {
      numero: libro.cierres.length + 1,
      clave_natural: clave,
      ejercicio,
      activo: balance ? balance.activo : null,
      pasivo: balance ? balance.pasivo : null,
      patrimonio: balance ? balance.patrimonio : null,
      cuadra: balance ? balance.cuadra : null,
      resultado: resultados ? resultados.resultado : null,
      signo: resultados ? resultados.signo : null,
      ajustes: ajustes_encaminados,
      ajustes_encaminados: ajustes_encaminados_ok,
      abierto,
      completo: abierto.length === 0,
      escritor_id,
      cerrado_en: ahora
    };
    libro.cierres.push(cierre);
    libro.por_ejercicio.set(ejercicio, cierre);
    libro.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid, ejercicio, cierre, cerrado: true, ya_cerrado: false,
        clave_natural: clave, ajustes_encaminados, abierto, completo: cierre.completo,
        irreversible: true, turno_confirmado
      }
    };
  }

  // ── REABRIR: SOLO con un AsientoAjuste. El ajuste SUMA; el cierre NO se borra ni muta. ──
  async _reabrir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');
    const ejercicio = input.ejercicio != null ? String(input.ejercicio).trim() : '';
    if (!ejercicio) return this._invalid('ejercicio');

    // GUARD de un solo escritor.
    const escritor_id = input.escritor_id != null ? String(input.escritor_id) : ROL_RECLAMANTE;
    const turno = await this._rpc('single-writer.reclamar.request',
      { project_id: pid, rol: ROL_RECLAMANTE, parcela: PARCELA, id: escritor_id }, { timeout_ms: 4000 });
    const turno_data = turno && turno.data ? turno.data : null;
    if (turno_data && turno_data.concedido === false) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor con el turno de la parcela del cierre puede reabrir el ejercicio',
        { parcela: PARCELA, dueno: turno_data.dueno ?? null, solicitante: escritor_id });
    }
    const turno_confirmado = Boolean(turno_data && turno_data.concedido === true);

    const libro = this._obtenerOCrear(pid);
    const cierre = libro.por_ejercicio.get(ejercicio) || null;
    if (!cierre) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        'no hay cierre de ese ejercicio que reabrir', { ejercicio });
    }

    // ── IRREVERSIBLE SALVO AJUSTE: sin asiento-ajuste NO se reabre. ──
    const ajuste = input.ajuste || input.asiento_ajuste || (input.solo_con && input.solo_con.ajuste) || null;
    if (!ajuste || typeof ajuste !== 'object') {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'un cierre no se reabre sin ajuste: el cierre es irreversible salvo ajuste (AsientoAjuste)',
        { ejercicio, motivo: 'reabrir_sin_ajuste' });
    }

    // El ajuste ENTRA por asiento-ajuste (B5) POR EVENTO: la corrección SUMA; el cierre se preserva.
    const r = await this._rpc('asiento-ajuste.entrar.request',
      { project_id: pid, ajuste, motivo: input.motivo != null ? String(input.motivo) : 'reapertura', correlation_id: input.correlation_id },
      { timeout_ms: 4000 });
    const encaminado = Boolean(r && r.status === 200);
    if (!encaminado) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el ajuste de reapertura no entro al libro; la reapertura NO se registra',
        { ejercicio, motivo: 'ajuste_no_encaminado' });
    }
    const clave_ajuste = (r.data && r.data.clave_correccion) || null;

    // ── APPEND-ONLY: el cierre NO se borra ni se muta; se AÑADE la marca de reapertura. ──
    const ahora = new Date().toISOString();
    const reapertura = {
      numero: libro.reaperturas.length + 1,
      ejercicio,
      clave_ajuste,
      motivo: input.motivo != null ? String(input.motivo) : 'reapertura',
      ajuste_suma: true,
      cierre_preservado: true,
      escritor_id,
      reabierto_en: ahora
    };
    libro.reaperturas.push(reapertura);
    libro.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid, ejercicio, reapertura, reabierto: true, cierre_preservado: true,
        clave_ajuste, ajuste_suma: true, turno_confirmado
      }
    };
  }

  _obtenerOCrear(pid) {
    let l = this._libros.get(pid);
    if (!l) {
      l = { esquema: 'contabilidad-cierre-ejercicio-v1', cierres: [], por_ejercicio: new Map(), reaperturas: [] };
      this._libros.set(pid, l);
      this._persist.marcarDirty(pid);
    }
    return l;
  }

  // Lectura directa (mismo proceso) — no muta. El cierre vigente de un ejercicio.
  cierreDe(pid, ejercicio) {
    const l = pid ? this._libros.get(pid) : null;
    return l && ejercicio != null ? (l.por_ejercicio.get(String(ejercicio)) || null) : null;
  }

  // ── Tools ──
  toolCerrar(params) { return this._cerrar(params); }
  toolReabrir(params) { return this._reabrir(params); }
}

module.exports = CierreEjercicio;
