/**
 * contabilidad-libro/regla-movimiento-bancario — CUSTODIO CON PERSISTENCIA (E8, hoja del plan).
 *
 * La parcela de REGLAS DECLARABLES/APRENDIDAS del banco ('esta comision -> esta cuenta').
 * UN escritor. La regla PROPONE/APLICA la contrapartida de un movimiento bancario; mientras
 * no exista, el sistema PREGUNTA. Una regla APRENDIDA no actua hasta que el asesor la
 * RATIFICA: `ratificacion-regla-aprendida` (L10) emite `contabilidad.regla_ratificada`, que
 * esta hoja ESCUCHA. Ratificacion UNICA por L10 (un solo gate humano para todo el dominio).
 *
 *   · declarar — el jefe declara una regla; si nace APRENDIDA queda pendiente de ratificacion.
 *   · proponer — el sistema propone la contrapartida del movimiento (calcula; no escribe).
 *   · aplicar  — la contraparida del movimiento segun la regla vigente (calcula; no escribe).
 *
 * Invariantes:
 *  - UN escritor por parcela (guard rol REGLA_MOVIMIENTO_BANCARIO; segundo escritor → 403).
 *  - Dato ausente = desconocido: sin regla declarada NO se inventa la contrapartida.
 *  - No se borra: re-declarar APPENDEA al historial; la regla guarda su autor y su fecha.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R2 · ESCRIBE → ANUNCIA: al declarar publica `contabilidad.movimiento_regla_declarada`.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja E8 del plan-construccion y diseno-oop.md (CLASE ReglaMovimientoBancario).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela de reglas de movimiento bancario.
const ROL_ESCRITOR = 'REGLA_MOVIMIENTO_BANCARIO';
const ORIGENES = new Set(['DECLARADA', 'APRENDIDA']);

class ReglaMovimientoBancario extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'regla-movimiento-bancario';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, reglas: Map<clave, Regla> }
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
        for (const r of (data.reglas || [])) if (r && r.clave != null) reglas.set(String(r.clave), r);
        this._parcelas.set(pid, { esquema: data.esquema || 'contabilidad-regla-movimiento-bancario-v1', reglas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC PREGUNTA (sin ui_handler): aplicar ──
  onAplicarRequest(e) {
    return this._atender(e, 'aplicar', 'regla-movimiento-bancario.aplicar.response', async (d) => {
      const res = this._aplicar(d);
      if (res.status !== 200) this.eventBus?.publish('regla-movimiento-bancario.aplicar.failed', res);
      return res;
    });
  }

  // ── handler RPC PREGUNTA (sin ui_handler): proponer ──
  onProponerRequest(e) {
    return this._atender(e, 'proponer', 'regla-movimiento-bancario.proponer.response', async (d) => {
      const res = this._proponer(d);
      if (res.status !== 200) this.eventBus?.publish('regla-movimiento-bancario.proponer.failed', res);
      return res;
    });
  }

  // ── handler RPC ORDEN (ui_handler: el asesor declara la regla) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'regla-movimiento-bancario.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO.
        this.eventBus?.publish('contabilidad.movimiento_regla_declarada', {
          project_id: res.data.project_id,
          clave: res.data.clave,
          regla: res.data.regla,
          correlation_id: d.correlation_id
        });
        // Una regla APRENDIDA sube la peticion al gate humano L10 (best-effort).
        if (res.data.pendiente_ratificacion) {
          this._rpc('ratificacion-regla-aprendida.ratificar.request', {
            project_id: res.data.project_id, regla: res.data.clave, origen: 'regla-movimiento-bancario'
          }, { timeout_ms: 2000 });
        }
      } else {
        this.eventBus?.publish('regla-movimiento-bancario.declarar.failed', res);
      }
      return res;
    });
  }

  // ── handler FIRE-AND-FORGET: el asesor ratifico/bloqueo la regla aprendida (L10) ──
  onReglaRatificada(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      if (!pid) return;
      const clave = d.regla != null ? String(d.regla) : null;
      if (!clave) return;

      const p = this._parcelas.get(pid);
      const regla = p ? (p.reglas.get(clave) || null) : null;
      if (!regla) return; // sin regla registrada no se inventa nada

      const ahora = new Date().toISOString();
      regla.ratificada = d.actua === true;
      regla.ratificada_en = ahora;
      regla.ratificada_por = d.por != null ? String(d.por) : null;
      regla.ratificada_decision = d.decision != null ? String(d.decision) : null;
      regla.historial = Array.isArray(regla.historial) ? regla.historial : [];
      regla.historial.push({ estado: regla.ratificada ? 'RATIFICADA' : 'BLOQUEADA', por: regla.ratificada_por, en: ahora });

      p.reglas.set(clave, regla);
      p.updated_at = ahora;
      this._persist.marcarDirty(pid);

      // R2 · la regla cambio de estado → anuncia el hecho.
      this.eventBus?.publish('contabilidad.movimiento_regla_declarada', {
        project_id: pid, clave, regla, ratificada: regla.ratificada, correlation_id: d.correlation_id
      });
      // Si la regla quedo OPERATIVA, el movimiento bancario puede contabilizarse (best-effort).
      if (regla.ratificada) {
        this.eventBus?.publish('escritor-diario.asentar.request', {
          project_id: pid, asiento: regla.asiento || null, origen: 'regla-movimiento-bancario', correlation_id: d.correlation_id
        });
      }
    } catch (err) {
      this.logger?.error(`${this.name}.regla_ratificada.error`, { error: err.message });
    }
  }

  // ── proyeccion PREGUNTA: aplicar — la contrapartida del movimiento segun la regla vigente ──
  _aplicar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const p = this._parcelas.get(pid) || null;
    const operativas = p ? [...p.reglas.values()].filter((r) => this._opera(r)) : [];
    const contexto = this._contexto(input);
    const regla = operativas.find((r) => !contexto || (r.contexto != null && String(r.contexto) === contexto)) || null;

    if (!regla) {
      return {
        status: 200,
        data: {
          project_id: pid, contexto, contrapartida: null, regla: null,
          aplicada: false, opera: false, abierto: true,
          motivo: operativas.length === 0
            ? 'no hay regla operativa declarada (las aprendidas no operan hasta ser ratificadas): el sistema pregunta'
            : 'ninguna regla operativa cubre el movimiento declarado'
        }
      };
    }
    return {
      status: 200,
      data: { project_id: pid, contexto, contrapartida: regla.cuenta, regla, aplicada: true, opera: true, abierto: false, motivo: null }
    };
  }

  // ── proyeccion PREGUNTA: proponer — propone la contrapartida del movimiento ──
  _proponer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const p = this._parcelas.get(pid) || null;
    const operativas = p ? [...p.reglas.values()].filter((r) => this._opera(r)) : [];
    const movimiento = input.movimiento && typeof input.movimiento === 'object' ? input.movimiento : null;
    const contexto = this._contexto(input, movimiento);
    const regla = operativas.find((r) => !contexto || (r.contexto != null && String(r.contexto) === contexto)) || null;

    return {
      status: 200,
      data: {
        project_id: pid,
        contexto,
        propuesta: regla ? { contrapartida: regla.cuenta, regla: regla.clave } : null,
        propuesta_disponible: Boolean(regla),
        abierto: regla ? null : 'no hay regla operativa para este movimiento: la propuesta queda declarada abierta (no se inventa)'
      }
    };
  }

  // ── proyeccion ORDEN: declarar — el jefe declara una regla ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor de la parcela (REGLA_MOVIMIENTO_BANCARIO) declara reglas de movimiento bancario',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const r = input.regla || input.r;
    if (!r || typeof r !== 'object') return this._invalid('regla');

    const contexto = r.contexto != null ? String(r.contexto).trim() : null;
    const cuenta = r.cuenta != null ? String(r.cuenta).trim() : null;
    if (!contexto && !cuenta) return this._invalid('regla.contexto|regla.cuenta');

    const clave = this._clave(contexto, cuenta);
    if (!clave || clave === '*::*') return this._invalid('regla');

    const origenRaw = r.origen != null ? String(r.origen).toUpperCase().trim() : 'DECLARADA';
    const origen = ORIGENES.has(origenRaw) ? origenRaw : 'DECLARADA';
    const opera = origen === 'DECLARADA';

    const p = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();
    const existente = p.reglas.get(clave) || null;

    const regla = existente || { clave, contexto, cuenta, origen, opera, ratificada: false, historial: [], creada_en: ahora };
    regla.contexto = contexto;
    regla.cuenta = cuenta;
    regla.origen = origen;
    regla.opera = opera;
    regla.ratificada = opera;
    regla.asiento = r.asiento || (existente ? existente.asiento : null) || null;
    regla.historial = Array.isArray(regla.historial) ? regla.historial : [];
    regla.historial.push({ estado: origen, por: ROL_ESCRITOR, en: ahora });
    regla.actualizada_en = ahora;

    p.reglas.set(clave, regla);
    p.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid, clave, regla, declarada: true,
        pendiente_ratificacion: origen === 'APRENDIDA',
        abierto: origen === 'APRENDIDA'
          ? 'la regla nacio APRENDIDA: no opera hasta que el asesor la ratifique (gate L10)'
          : null
      }
    };
  }

  _opera(regla) {
    if (!regla) return false;
    if (regla.origen === 'DECLARADA') return true;
    return regla.ratificada === true;
  }

  _contexto(input, movimiento = null) {
    if (input.contexto != null) return String(input.contexto).trim();
    const m = movimiento || (input.movimiento && typeof input.movimiento === 'object' ? input.movimiento : null);
    if (m) {
      if (m.contexto != null) return String(m.contexto);
      if (m.concepto != null) return String(m.concepto);
      if (m.descripcion != null) return String(m.descripcion);
    }
    return null;
  }

  _clave(contexto, cuenta) { return `${contexto || '*'}::${cuenta || '*'}`; }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-regla-movimiento-bancario-v1', reglas: new Map() };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // ── Tools ──
  toolAplicar(params) { return this._aplicar(params); }
  toolProponer(params) { return this._proponer(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = ReglaMovimientoBancario;
