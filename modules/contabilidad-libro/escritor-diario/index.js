/**
 * contabilidad-libro/escritor-diario — CUSTODIO CON PERSISTENCIA (B2, hoja del plan).
 *
 * **ES EL CUSTODIO DEL LIBRO.** El UNICO ESCRITOR DEL DIARIO. Recibe un Asiento
 * `{apuntes:Set<Apunte>, clave_natural, fecha, sociedad, ...}` y lo asienta — o lo
 * RECHAZA. Nada intermedio.
 *
 * Invariante 1 — LA PARTIDA DOBLE CUADRA: **Σ debe = Σ haber**. Un descuadre NO es un
 * estado del libro: es un ERROR. El asiento se RECHAZA ANTES DE ESCRIBIR (no se
 * matiza, no se cuadra por el usuario, no se apila un asiento torcido). Esta comprobacion
 * es la puerta: si no pasa, no hay escritura.
 *
 * Invariante 2 — UN HECHO = UN ASIENTO: la clave natural (clave-natural M3, consultada
 * POR EVENTO) gobierna la idempotencia. Reproducir el mismo hecho NO duplica: se devuelve
 * el asiento ya escrito (`registrado:false`, `ya_existe:true`).
 *
 * Invariante 4 — UN SOLO ESCRITOR: el escritor-diario pide el turno de la parcela del
 * diario a single-writer (M2) POR EVENTO y RESPETA su GUARD; si el turno es de otro, se
 * rechaza (403). El segundo escritor no escribe.
 *
 * Invariante 3 — APPEND-ONLY: el diario SOLO CRECE. No se borra ni se reescribe un
 * asiento: las correcciones SUMAN (hecho-rectificativo A13, asiento-ajuste B5).
 *
 * Invariante 5 — LA LEY ENTRA COMO DATO: no se cablea ningun tipo de asiento ni cuenta
 * legal; el escritor solo valida la FORMA (cuadre, apuntes) y guarda.
 *
 * Invariantes (operativas):
 *  - Un descuadre (Σ debe != Σ haber) → RECHAZO declarado antes de escribir.
 *  - Un asiento sin apuntes, o con apuntes malformados, → RECHAZO declarado.
 *  - Reproducir la misma clave natural → idempotente, el libro no duplica.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD (single-writer + escritor).
 * Ver hoja B2 del plan-construccion y diseno-oop.md (CLASE EscritorDiario).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// La parcela del libro. El turno lo concede single-writer (M2).
const PARCELA = 'libro/diario';
// Rol que reclama el turno en single-writer.
const ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR';
// Tolerancia del cuadre (centimo). La partida doble CUADRA o el asiento es un ERROR.
const TOLERANCIA = 0.01;

class EscritorDiario extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escritor-diario';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, asientos: [append-only], por_clave: Map<clave, numero> }
    this._libros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'escritor-diario.json',
      dir: '/contabilidad/escritor-diario',
      snapshot: (pid) => {
        const l = this._libros.get(pid);
        if (!l) return null;
        return { project_id: pid, esquema: l.esquema, asientos: l.asientos };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const asientos = Array.isArray(data.asientos) ? data.asientos : [];
        const por_clave = new Map();
        for (const a of asientos) if (a && a.clave_natural != null) por_clave.set(String(a.clave_natural), a.numero);
        this._libros.set(pid, { esquema: data.esquema || 'contabilidad-escritor-diario-v1', asientos, por_clave });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el diario del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onAsentarRequest(e) {
    return this._atender(e, 'asentar', 'escritor-diario.asentar.response', async (d) => {
      const res = await this._asentar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: un asiento quedo en el diario (o ya estaba: un hecho = un asiento).
        this.eventBus?.publish('contabilidad.asiento_registrado', {
          project_id: res.data.project_id,
          asiento: res.data.asiento,
          numero: res.data.asiento.numero,
          clave_natural: res.data.asiento.clave_natural,
          registrado: res.data.registrado,
          correlation_id: d.correlation_id
        });
      } else {
        // Descuadre, sin apuntes, segundo escritor, etc. → par determinista. Un descuadre ES un error.
        this.eventBus?.publish('escritor-diario.asentar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de escritura (EL UNICO ESCRITOR DEL DIARIO) ──
  async _asentar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const a = input.asiento || input.a;
    if (!a || typeof a !== 'object') return this._invalid('asiento');

    // ── 1 · LA FORMA: apuntes presentes y bien tipados (no se cablea ninguna cuenta). ──
    const apuntes = Array.isArray(a.apuntes) ? a.apuntes : null;
    if (!apuntes || apuntes.length === 0) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'un asiento sin apuntes no es un asiento', { motivo: 'apuntes_vacios' });
    }
    const normalizados = [];
    for (const ap of apuntes) {
      if (!ap || typeof ap !== 'object') {
        return this._errorResponse(422, 'PRECONDITION_FAILED', 'apunte malformado', { apunte: ap });
      }
      const cuenta = ap.cuenta != null ? String(ap.cuenta).trim() : '';
      if (!cuenta) {
        return this._errorResponse(422, 'PRECONDITION_FAILED', 'apunte sin cuenta', { apunte: ap });
      }
      const debe = this._num(ap.debe);
      const haber = this._num(ap.haber);
      if (debe === null || haber === null) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          'importe de apunte invalido (debe/haber)', { cuenta, debe: ap.debe, haber: ap.haber });
      }
      normalizados.push({ cuenta, debe, haber });
    }

    // ── 2 · LA PARTIDA DOBLE CUADRA: Σ debe = Σ haber. Un descuadre es ERROR, no estado. ──
    const suma_debe = this._round(normalizados.reduce((s, x) => s + x.debe, 0), 2);
    const suma_haber = this._round(normalizados.reduce((s, x) => s + x.haber, 0), 2);
    const descuadre = this._round(suma_debe - suma_haber, 2);
    if (Math.abs(descuadre) > TOLERANCIA) {
      // RECHAZO ANTES DE ESCRIBIR. El diario no admite un asiento torcido.
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el asiento no cuadra: suma debe != suma haber (la partida doble cuadra o es un error)',
        { suma_debe, suma_haber, descuadre, motivo: 'descuadre_partida_doble' });
    }

    // ── 3 · EL TURNO: se pide a single-writer (M2) POR EVENTO y se RESPETA su GUARD. ──
    const escritor_id = a.escritor_id != null ? String(a.escritor_id)
      : (input.escritor_id != null ? String(input.escritor_id) : ROL_RECLAMANTE);
    const turno = await this._rpc('single-writer.reclamar.request',
      { project_id: pid, rol: ROL_RECLAMANTE, parcela: PARCELA, id: escritor_id }, { timeout_ms: 4000 });
    const turno_data = turno && turno.data ? turno.data : null;

    if (turno_data && turno_data.concedido === false) {
      // El segundo escritor NO escribe: el turno es de otro.
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor con el turno de la parcela puede asentar en el diario',
        { parcela: PARCELA, dueno: turno_data.dueno ?? null, solicitante: escritor_id });
    }
    // Si single-writer no responde (null) → se declara el guard no confirmado y se sigue:
    // no se bloquea el libro por un timeout del guard. Se declara, no se oculta.
    const turno_confirmado = Boolean(turno_data && turno_data.concedido === true);

    // ── 4 · LA CLAVE NATURAL: idempotencia (un hecho = un asiento) via M3 POR EVENTO. ──
    let clave = a.clave_natural != null ? String(a.clave_natural) : null;
    if (!clave) {
      const r = await this._rpc('clave-natural.calcular.request', { project_id: pid, hecho: a }, { timeout_ms: 4000 });
      const cd = r && r.data ? r.data : null;
      if (cd && cd.clave != null) clave = String(cd.clave);
    }

    const libro = this._obtenerOCrear(pid);

    // Misma clave natural → ES el mismo hecho. Idempotente: no se duplica.
    if (clave && libro.por_clave.has(clave)) {
      const numero = libro.por_clave.get(clave);
      const existente = libro.asientos.find(x => x.numero === numero) || null;
      return {
        status: 200,
        data: {
          project_id: pid,
          asiento: existente,
          registrado: false,
          ya_existe: true,
          turno_confirmado,
          motivo: 'la clave natural ya esta en el diario: un hecho = un asiento'
        }
      };
    }

    // ── 5 · APPEND-ONLY: el diario SOLO CRECE. La correccion SUMA, no borra. ──
    const ahora = new Date().toISOString();
    const numero = libro.asientos.length + 1;
    const asiento = {
      numero,
      clave_natural: clave,
      fecha: a.fecha != null ? String(a.fecha) : null,
      sociedad: a.sociedad != null ? String(a.sociedad) : null,
      concepto: a.concepto != null ? String(a.concepto) : null,
      apuntes: normalizados,
      suma_debe,
      suma_haber,
      descuadre: 0,
      cuadra: true,
      escritor_id,
      traza: a.traza && typeof a.traza === 'object' ? a.traza : null,
      registrado_en: ahora
    };
    libro.asientos.push(asiento);
    if (clave) libro.por_clave.set(clave, numero);
    libro.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, asiento, registrado: true, aceptado: true, turno_confirmado }
    };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _obtenerOCrear(pid) {
    let l = this._libros.get(pid);
    if (!l) {
      l = { esquema: 'contabilidad-escritor-diario-v1', asientos: [], por_clave: new Map() };
      this._libros.set(pid, l);
      this._persist.marcarDirty(pid);
    }
    return l;
  }

  // Lectura directa del diario (mismo proceso) — no muta. Lo consumen B3/derivados.
  asientosDe(pid) {
    const l = pid ? this._libros.get(pid) : null;
    return l ? l.asientos : [];
  }

  // ── Tools ──
  toolAsentar(params) { return this._asentar(params); }
}

module.exports = EscritorDiario;
