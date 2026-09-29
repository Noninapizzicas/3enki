/**
 * contabilidad-libro/traza-asiento — CUSTODIO CON PERSISTENCIA (B4, hoja del plan).
 *
 * **EL REGISTRO INMUTABLE DE LA TRAZA.** Quién/cuándo creó cada asiento, append-only.
 * El asiento original NUNCA se borra ni se muta: si algo hay que corregir, se AÑADE
 * — la corrección SUMA. Esta marca es el rastro de autoría del libro; jamás un
 * borrado (invariante 3: el asiento original no se borra; invariante 10: los registros
 * inmutables solo crecen).
 *
 * Es un CUSTODIO con estado: un SINGLE-WRITER por la parcela `libro/traza`. Quien
 * escribe pide el turno a single-writer (M2) POR EVENTO y RESPETA su GUARD; si el
 * turno es de otro, se rechaza (403): el segundo escritor no escribe.
 *
 * Idempotencia por clave natural: la misma marca (mismo asiento + mismo autor + mismo
 * momento) NO se duplica. Reproducir una traza idéntica → `registrado:false`.
 *
 * Invariantes:
 *  - La marca es INMUTABLE: registrar no edita ninguna marca previa.
 *  - Un asiento puede tener varias marcas (se AÑADEN: creaciones, correcciones, reaperturas).
 *  - Un solo escritor por parcela (single-writer, por evento → 403 si el turno es de otro).
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja B4 del plan-construccion y diseno-oop.md (CLASE TrazaAsiento).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// La parcela de la traza. El turno lo concede single-writer (M2).
const PARCELA = 'libro/traza';
// Rol que reclama el turno en single-writer.
const ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR';

class TrazaAsiento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'traza-asiento';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, marcas: [append-only], por_clave: Map<clave, marca> }
    this._trazas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'traza-asiento.json',
      dir: '/contabilidad/traza-asiento',
      snapshot: (pid) => {
        const t = this._trazas.get(pid);
        if (!t) return null;
        return { project_id: pid, esquema: t.esquema, marcas: t.marcas };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const marcas = Array.isArray(data.marcas) ? data.marcas : [];
        const por_clave = new Map();
        for (const m of marcas) if (m && m.clave != null) por_clave.set(String(m.clave), m);
        this._trazas.set(pid, { esquema: data.esquema || 'contabilidad-traza-asiento-v1', marcas, por_clave });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la traza del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una línea, delega a _atender) ──
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'traza-asiento.registrar.response', async (d) => {
      const res = await this._registrar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: una marca de traza quedo registrada (append-only).
        this.eventBus?.publish('contabilidad.traza_registrada', {
          project_id: res.data.project_id,
          marca: res.data.marca,
          numero_asiento: res.data.marca.numero_asiento,
          quien: res.data.marca.quien,
          registrado: res.data.registrado,
          correlation_id: d.correlation_id
        });
      } else {
        // Segundo escritor, asiento ausente, etc. → par determinista.
        this.eventBus?.publish('traza-asiento.registrar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget (B2 → B4): el diario registró un asiento → se AÑADE su marca de creación.
  // La marca es un hecho NUEVO: no edita ninguna marca previa.
  onAsientoRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id || !d.asiento || d.registrado === false) return null;
    return this._registrar({
      project_id: d.project_id,
      rol: ROL_RECLAMANTE,
      id: d.asiento && d.asiento.escritor_id ? String(d.asiento.escritor_id) : ROL_RECLAMANTE,
      asiento: d.asiento,
      quien: (d.asiento && d.asiento.escritor_id) || d.escritor_id || null,
      cuando: (d.asiento && d.asiento.registrado_en) || null,
      motivo: 'creacion',
      correlation_id: d.correlation_id
    });
  }

  // ── proyección de escritura (EL REGISTRO INMUTABLE DE LA TRAZA) — APPEND-ONLY ──
  async _registrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // ── 1 · LA FORMA: el asiento y su autor existen. ──
    const asiento = input.asiento || input.a;
    if (!asiento || typeof asiento !== 'object') return this._invalid('asiento');
    const numero = asiento.numero != null ? asiento.numero : null;
    const clave_asiento = asiento.clave_natural != null ? String(asiento.clave_natural)
      : (numero != null ? String(numero) : null);
    if (clave_asiento == null) return this._invalid('asiento.numero');

    const quien = input.quien != null ? String(input.quien).trim() : '';
    if (!quien) return this._invalid('quien');
    const cuando = input.cuando != null ? String(input.cuando) : new Date().toISOString();
    const motivo = input.motivo != null ? String(input.motivo) : 'creacion';

    // ── 2 · EL TURNO: se pide a single-writer (M2) POR EVENTO y se RESPETA su GUARD. ──
    const escritor_id = input.id != null ? String(input.id) : ROL_RECLAMANTE;
    const turno = await this._rpc('single-writer.reclamar.request',
      { project_id: pid, rol: ROL_RECLAMANTE, parcela: PARCELA, id: escritor_id }, { timeout_ms: 4000 });
    const turno_data = turno && turno.data ? turno.data : null;
    if (turno_data && turno_data.concedido === false) {
      // El segundo escritor NO escribe la traza: el turno es de otro.
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor con el turno de la parcela de la traza puede registrar marcas',
        { parcela: PARCELA, dueno: turno_data.dueno ?? null, solicitante: escritor_id });
    }
    const turno_confirmado = Boolean(turno_data && turno_data.concedido === true);

    // ── 3 · IDEMPOTENCIA por clave natural de la marca: misma marca no se duplica. ──
    const clave = `${clave_asiento}#${quien}#${cuando}#${motivo}`;
    const traza = this._obtenerOCrear(pid);
    if (traza.por_clave.has(clave)) {
      const existente = traza.por_clave.get(clave);
      return {
        status: 200,
        data: { project_id: pid, marca: existente, registrado: false, ya_existe: true, turno_confirmado }
      };
    }

    // ── 4 · APPEND-ONLY: la traza SOLO CRECE. La corrección SUMA; el asiento se conserva. ──
    const marca = {
      id: traza.marcas.length + 1,
      clave,
      numero_asiento: numero,
      clave_asiento,
      quien,
      cuando,
      rol: motivo,
      motivo,
      huella: asiento.clave_natural != null ? String(asiento.clave_natural) : null,
      registrado_en: new Date().toISOString()
    };
    traza.marcas.push(marca);
    traza.por_clave.set(clave, marca);
    traza.updated_at = marca.registrado_en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, marca, registrado: true, aceptado: true, turno_confirmado }
    };
  }

  _obtenerOCrear(pid) {
    let t = this._trazas.get(pid);
    if (!t) {
      t = { esquema: 'contabilidad-traza-asiento-v1', marcas: [], por_clave: new Map() };
      this._trazas.set(pid, t);
      this._persist.marcarDirty(pid);
    }
    return t;
  }

  // Lectura directa de la traza (mismo proceso) — no muta.
  marcasDe(pid) {
    const t = pid ? this._trazas.get(pid) : null;
    return t ? t.marcas : [];
  }

  // ── Tools ──
  toolRegistrar(params) { return this._registrar(params); }
}

module.exports = TrazaAsiento;
