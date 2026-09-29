/**
 * contabilidad-analitica/aislamiento-negocio — CUSTODIO CON PERSISTENCIA (I4, hoja del plan).
 *
 * INVARIANTE DURA: UN NEGOCIO NO VE OTRO. Esta parcela garantiza que los datos de un negocio
 * NO se fugan a otro. Es el eje del aislamiento multi-negocio (espejo de G7: eje negocio ↔ eje
 * persona). UN solo dueño por parcela y UN solo escritor.
 *
 * ATRIBUTOS del diseno: `parcelas:Map<Negocio,Parcela>`.
 *   METODOS:
 *     parcela(negocio):Parcela  → abre/devuelve la parcela de un negocio. CONTROL DE ACCESO:
 *         solo el propio negocio (o su escritor reclamado) obtiene su parcela; pedir la de otro
 *         negocio → RECHAZADO (403). El aislamiento no es una convencion: es un guard.
 *     escritor(negocio):Id      → RECLAMA (o devuelve) el UNICO escritor de la parcela. El
 *         segundo escritor NO espera ni hace cola: se rechaza (403). Un solo escritor por parcela.
 *
 * Ninguna parcela se abre con un negocio ausente: sin negocio declarado → `[ABIERTO]` (no se
 * crea una parcela huerfana a la que luego cualquiera pueda asomarse). Nada se estima y jamas se
 * mezclan dos negocios en una misma parcela.
 *
 * Invariantes:
 *  - UN NEGOCIO NO SE FUGA A OTRO: toda lectura de parcela ajena → 403; toda parcela es de un
 *    negocio y solo de ese.
 *  - UN SOLO ESCRITOR por parcela: reclamado una vez; reclamarlo desde otro actor → 403.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja I4 del plan-construccion y diseno-oop.md (CLASE AislamientoNegocio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class AislamientoNegocio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aislamiento-negocio';
    this.version = 'reflejo-0.1.0';
    // store: project_id → Map<negocio_id, Parcela>
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'aislamiento-negocio.json',
      dir: '/contabilidad/aislamiento-negocio',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: 'contabilidad-aislamiento-negocio-v1', parcelas: [...p.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const m = new Map();
        for (const par of (data.parcelas || [])) {
          if (par && par.negocio != null) m.set(String(par.negocio), par);
        }
        this._parcelas.set(pid, m);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las parcelas del proyecto activado (multi-negocio sin fuga).
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onParcelaRequest(e) {
    return this._atender(e, 'parcela', 'aislamiento-negocio.parcela.response', async (d) => {
      const res = await this._parcela(d);
      if (res.status === 200) {
        // Exito → evento de dominio: una parcela quedo reclamada por su negocio.
        this.eventBus?.publish('contabilidad.parcela_reclamada', {
          project_id: res.data.project_id,
          negocio: res.data.parcela.negocio,
          escritor: res.data.parcela.escritor,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('aislamiento-negocio.parcela.failed', res);
      }
      return res;
    });
  }

  onEscritorRequest(e) {
    return this._atender(e, 'escritor', 'aislamiento-negocio.escritor.response', async (d) => {
      const res = await this._escritor(d);
      if (res.status === 200) {
        if (res.data.reclamado) {
          this.eventBus?.publish('contabilidad.parcela_reclamada', {
            project_id: res.data.project_id,
            negocio: res.data.negocio,
            escritor: res.data.escritor,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('aislamiento-negocio.escritor.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion: parcela(negocio) → Parcela · GUARD de aislamiento ──
  _parcela(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const negocio = this._clave(input.negocio != null ? input.negocio : input.negocio_id);
    // Sin negocio NO se abre parcela: una parcela huerfana seria una puerta a todo.
    if (negocio === null) return this._invalid('negocio');

    // GUARD DE AISLAMIENTO: un negocio NO ve otro. Si quien pide declara otro negocio → 403.
    const solicitante = this._clave(input.solicitante_negocio != null ? input.solicitante_negocio : input.negocio);
    if (solicitante !== null && solicitante !== negocio) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'un negocio no ve otro negocio: la parcela solicitada pertenece a otro',
        { negocio: solicitante, parcela: negocio, aislamiento: 'negocio↔negocio' });
    }

    // El ESCRITOR declarado, si quien pide ya actua como tal, tambien debe ser el reclamado.
    const escritorPide = input.escritor != null ? String(input.escritor) : null;
    const par = this._obtener(pid, negocio);
    if (escritorPide !== null && par.escritor !== null && par.escritor !== escritorPide) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'la parcela tiene un unico escritor reclamado: este actor no es el dueno',
        { negocio, escritor_reclamado: par.escritor, escritor_recibido: escritorPide });
    }

    par.accesos = Array.isArray(par.accesos) ? par.accesos : [];
    par.accesos.push({ en: new Date().toISOString(), por: solicitante });
    if (par.accesos.length > 500) par.accesos.splice(0, par.accesos.length - 500);
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        parcela: par,
        aislada: true,
        motivo: null
      }
    };
  }

  // ── proyeccion: escritor(negocio) → Id · GUARD de UN SOLO ESCRITOR ──
  _escritor(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const negocio = this._clave(input.negocio != null ? input.negocio : input.negocio_id);
    if (negocio === null) return this._invalid('negocio');

    const actor = input.escritor != null ? String(input.escritor)
      : (input.rol != null ? String(input.rol) : null);
    if (actor === null || actor === '') return this._invalid('escritor');

    const par = this._obtener(pid, negocio);

    // Ya reclamado por OTRO actor: el segundo escritor NO espera ni hace cola → 403.
    if (par.escritor !== null && par.escritor !== actor) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'la parcela ya tiene un unico escritor: el segundo escritor no espera ni hace cola',
        { negocio, escritor_reclamado: par.escritor, escritor_recibido: actor });
    }

    const ya_era = par.escritor === actor;
    if (!ya_era) {
      par.escritor = actor;
      par.escritor_desde = new Date().toISOString();
      this._persist.marcarDirty(pid);
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio,
        escritor: par.escritor,
        reclamado: !ya_era,
        ya_era,
        // La parcela queda declarada con UN dueño claro.
        parcelas_del_proyecto: this._parcelas.get(pid) ? this._parcelas.get(pid).size : 0
      }
    };
  }

  _obtener(pid, negocio) {
    let m = this._parcelas.get(pid);
    if (!m) { m = new Map(); this._parcelas.set(pid, m); }
    let par = m.get(negocio);
    if (!par) {
      par = {
        negocio,
        escritor: null,
        escritor_desde: null,
        creada_en: new Date().toISOString(),
        accesos: []
      };
      m.set(negocio, par);
      this._persist.marcarDirty(pid);
    }
    return par;
  }

  _clave(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return this._clave(v.id ?? v.nombre ?? v.negocio);
    return String(v);
  }

  // Lectura directa (mismo proceso) — no muta. Solo devuelve LA parcela de ese negocio.
  parcelaDe(pid, negocio) {
    const m = pid ? this._parcelas.get(pid) : null;
    return m ? (m.get(String(negocio)) || null) : null;
  }

  // ── Tools ──
  toolParcela(params) { return this._parcela(params); }
  toolEscritor(params) { return this._escritor(params); }
}

module.exports = AislamientoNegocio;
