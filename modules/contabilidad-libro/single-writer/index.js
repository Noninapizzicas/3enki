/**
 * contabilidad-libro/single-writer — CUSTODIO CON PERSISTENCIA (M2, hoja del plan).
 *
 * 🧱 **UNA DE LAS 3 PIEZAS ANTI-BUCLE DEL DOMINIO. LA LEY DE ESCRITURA.**
 *
 * La LEY que gobierna cada Custodio: UN SOLO ESCRITOR por parcela. El segundo escritor
 * NO espera ni hace cola — se RECHAZA: dos escritores sobre la misma parcela = corrupcion.
 * Cada custodia (el libro, la traza, el cierre, la firma, el expediente…) RECLAMA su parcela
 * aqui antes de escribir, y pregunta `es_escritor` para saber si sigue siendolo.
 *
 *   · reclamar    — pide la parcela para un escritor. Libre → se concede y se ANUNCIA el
 *                   hecho `contabilidad.parcela_reclamada`. Ya del mismo escritor → idempotente.
 *                   De OTRO escritor → 409 SEGUNDO_ESCRITOR (no se roba la parcela).
 *   · es_escritor — PREGUNTA: ¿este escritor es quien tiene la parcela? Deriva, no muta.
 *
 * Invariante: dato ausente = desconocido. Sin parcela o sin escritor NO se concede nada
 * (no se inventa un titular). La parcela NO se libera sola: su titular sigue siendolo.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + ley de un escritor.
 * Ver hoja M2 del plan-construccion y diseno-oop.md (CLASE SingleWriter).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class SingleWriter extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'single-writer';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, parcelas: Map<parcela, { escritor, reclamada_en }> }
    this._libros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'single-writer.json',
      dir: '/contabilidad/single-writer',
      snapshot: (pid) => {
        const l = this._libros.get(pid);
        if (!l) return null;
        return { project_id: pid, esquema: l.esquema, parcelas: [...l.parcelas.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const parcelas = new Map();
        for (const p of (data.parcelas || [])) {
          if (p && p.parcela != null) parcelas.set(String(p.parcela), p);
        }
        this._libros.set(pid, { esquema: data.esquema || 'contabilidad-single-writer-v1', parcelas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la ley de escritura del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea cada uno, delegan a _atender) ──
  onReclamarRequest(e) {
    return this._atender(e, 'reclamar', 'single-writer.reclamar.response', async (d) => {
      const res = this._reclamar(d);
      if (res.status === 200) {
        if (res.data.reclamada === true) {
          // R2 · si ESCRIBE (concede una parcela nueva), anuncia el HECHO.
          this.eventBus?.publish('contabilidad.parcela_reclamada', {
            project_id: res.data.project_id,
            parcela: res.data.parcela,
            escritor: res.data.escritor,
            reclamada_en: res.data.reclamada_en,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('single-writer.reclamar.failed', res);
      }
      return res;
    });
  }

  onEsEscritorRequest(e) {
    return this._atender(e, 'es_escritor', 'single-writer.es_escritor.response', async (d) => {
      const res = this._es_escritor(d);
      // PREGUNTA: deriva; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('single-writer.es_escritor.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // reclamar(parcela, escritor) → concesion (UN SOLO ESCRITOR; el segundo se rechaza)
  // ══════════════════════════════════════════════════════════════════════
  _reclamar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const parcela = input.parcela != null ? String(input.parcela).trim()
      : (input.parcela_id != null ? String(input.parcela_id).trim() : '');
    if (!parcela) return this._invalid('parcela');

    const escritor = input.escritor != null ? String(input.escritor).trim()
      : (input.modulo != null ? String(input.modulo).trim()
        : (input.rol != null ? String(input.rol).trim() : ''));
    if (!escritor) return this._invalid('escritor');

    const libro = this._obtenerOCrear(pid);
    const titular = libro.parcelas.get(parcela) || null;

    // Parcela ya con titular: el MISMO escritor re-reclama (idempotente); OTRO se RECHAZA.
    if (titular) {
      if (titular.escritor === escritor) {
        return {
          status: 200,
          data: {
            project_id: pid, parcela, escritor,
            reclamada: false, ya_era: true, unico_escritor: true,
            reclamada_en: titular.reclamada_en,
            motivo: 'el mismo escritor ya tenia la parcela (la ley no duplica)'
          }
        };
      }
      // SEGUNDO ESCRITOR: no espera ni hace cola. Dos escritores sobre la parcela = corrupcion.
      return this._errorResponse(409, 'SEGUNDO_ESCRITOR',
        'la parcela ya tiene un escritor: un segundo escritor sobre la misma parcela es corrupcion',
        { project_id: pid, parcela, titular: titular.escritor, pretendiente: escritor, reclamada_en: titular.reclamada_en });
    }

    // ── La parcela estaba LIBRE: se concede a este escritor (y el libro SOLO crece) ──
    const ahora = new Date().toISOString();
    const concesion = { parcela, escritor, reclamada_en: ahora };
    libro.parcelas.set(parcela, concesion);
    libro.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid, parcela, escritor,
        reclamada: true, ya_era: false, unico_escritor: true,
        reclamada_en: ahora,
        total_parcelas: libro.parcelas.size
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // es_escritor(parcela, escritor) → bool (PREGUNTA: ¿tiene la parcela?) — no muta
  // ══════════════════════════════════════════════════════════════════════
  _es_escritor(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const parcela = input.parcela != null ? String(input.parcela).trim()
      : (input.parcela_id != null ? String(input.parcela_id).trim() : '');
    if (!parcela) return this._invalid('parcela');

    const escritor = input.escritor != null ? String(input.escritor).trim()
      : (input.modulo != null ? String(input.modulo).trim()
        : (input.rol != null ? String(input.rol).trim() : ''));
    if (!escritor) return this._invalid('escritor');

    const libro = this._obtenerOCrear(pid);
    const titular = libro.parcelas.get(parcela) || null;

    return {
      status: 200,
      data: {
        project_id: pid,
        parcela,
        escritor,
        // Sin titular declarado, nadie es escritor: la parcela sigue libre (no se asume).
        es_escritor: Boolean(titular && titular.escritor === escritor),
        titular: titular ? titular.escritor : null,
        libre: titular === null,
        reclamada_en: titular ? titular.reclamada_en : null,
        abierto: { parcela: titular ? null : 'la parcela no esta reclamada por nadie: ningun escritor la tiene (no se asume)' }
      }
    };
  }

  _obtenerOCrear(pid) {
    let l = this._libros.get(pid);
    if (!l) {
      l = { esquema: 'contabilidad-single-writer-v1', parcelas: new Map() };
      this._libros.set(pid, l);
      this._persist.marcarDirty(pid);
    }
    return l;
  }

  // Lectura directa de la ley (mismo proceso) — no muta. Para el panel / la inspeccion.
  titularDe(pid, parcela) {
    const l = pid ? this._libros.get(pid) : null;
    if (!l) return null;
    return l.parcelas.get(String(parcela)) || null;
  }

  parcelasDe(pid) {
    const l = pid ? this._libros.get(pid) : null;
    return l ? [...l.parcelas.values()] : [];
  }

  // ── Tools ──
  toolReclamar(params) { return this._reclamar(params); }
  toolEsEscritor(params) { return this._es_escritor(params); }
}

module.exports = SingleWriter;
