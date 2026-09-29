/**
 * contabilidad-entrada/regla-contrapartida — CUSTODIO CON PERSISTENCIA (A6.2, hoja del plan).
 *
 * Parcela de las REGLAS DECLARABLES/APRENDIDAS de contrapartida ("este proveedor → esta
 * cuenta"). Es el CORTE DURO: lo que la hoja devuelve como `cubierta:true` es lo que se
 * puede asentar; lo que no cubre NO se inventa (queda sin propuesta y va a la cola de
 * excepcion, A8.1).
 *
 * UN SOLO ESCRITOR: el camino de aprendizaje (ratificacion desde fuera, L10 —
 * `RATIFICACION_REGLA_APRENDIDA`); cualquier otro rol es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - `aplicar` NO muta: es una consulta determinista regla→apunte (corte duro).
 *  - `proponer` es el camino de entrada del aprendizaje: append-only (las reglas se
 *    apilan; un id ya presente → 409).
 *  - La cuenta de la regla se verifica contra el plan declarado (catalogo-cuentas) por
 *    EVENTO. Si el plan dice que no existe → 422 CUENTA_FUERA_DEL_PLAN. Si el plan no
 *    esta disponible (timeout) → se acepta y se declara `cuenta_verificada:false`
 *    (nunca se asume verificado).
 *  - Dato ausente = desconocido: una condicion que el hecho no aporta NO casa.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja A6.2 del plan-construccion y diseno-oop.md (CLASE ReglaContrapartida).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor: el aprendizaje entra hidratado desde fuera (ratificacion).
const ROL_ESCRITOR = 'RATIFICACION_REGLA_APRENDIDA';

// Criterios declarables que puede llevar una condicion de regla (todos AND).
const CRITERIOS = ['tercero_nif', 'vertical', 'tipo', 'concepto_contiene'];

class ReglaContrapartida extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'regla-contrapartida';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, reglas: Map<id, Regla> }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'regla-contrapartida.json',
      dir: '/contabilidad/regla-contrapartida',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, reglas: [...p.reglas.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const reglas = new Map();
        for (const r of (data.reglas || [])) if (r && r.id != null) reglas.set(String(r.id), r);
        this._parcelas.set(pid, { esquema: data.esquema || 'contabilidad-regla-contrapartida-v1', reglas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la parcela de reglas del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onAplicarRequest(e) {
    return this._atender(e, 'aplicar', 'regla-contrapartida.aplicar.response', async (d) => {
      const res = await this._aplicar(d);
      if (res.status !== 200) this.eventBus?.publish('regla-contrapartida.aplicar.failed', res);
      return res;
    });
  }

  onProponerRequest(e) {
    return this._atender(e, 'proponer', 'regla-contrapartida.proponer.response', async (d) => {
      const res = await this._proponer(d);
      if (res.status === 200) {
        // Exito → evento de dominio: una regla quedo propuesta (la ratifica L10).
        this.eventBus?.publish('contabilidad.regla_contrapartida_propuesta', {
          project_id: res.data.project_id,
          regla: res.data.regla,
          cuenta_verificada: res.data.cuenta_verificada,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('regla-contrapartida.proponer.failed', res);
      }
      return res;
    });
  }

  // ── CORTE DURO (consulta determinista, NO muta): regla → apunte ──
  async _aplicar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = input.hecho || input.h;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const parcela = this._obtenerOCrear(pid);
    const reglas = [...parcela.reglas.values()];

    // Primera regla (en orden de entrada, determinista) cuya condicion casa el hecho.
    let motivo_ultimo = null;
    for (const regla of reglas) {
      const m = this._casa(regla.condicion, hecho);
      if (m.ok) {
        return {
          status: 200,
          data: {
            project_id: pid,
            cubierta: true,
            corte: 'regla',
            regla: { id: regla.id, condicion: regla.condicion, origen: regla.origen || null },
            apunte: {
              cuenta: regla.apunte.cuenta,
              tercero: regla.apunte.tercero != null ? regla.apunte.tercero : null,
              periodo: regla.apunte.periodo != null ? regla.apunte.periodo : this._periodoDe(hecho)
            },
            reglas_evaluadas: reglas.length
          }
        };
      }
      if (m.motivo) motivo_ultimo = m.motivo;
    }

    // Sin regla que cubra: NO se inventa la cuenta. La duda va a la cola (A8.1).
    return {
      status: 200,
      data: {
        project_id: pid,
        cubierta: false,
        corte: null,
        regla: null,
        apunte: null,
        motivo: reglas.length === 0 ? 'no hay reglas declaradas que cubran el hecho' : (motivo_ultimo || 'ninguna regla casa el hecho'),
        requiere_cola: true,
        destino_cola: 'ASESOR',
        reglas_evaluadas: reglas.length
      }
    };
  }

  // ── Escritura (UN escritor): el aprendizaje se APILA (append-only) ──
  async _proponer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: el aprendizaje entra por la ratificacion (L10).
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el camino de aprendizaje (RATIFICACION_REGLA_APRENDIDA) puede asentar reglas',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const r = input.regla || input.r;
    if (!r || typeof r !== 'object') return this._invalid('regla');

    const condicion = this._condicion(r.condicion);
    if (!condicion) return this._invalid('regla.condicion');
    const apunte = r.apunte;
    if (!apunte || typeof apunte !== 'object' || apunte.cuenta == null || String(apunte.cuenta).trim() === '') {
      return this._invalid('regla.apunte.cuenta');
    }

    const cuenta = String(apunte.cuenta).trim();
    // Verificacion contra el PLAN declarado, por EVENTO (no hay import cruzado).
    let cuenta_verificada = false;
    const plan = await this._rpc('catalogo-cuentas.buscar.request', { project_id: pid, codigo: cuenta }, { timeout_ms: 4000 });
    const plan_data = plan && plan.data ? plan.data : null;
    if (plan_data) {
      cuenta_verificada = true;
      if (plan_data.encontrada === false) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          'la cuenta no existe en el plan declarado; la regla no se asienta',
          { cuenta, project_id: pid });
      }
    }

    const id = r.id != null
      ? String(r.id)
      : `r${String(pid)}-${this._obtenerOCrear(pid).reglas.size + 1}`;

    const parcela = this._obtenerOCrear(pid);
    if (parcela.reglas.has(id)) {
      // No se sobrescribe en silencio: la parcela es append-only.
      return this._errorResponse(409, 'ALREADY_EXISTS', 'la regla ya existe; no se sobrescribe', { id });
    }

    const regla = {
      id,
      condicion,
      apunte: {
        cuenta,
        tercero: apunte.tercero != null ? String(apunte.tercero) : null,
        periodo: apunte.periodo != null ? String(apunte.periodo) : null
      },
      origen: r.origen != null ? String(r.origen) : 'APRENDIDA',
      cuenta_verificada,
      creada_en: new Date().toISOString()
    };
    parcela.reglas.set(id, regla);
    parcela.updated_at = regla.creada_en;
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, regla, cuenta_verificada, anadida: true } };
  }

  // Condicion declarable: al menos un criterio; los que lleguen se normalizan.
  _condicion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const cond = {};
    for (const c of CRITERIOS) {
      if (raw[c] === undefined || raw[c] === null || raw[c] === '') continue;
      cond[c] = String(raw[c]).toUpperCase().trim();
    }
    return Object.keys(cond).length ? cond : null;
  }

  // ¿La condicion casa el hecho? Todos los criterios son AND y deben resolverse.
  // Un criterio que el hecho no aporta NO casa (dato ausente ≠ dato coincidente).
  _casa(condicion, hecho) {
    if (!condicion || typeof condicion !== 'object') return { ok: false, motivo: 'regla sin condicion' };
    const tercero = this._nifDe(hecho);
    const mapa = {
      tercero_nif: tercero,
      vertical: hecho.vertical != null ? String(hecho.vertical).toUpperCase().trim() : null,
      tipo: hecho.tipo != null ? String(hecho.tipo).toUpperCase().trim() : null,
      concepto_contiene: hecho.concepto != null ? String(hecho.concepto).toUpperCase() : null
    };
    for (const [c, esperado] of Object.entries(condicion)) {
      const real = mapa[c];
      if (real === null || real === undefined) return { ok: false, motivo: `el hecho no aporta ${c}` };
      const casa = c === 'concepto_contiene' ? real.includes(esperado) : real === esperado;
      if (!casa) return { ok: false, motivo: `${c} no casa` };
    }
    return { ok: true };
  }

  _nifDe(hecho) {
    const t = hecho.tercero;
    const raw = (t && typeof t === 'object') ? (t.nif ?? t.numero_fiscal) : t;
    if (raw === undefined || raw === null || raw === '') return null;
    return String(raw).toUpperCase().replace(/[\s.\-_/]/g, '');
  }

  _periodoDe(hecho) {
    const f = hecho.fecha;
    if (f === undefined || f === null || f === '') return null;    // ausente → desconocido
    const s = String(f);
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-regla-contrapartida-v1', reglas: new Map() };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Lectura directa de la parcela (mismo proceso) — no muta.
  reglasDe(pid) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p ? [...p.reglas.values()] : [];
  }

  // ── Tools ──
  toolAplicar(params) { return this._aplicar(params); }
  toolProponer(params) { return this._proponer(params); }
}

module.exports = ReglaContrapartida;
