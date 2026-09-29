/**
 * contabilidad-libro/regla-movimiento-bancario — CUSTODIO CON PERSISTENCIA (E8, hoja del plan).
 *
 * Parcela de las REGLAS DECLARABLES/APRENDIDAS de clasificacion de MOVIMIENTOS BANCARIOS
 * ("esta comision → esta cuenta", "esta devolucion → esta cuenta"). Es el CORTE DURO del
 * extracto: lo que `aplicar` devuelve como `cubierta:true` es lo que se puede asentar; lo que
 * NO cubre NO se inventa — va a la cola / al juicio de partida-no-identificada (E7).
 *
 * EL SISTEMA NO LAS INVENTA: las reglas las declara el DUENO/ASESOR y entran por el camino de
 * aprendizaje (ratificacion unica por L10 — rol RATIFICACION_REGLA_APRENDIDA). El modulo JAMAS
 * fabrica una regla.
 *
 * UN SOLO ESCRITOR: solo el camino de aprendizaje asienta reglas; cualquier otro rol es
 * rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - `aplicar` NO muta: consulta determinista regla → apunte (misma entrada → mismo corte).
 *  - `proponer` es append-only: las reglas se APILAN; un id ya presente → 409 (no se sobrescribe).
 *  - Los CRITERIOS de una condicion (signo, concepto_contiene, importe_min/max, contraparte,
 *    cuenta) son DECLARABLES: ninguna constante cableada; un criterio que el movimiento no
 *    aporta NO casa (dato ausente = desconocido, no coincidente).
 *  - La cuenta de la regla se verifica contra el plan declarado (catalogo-cuentas B1) POR EVENTO.
 *    Si el plan dice que no existe → 422 CUENTA_FUERA_DEL_PLAN. Si el plan no responde →
 *    se acepta y se declara `cuenta_verificada:false` (nunca se asume verificado).
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja E8 del plan-construccion y diseno-oop.md (CLASE ReglaMovimientoBancario).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor: el aprendizaje entra hidratado desde fuera (ratificacion unica por L10).
const ROL_ESCRITOR = 'RATIFICACION_REGLA_APRENDIDA';

// Criterios declarables de una condicion de regla bancaria (todos AND).
// La LISTA es fija (el molde); los VALORES son ParametroDeclarable del dueno/asesor.
const CRITERIOS = ['signo', 'concepto_contiene', 'contraparte', 'cuenta', 'importe_min', 'importe_max'];

class ReglaMovimientoBancario extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'regla-movimiento-bancario';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, reglas: Map<id, Regla> }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'regla-movimiento-bancario.json',
      dir: '/contabilidad/regla-movimiento-bancario',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, reglas: [...p.reglas.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const reglas = new Map();
        for (const r of (data.reglas || [])) if (r && r.id != null) reglas.set(String(r.id), r);
        this._parcelas.set(pid, { esquema: data.esquema || 'contabilidad-regla-movimiento-bancario-v1', reglas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la parcela de reglas bancarias del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onAplicarRequest(e) {
    return this._atender(e, 'aplicar', 'regla-movimiento-bancario.aplicar.response', async (d) => {
      const res = this._aplicar(d);
      if (res.status !== 200) this.eventBus?.publish('regla-movimiento-bancario.aplicar.failed', res);
      return res;
    });
  }

  onProponerRequest(e) {
    return this._atender(e, 'proponer', 'regla-movimiento-bancario.proponer.response', async (d) => {
      const res = await this._proponer(d);
      if (res.status === 200) {
        // Exito → evento de dominio: una regla bancaria quedo declarada (la ratifica L10).
        this.eventBus?.publish('contabilidad.regla_bancaria_propuesta', {
          project_id: res.data.project_id,
          regla: res.data.regla,
          cuenta_verificada: res.data.cuenta_verificada,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('regla-movimiento-bancario.proponer.failed', res);
      }
      return res;
    });
  }

  // ── CORTE DURO (consulta determinista, NO muta): movimiento → apunte ──
  _aplicar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const movimiento = input.movimiento || input.m || input.mov;
    if (!movimiento || typeof movimiento !== 'object') return this._invalid('movimiento');

    const parcela = this._obtenerOCrear(pid);
    const reglas = [...parcela.reglas.values()];

    // Primera regla (en orden de entrada: determinista) cuya condicion casa el movimiento.
    let motivo_ultimo = null;
    for (const regla of reglas) {
      const m = this._casa(regla.condicion, movimiento);
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
              periodo: regla.apunte.periodo != null ? regla.apunte.periodo : this._periodoDe(movimiento)
            },
            reglas_evaluadas: reglas.length
          }
        };
      }
      if (m.motivo) motivo_ultimo = m.motivo;
    }

    // Sin regla que cubra: NO se inventa la cuenta. La duda va a la cola / al juicio (E7).
    return {
      status: 200,
      data: {
        project_id: pid,
        cubierta: false,
        corte: null,
        regla: null,
        apunte: null,
        motivo: reglas.length === 0
          ? 'no hay reglas declaradas que cubran el movimiento'
          : (motivo_ultimo || 'ninguna regla casa el movimiento'),
        requiere_cola: true,
        destino_cola: 'ASESOR',
        reglas_evaluadas: reglas.length
      }
    };
  }

  // ── Escritura (UN escritor): la regla se APILA (append-only) ──
  async _proponer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: el sistema NO inventa reglas; entran por la ratificacion (L10).
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el camino de aprendizaje (RATIFICACION_REGLA_APRENDIDA) puede asentar reglas bancarias',
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
      : `rb${String(pid)}-${this._obtenerOCrear(pid).reglas.size + 1}`;

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
      if (c === 'importe_min' || c === 'importe_max') {
        const n = Number(raw[c]);
        if (Number.isFinite(n)) cond[c] = n;
        continue;
      }
      if (c === 'signo') { cond[c] = String(raw[c]).toLowerCase().trim(); continue; }
      cond[c] = String(raw[c]).toUpperCase().trim();
    }
    return Object.keys(cond).length ? cond : null;
  }

  // ¿La condicion casa el movimiento? Todos los criterios son AND y deben resolverse.
  // Un criterio que el movimiento no aporta NO casa (dato ausente ≠ dato coincidente).
  _casa(condicion, movimiento) {
    if (!condicion || typeof condicion !== 'object') return { ok: false, motivo: 'regla sin condicion' };
    const importe = this._num(movimiento.importe);
    const mapa = {
      signo: movimiento.signo != null ? String(movimiento.signo).toLowerCase().trim() : null,
      concepto_contiene: movimiento.concepto != null ? String(movimiento.concepto).toUpperCase() : null,
      contraparte: movimiento.contraparte != null ? String(movimiento.contraparte).toUpperCase().replace(/[\s.\-_/]/g, '') : null,
      cuenta: movimiento.cuenta != null ? String(movimiento.cuenta).trim() : null,
      importe_min: importe,
      importe_max: importe
    };
    for (const [c, esperado] of Object.entries(condicion)) {
      const real = mapa[c];
      if (real === null || real === undefined) return { ok: false, motivo: `el movimiento no aporta ${c}` };
      let casa;
      if (c === 'concepto_contiene') casa = real.includes(esperado);
      else if (c === 'importe_min') casa = real >= esperado;
      else if (c === 'importe_max') casa = real <= esperado;
      else casa = real === esperado;
      if (!casa) return { ok: false, motivo: `${c} no casa` };
    }
    return { ok: true };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _periodoDe(movimiento) {
    const f = movimiento.fecha;
    if (f === undefined || f === null || f === '') return null;    // ausente → desconocido
    const s = String(f);
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-regla-movimiento-bancario-v1', reglas: new Map() };
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

module.exports = ReglaMovimientoBancario;
