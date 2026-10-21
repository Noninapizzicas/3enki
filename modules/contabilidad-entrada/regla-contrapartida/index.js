/**
 * contabilidad-entrada/regla-contrapartida — CUSTODIO CON PERSISTENCIA (A6.2, hoja del plan).
 *
 * La parcela de REGLAS DECLARABLES/APRENDIDAS ('este proveedor → esta cuenta'). UN solo
 * escritor. La regla PROPONE la contrapartida de un hecho; mientras no este declarada,
 * el sistema PREGUNTA. Y una regla APRENDIDA no actua hasta que el asesor la RATIFICA:
 * `ratificacion-regla-aprendida` (L10) emite `contabilidad.regla_ratificada`, que esta
 * hoja ESCUCHA para dejar la regla operativa o inerte.
 *
 *   · proponer — el sistema propone la contrapartida (calcula; no escribe estado).
 *   · aplicar  — se aplica la contrapartida de un hecho segun la regla vigente.
 *   · declarar — el jefe declara una regla; si nace APRENDIDA queda pendiente de ratificacion.
 *
 * Invariantes:
 *  - UN escritor por parcela (guard rol REGLA_CONTRAPARTIDA; segundo escritor → 403).
 *  - Dato ausente = desconocido: sin regla declarada NO se inventa una contrapartida.
 *  - No se borra: declarar de nuevo APPENDEA al historial; la regla guarda su autor y su fecha.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja A6.2 del plan-construccion y diseno-oop.md (CLASE ReglaContrapartida).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela de reglas de contrapartida.
const ROL_ESCRITOR = 'REGLA_CONTRAPARTIDA';

// Origenes de una regla: declarada por el humano o APRENDIDA (pendiente del gate L10).
const ORIGENES = new Set(['DECLARADA', 'APRENDIDA']);

class ReglaContrapartida extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'regla-contrapartida';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, reglas: Map<clave, Regla> }
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
        for (const r of (data.reglas || [])) if (r && r.clave != null) reglas.set(String(r.clave), r);
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

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onAplicarRequest(e) {
    return this._atender(e, 'aplicar', 'regla-contrapartida.aplicar.response', async (d) => {
      const res = this._aplicar(d);
      if (res.status !== 200) this.eventBus?.publish('regla-contrapartida.aplicar.failed', res);
      return res;
    });
  }

  onProponerRequest(e) {
    return this._atender(e, 'proponer', 'regla-contrapartida.proponer.response', async (d) => {
      const res = this._proponer(d);
      if (res.status !== 200) this.eventBus?.publish('regla-contrapartida.proponer.failed', res);
      return res;
    });
  }

  // ── handler RPC ORDEN (ui_handler: el humano declara la regla) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'regla-contrapartida.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: una regla de contrapartida quedo declarada.
        this.eventBus?.publish('contabilidad.contrapartida_regla_declarada', {
          project_id: res.data.project_id,
          clave: res.data.regla.clave,
          regla: res.data.regla,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('regla-contrapartida.declarar.failed', res);
      }
      return res;
    });
  }

  // ── handler FIRE-AND-FORGET: el asesor ratifico/bloqueo una regla aprendida (L10) ──
  // No es RPC: no publica response. Deja la regla operativa o inerte; si ESCRIBE, anuncia
  // contabilidad.contrapartida_regla_declarada (R2).
  //
  // NOTA R3: el plan declara tambien escucha de contabilidad.excepcion_desatascada (P3
  // desatasco-entrada), pero NINGUN modulo del repo lo emite AUN (grupo posterior):
  // declararlo daria cadena colgada. NO se declara hasta que su emisor exista.
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
      this.eventBus?.publish('contabilidad.contrapartida_regla_declarada', {
        project_id: pid,
        clave,
        regla,
        ratificada: regla.ratificada,
        correlation_id: d.correlation_id
      });
    } catch (err) {
      this.logger?.error(`${this.name}.regla_ratificada.error`, { error: err.message });
    }
  }

  // ── proyeccion: aplicar (PREGUNTA) — la contrapartida de un hecho segun la regla vigente ──
  _aplicar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const p = this._parcelas.get(pid) || null;
    const reglas = p ? [...p.reglas.values()] : [];
    // Solo OPERAN las reglas declaradas (no aprendidas) o las aprendidas RATIFICADAS.
    const operativas = reglas.filter(r => this._opera(r));
    const contexto = input.contexto != null ? String(input.contexto).trim() : null;

    const aplicables = operativas.filter(r => !contexto || (r.contexto != null && String(r.contexto) === contexto));
    const regla = aplicables[0] || null;

    if (!regla) {
      // Sin regla declarada NO se inventa la contrapartida: se declara abierto.
      return {
        status: 200,
        data: {
          project_id: pid, contexto, contrapartida: null, regla: null,
          aplicada: false, opera: false,
          abierto: true,
          motivo: operativas.length === 0
            ? 'no hay regla operativa declarada (las aprendidas no operan hasta ser ratificadas): el sistema pregunta'
            : 'ninguna regla operativa cubre el contexto declarado'
        }
      };
    }
    return {
      status: 200,
      data: {
        project_id: pid, contexto, contrapartida: regla.cuenta, regla,
        aplicada: true, opera: true, abierto: false, motivo: null
      }
    };
  }

  // ── proyeccion: proponer (PREGUNTA) — propone la contrapartida del hecho declarado ──
  _proponer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const p = this._parcelas.get(pid) || null;
    const reglas = p ? [...p.reglas.values()].filter(r => this._opera(r)) : [];
    const hecho = input.hecho && typeof input.hecho === 'object' ? input.hecho : null;
    const contexto = input.contexto != null ? String(input.contexto).trim()
      : (hecho && hecho.contexto != null ? String(hecho.contexto) : (hecho && hecho.proveedor != null ? String(hecho.proveedor) : null));

    const regla = reglas.find(r => !contexto || (r.contexto != null && String(r.contexto) === contexto)) || null;
    return {
      status: 200,
      data: {
        project_id: pid,
        contexto,
        propuesta: regla ? { contrapartida: regla.cuenta, regla: regla.clave } : null,
        propuesta_disponible: Boolean(regla),
        // El sistema PROPONE; el humano declara. Sin regla, la propuesta queda abierta.
        abierto: regla ? null : 'no hay regla operativa para este hecho: la propuesta queda declarada abierta (no se inventa)'
      }
    };
  }

  // ── proyeccion: declarar (ORDEN) — el jefe declara una regla ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor de la parcela (REGLA_CONTRAPARTIDA) declara reglas de contrapartida',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const r = input.regla || input.r;
    if (!r || typeof r !== 'object') return this._invalid('regla');

    const contexto = r.contexto != null ? String(r.contexto).trim() : null;
    const cuenta = r.cuenta != null ? String(r.cuenta).trim() : null;
    if (!contexto && !cuenta) return this._invalid('regla.contexto|regla.cuenta');

    const clave = this._clave(contexto, cuenta);
    if (!clave || clave === '*::*') return this._invalid('regla');

    // El ORIGEN: DECLARADA (opera ya) o APRENDIDA (no opera hasta ratificacion L10).
    const origenRaw = r.origen != null ? String(r.origen).toUpperCase().trim() : 'DECLARADA';
    const origen = ORIGENES.has(origenRaw) ? origenRaw : 'DECLARADA';
    const opera = origen === 'DECLARADA';

    const p = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();
    const existente = p.reglas.get(clave) || null;

    const regla = existente || {
      clave, contexto, cuenta, origen, opera, ratificada: false, historial: [],
      creada_en: ahora, actualizada_en: ahora
    };
    regla.contexto = contexto;
    regla.cuenta = cuenta;
    regla.origen = origen;
    regla.opera = opera;
    regla.ratificada = opera; // una declarada es acto directo del humano; una aprendida, no.
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
        // Una regla APRENDIDA queda pendiente del asesor: se DECLARA, no se asume ratificada.
        pendiente_ratificacion: origen === 'APRENDIDA',
        abierto: origen === 'APRENDIDA'
          ? 'la regla nacio APRENDIDA: no opera hasta que el asesor la ratifique (gate L10)'
          : null
      }
    };
  }

  // Una regla OPERA si es declarada, o si es aprendida y quedo ratificada.
  _opera(regla) {
    if (!regla) return false;
    if (regla.origen === 'DECLARADA') return true;
    return regla.ratificada === true;
  }

  _clave(contexto, cuenta) { return `${contexto || '*'}::${cuenta || '*'}`; }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-regla-contrapartida-v1', reglas: new Map() };
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

module.exports = ReglaContrapartida;
