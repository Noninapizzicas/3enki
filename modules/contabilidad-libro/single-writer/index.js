/**
 * contabilidad-libro/single-writer — CUSTODIO CON PERSISTENCIA (M2, hoja del plan).
 *
 * **LA LEY** que gobierna cada custodio de contabilidad: UN SOLO ESCRITOR POR PARCELA.
 * El segundo escritor es CORRUPCION — no espera, no hace cola: se le RECHAZA en el acto.
 * Es el guard que los demas custodios consultan (`es_escritor`) y al que piden el turno
 * (`reclamar`) antes de escribir.
 *
 * Invariante 4 (un solo escritor por parcela): el dueno de una parcela se reclama UNA vez
 * y no se cede en silencio. `reclamar` sobre una parcela ya ajena NO despoja al dueno:
 * declara `concedido:false` y quien era el dueno. Jamas dos duenos a la vez.
 *
 * Es un CUSTODIO con estado: la parcela la escriben los custodios del libro (y, por
 * convencion, el escritor del diario pide el turno por evento). UN SOLO ESCRITOR del
 * registro: quien reclama con el rol del camino (RECLAMANTE_ESCRITOR); cualquier otro
 * rol es rechazado (segundo escritor del registro → 403).
 *
 * Invariantes:
 *  - Nunca dos duenos para la misma parcela: reclamar la ocupada → concedido:false.
 *  - `es_escritor` es lectura determinista (NO muta).
 *  - Reclamar la MISMA parcela por el MISMO id es idempotente (concedido:true, ya_era:true).
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja M2 del plan-construccion y diseno-oop.md (CLASE SingleWriter).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor del REGISTRO de parcelas: quien reclama un turno.
const ROL_ESCRITOR = 'RECLAMANTE_ESCRITOR';

class SingleWriter extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'single-writer';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, duenos: Map<parcela, {id, reclamado_en}> }
    this._registros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'single-writer.json',
      dir: '/contabilidad/single-writer',
      snapshot: (pid) => {
        const r = this._registros.get(pid);
        if (!r) return null;
        return { project_id: pid, esquema: r.esquema, duenos: [...r.duenos.entries()].map(([parcela, v]) => ({ parcela, ...v })) };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const duenos = new Map();
        for (const d of (data.duenos || [])) {
          if (d && d.parcela != null) duenos.set(String(d.parcela), { id: d.id ?? null, reclamado_en: d.reclamado_en ?? null });
        }
        this._registros.set(pid, { esquema: data.esquema || 'contabilidad-single-writer-v1', duenos });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el registro de duenos del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onReclamarRequest(e) {
    return this._atender(e, 'reclamar', 'single-writer.reclamar.response', async (d) => {
      const res = this._reclamar(d);
      if (res.status === 200 && res.data.concedido) {
        // Exito → evento de dominio: un escritor reclamo el turno de una parcela.
        this.eventBus?.publish('contabilidad.escritor_reclamado', {
          project_id: res.data.project_id,
          parcela: res.data.parcela,
          dueno: res.data.dueno,
          concedido: true,
          ya_era: res.data.ya_era,
          correlation_id: d.correlation_id
        });
      } else {
        // Parcela ocupada (segundo escritor = corrupcion) o payload/rol invalido → par determinista.
        this.eventBus?.publish('single-writer.reclamar.failed', res);
      }
      return res;
    });
  }

  onEsEscritorRequest(e) {
    return this._atender(e, 'es_escritor', 'single-writer.es_escritor.response', async (d) => {
      const res = this._es_escritor(d);
      if (res.status !== 200) this.eventBus?.publish('single-writer.es_escritor.failed', res);
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor del registro): reclamar el turno de una parcela ──
  _reclamar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD: solo el camino de reclamacion escribe en el registro de parcelas.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el camino de reclamacion (RECLAMANTE_ESCRITOR) puede reclamar el turno de una parcela',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const parcela = input.parcela != null ? String(input.parcela).trim() : '';
    if (!parcela) return this._invalid('parcela');
    const id = input.id != null ? String(input.id).trim() : '';
    if (!id) return this._invalid('id');

    const reg = this._obtenerOCrear(pid);
    const actual = reg.duenos.get(parcela) || null;
    const ahora = new Date().toISOString();

    // Misma parcela, mismo id → idempotente (ya era el escritor).
    if (actual && actual.id === id) {
      return {
        status: 200,
        data: { project_id: pid, parcela, concedido: true, ya_era: true, dueno: actual.id, reclamado_en: actual.reclamado_en }
      };
    }

    // Parcela ocupada por OTRO: no se despoja. El segundo escritor es corrupcion → rechazo declarado.
    if (actual) {
      return {
        status: 409,
        data: {
          project_id: pid,
          parcela,
          concedido: false,
          ya_era: false,
          dueno: actual.id,
          solicitante: id,
          motivo: 'la parcela ya tiene escritor; un segundo escritor es corrupcion'
        }
      };
    }

    const dueno = { id, reclamado_en: ahora };
    reg.duenos.set(parcela, dueno);
    reg.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, parcela, concedido: true, ya_era: false, dueno: id, reclamado_en: ahora }
    };
  }

  // ── proyeccion de lectura (NO muta): ¿es id el escritor de la parcela? ──
  _es_escritor(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const parcela = input.parcela != null ? String(input.parcela).trim() : '';
    if (!parcela) return this._invalid('parcela');
    const id = input.id != null ? String(input.id).trim() : '';
    if (!id) return this._invalid('id');

    const reg = this._obtenerOCrear(pid);
    const actual = reg.duenos.get(parcela) || null;
    const es = Boolean(actual && actual.id === id);

    return {
      status: 200,
      data: { project_id: pid, parcela, id, es_escritor: es, dueno: actual ? actual.id : null }
    };
  }

  _obtenerOCrear(pid) {
    let r = this._registros.get(pid);
    if (!r) {
      r = { esquema: 'contabilidad-single-writer-v1', duenos: new Map() };
      this._registros.set(pid, r);
      this._persist.marcarDirty(pid);
    }
    return r;
  }

  // Dueno vigente de una parcela (mismo proceso) — no muta.
  duenoDe(pid, parcela) {
    const r = pid ? this._registros.get(pid) : null;
    const v = r && parcela != null ? r.duenos.get(String(parcela)) : null;
    return v ? v.id : null;
  }

  // ── Tools ──
  toolReclamar(params) { return this._reclamar(params); }
  toolEsEscritor(params) { return this._es_escritor(params); }
}

module.exports = SingleWriter;
