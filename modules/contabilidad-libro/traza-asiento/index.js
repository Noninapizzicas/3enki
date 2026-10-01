/**
 * contabilidad-libro/traza-asiento — CUSTODIO CON PERSISTENCIA (B4, hoja del plan).
 *
 * Registro INMUTABLE (quién/cuándo creó cada asiento) — append-only. UN escritor.
 *   != `historial-proceso-contable` (P2), que registra el PROCESO DE ENTRADA, no el asiento.
 *
 * Invariantes:
 *  - APPEND-ONLY: cada traza se APILA con su secuencia; NADA se borra, NADA se sobrescribe.
 *  - Exige su ASIENTO (asiento_id): sin asiento NO se anota (no se aprime una traza de nada).
 *  - El ABIERTO se declara, no se oculta: una traza sin autor se apila con su hueco.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R3 · ESCUCHA (la deriva que se EVITA): el plan declara escucha de `contabilidad.asiento_asentado`
 * (escritor-diario B2) y `contabilidad.ajuste_entrado` (asiento-ajuste). NINGÚN módulo del repo los
 * emite AÚN (escritor-diario/asiento-ajuste son de grupos posteriores): declararlos daría cadena
 * colgada (R3 deriva), así que NO se declaran hasta que su emisor exista. El gate del ADN lo confirma.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + APPEND-ONLY + UN escritor.
 * Ver hoja B4 del plan-construccion y diseno-oop.md (CLASE TrazaAsiento).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class TrazaAsiento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'traza-asiento';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, registros: [append-only] }
    this._trazas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'traza-asiento.json',
      dir: '/contabilidad/traza-asiento',
      snapshot: (pid) => {
        const t = this._trazas.get(pid);
        return t ? { project_id: pid, esquema: t.esquema, registros: t.registros } : null;
      },
      hidratar: (pid, data) => {
        if (!data) return;
        this._trazas.set(pid, {
          esquema: data.esquema || 'contabilidad-traza-asiento-v1',
          registros: Array.isArray(data.registros) ? data.registros : []
        });
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

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → panel ──
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'traza-asiento.registrar.response', async (d) => {
      const res = this._registrar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: el asiento quedo trazado (append-only).
        this.eventBus?.publish('contabilidad.traza_registrada', {
          project_id: res.data.project_id,
          asiento_id: res.data.registro.asiento_id,
          traza: res.data.registro,
          registrada: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('traza-asiento.registrar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de lectura (NO muta) ──
  _obtenerOCrear(pid) {
    let t = this._trazas.get(pid);
    if (!t) {
      t = { esquema: 'contabilidad-traza-asiento-v1', registros: [] };
      this._trazas.set(pid, t);
      this._persist.marcarDirty(pid);
    }
    return t;
  }

  // Traza completa del proyecto (mismo proceso) — solo lectura.
  trazaDe(pid) {
    const t = pid ? this._trazas.get(pid) : null;
    return t ? [...t.registros] : [];
  }

  // Traza de UN asiento concreto (mismo proceso) — solo lectura.
  trazaDeAsiento(pid, asiento_id) {
    const id = asiento_id != null ? String(asiento_id) : null;
    return this.trazaDe(pid).filter((r) => r.asiento_id === id);
  }

  // ── proyeccion de escritura — APPEND-ONLY ──
  _registrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const asiento_id = input.asiento_id != null ? String(input.asiento_id).trim() : '';
    if (!asiento_id) return this._invalid('asiento_id');

    const t = this._obtenerOCrear(pid);
    const en = input.en != null ? String(input.en) : new Date().toISOString();

    // Append-only: la traza se apila con su secuencia; NUNCA se sobrescribe.
    const registro = {
      id: `${pid}-t${t.registros.length + 1}`,
      secuencia: t.registros.length + 1,
      asiento_id,
      accion: input.accion != null ? String(input.accion) : 'asentar',
      actor: input.actor != null ? String(input.actor) : null,
      rol: input.rol != null ? String(input.rol) : null,
      detalle: input.detalle && typeof input.detalle === 'object' ? input.detalle : null,
      en
    };
    t.registros.push(registro);
    t.updated_at = en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        registro,
        registrada: true,
        total: t.registros.length,
        // NADA se borra: la traza SOLO crece.
        append_only: true,
        abierto: {
          actor: registro.actor ? null : 'la traza no declaró el autor (se anota el hueco, no se inventa)'
        }
      }
    };
  }

  // ── Tools ──
  toolRegistrar(params) { return this._registrar(params); }
}

module.exports = TrazaAsiento;
