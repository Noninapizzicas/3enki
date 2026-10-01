/**
 * contabilidad-libro/cambio-desde-ultima-revision — REFLEJO STATELESS (L9, hoja del plan).
 *
 * Asientos NUEVOS, AJUSTES y REGLAS CAMBIADAS desde el ultimo visto bueno. Calculo de
 * DIFERENCIA (delta) entre lo que quedo FIRMADO (flujo-firma) y lo que ha entrado despues.
 *
 * ESCUCHA los tres hechos que mueven el delta:
 *   · contabilidad.asiento_asentado  (B2 escritor-diario) — un asiento entro en el libro.
 *   · contabilidad.ajuste_entrado     (B5 asiento-ajuste)  — la correccion del asesor entro.
 *   · contabilidad.revision_firmada   (flujo-firma)        — el visto bueno MUEVE LA MARCA.
 *
 * LA MARCA ES UNA SECUENCIA, no un reloj: cada elemento anotado recibe un numero monotono y el
 * visto bueno guarda el numero vigente. El delta son los elementos con `seq` POSTERIOR a esa
 * marca. Asi dos hechos en el MISMO milisegundo no se cuelan ni se pierden (un reloj no basta:
 * la granularidad haria perder cambios justo despues de firmar).
 *
 * Invariantes:
 *  - Dato ausente = desconocido: sin revision firmada previa NO se inventa la marca; el delta se
 *    declara ABIERTO (desde el inicio) en vez de fabricar un punto de partida.
 *  - El delta es un DERIVADO en memoria (no escribe, no persiste, no muta el libro).
 *  - Determinista: mismo estado + misma marca → mismo delta.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
 * Ver hoja L9 del plan-construccion y diseno-oop.md (CLASE CambioDesdeUltimaRevision).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CambioDesdeUltimaRevision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cambio-desde-ultima-revision';
    this.version = 'reflejo-0.1.0';
    // Derivado en memoria: project_id -> { seq, marca_seq, marca_en, asientos:[], ajustes:[], reglas:[], revisiones:[] }
    this._estados = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (PREGUNTA → sin ui_handler) ──
  onDeltaRequest(e) {
    return this._atender(e, 'delta', 'cambio-desde-ultima-revision.delta.response', async (d) => {
      const res = this._delta(d);
      if (res.status !== 200) this.eventBus?.publish('cambio-desde-ultima-revision.delta.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    try { this._anotar(d, 'asientos', d.asiento || d); } catch (err) { this._logErr('asiento_asentado', err); }
  }

  onAjusteEntrado(e) {
    const d = (e && (e.data || e)) || {};
    try { this._anotar(d, 'ajustes', d.ajuste || d.asiento || d); } catch (err) { this._logErr('ajuste_entrado', err); }
  }

  onRevisionFirmada(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      if (!pid) return;
      const st = this._estado(pid);
      const ahora = d.en || new Date().toISOString();
      // El visto bueno MUEVE LA MARCA: guarda la SECUENCIA vigente; desde ahi se cuenta el delta.
      st.marca_seq = st.seq;
      st.marca_en = ahora;
      st.revisiones.push({ por: d.por != null ? String(d.por) : null, en: ahora, marca_seq: st.marca_seq });
    } catch (err) { this._logErr('revision_firmada', err); }
  }

  // ══════════════════════════════════════════════════════════════════════
  // delta() → lo nuevo desde el ultimo visto bueno
  // ══════════════════════════════════════════════════════════════════════
  _delta(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const st = this._estados.get(pid) || null;
    const marcaSeq = st ? st.marca_seq : null;
    const marcaEn = st ? st.marca_en : null;

    // Sin marca declarada NO se inventa un punto de partida: se cuenta TODO y se declara ABIERTO.
    const desde = (x) => (marcaSeq == null ? true : (x && typeof x.seq === 'number' ? x.seq > marcaSeq : true));

    const asientosNuevos = st ? st.asientos.filter(desde) : [];
    const ajustesNuevos = st ? st.ajustes.filter(desde) : [];
    const reglasCambiadas = st ? st.reglas.filter(desde) : [];

    const hayCambio = asientosNuevos.length + ajustesNuevos.length + reglasCambiadas.length > 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        marca: marcaEn,
        marca_seq: marcaSeq,
        delta: {
          asientos_nuevos: asientosNuevos,
          ajustes_nuevos: ajustesNuevos,
          reglas_cambiadas: reglasCambiadas
        },
        num_asientos: asientosNuevos.length,
        num_ajustes: ajustesNuevos.length,
        num_reglas: reglasCambiadas.length,
        hay_cambio: hayCambio,
        determinista: true,
        abierto: {
          marca: marcaSeq == null
            ? 'no hay revision firmada previa: el delta se cuenta desde el inicio y queda declarado abierto (no se inventa la marca)'
            : null
        }
      }
    };
  }

  // Anota un elemento derivado con su SECUENCIA monotona. Las "reglas cambiadas" llegan por el
  // mismo canal (campo `regla`) y se registran aparte (es lo que el asesor revisa).
  _anotar(d, clave, elemento) {
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const st = this._estado(pid);
    const ahora = d.en || new Date().toISOString();
    const seq = ++st.seq;
    const base = elemento && typeof elemento === 'object' ? { ...elemento } : { dato: elemento ?? null };
    base.en = base.en || ahora;
    base.seq = seq;
    st[clave].push(base);
    const regla = d.regla || (elemento && elemento.regla) || null;
    if (regla && typeof regla === 'object') {
      st.reglas.push({ ...regla, en: regla.en || ahora, seq: ++st.seq });
    }
  }

  _estado(pid) {
    let st = this._estados.get(pid);
    if (!st) {
      st = { seq: 0, marca_seq: null, marca_en: null, asientos: [], ajustes: [], reglas: [], revisiones: [] };
      this._estados.set(pid, st);
    }
    return st;
  }

  _logErr(op, err) {
    this.logger?.error(`${this.name}.${op}.error`, { error: err.message });
  }

  // ── Tools ──
  toolDelta(params) { return this._delta(params); }
}

module.exports = CambioDesdeUltimaRevision;
