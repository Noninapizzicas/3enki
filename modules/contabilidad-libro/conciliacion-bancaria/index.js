/**
 * contabilidad-libro/conciliacion-bancaria — REFLEJO STATELESS (E1, hoja del plan).
 *
 * CRUCE extracto ↔ diario POR CLAVE NATURAL DETERMINISTA. Toma los movimientos del banco
 * (los que entraron normalizados por puerto-extracto E2) y los aparea con los apuntes/asientos
 * del diario (escritor-diario B2), aplicando las REGLAS declaradas (regla-movimiento-bancario
 * E8) como corte duro. Calculo PURO: misma entrada → mismo resultado.
 *
 * El JUICIO ESTA AISLADO EN OTRA HOJA: lo que NO casa NO se interpreta aqui. Este reflejo
 * NO adivina a que corresponde una descripcion ambigua del banco — eso es competencia EXCLUSIVA
 * de `partida-no-identificada` (E7, MICRO-AGENTE). Aqui solo se producen tres cubos:
 *   - casados      (aparicion determinista por clave natural o por regla)
 *   - sin_contrapartida (movimiento del banco que no tiene apunte en el diario → va a E7)
 *   - sin_movimiento    (apunte del diario sin movimiento bancario en el periodo)
 *
 * Invariantes:
 *  - DETERMINISTA: mismo extracto + mismo diario + mismas reglas → mismo resultado.
 *  - El corte por regla LEE el corte duro de E8 POR EVENTO; si E8 no responde, se declara
 *    `reglas_disponibles:false` y solo se cruza por clave natural (no se inventa la regla).
 *  - NO escribe, NO persiste, NO muta: es un reflejo. El diario es de B2; los movimientos son de E2.
 *  - La clave natural del movimiento es la que trae E2 (`movimiento.clave`); no se recalcula distinto.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja E1 del plan-construccion y diseno-oop.md (CLASE ConciliacionBancaria).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ConciliacionBancaria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'conciliacion-bancaria';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCruzarRequest(e) {
    return this._atender(e, 'cruzar', 'conciliacion-bancaria.cruzar.response', async (d) => {
      const res = await this._cruzar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el cruce quedo hecho (determinista). Lo LEEN
        // partida-conciliatoria (E9) e informe-conciliacion (E10).
        this.eventBus?.publish('contabilidad.conciliacion_cruzada', {
          project_id: res.data.project_id,
          periodo: res.data.periodo,
          total_movimientos: res.data.total_movimientos,
          casados: res.data.casados.length,
          sin_contrapartida: res.data.sin_contrapartida.length,
          sin_movimiento: res.data.sin_movimiento.length,
          descuadre: res.data.descuadre,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('conciliacion-bancaria.cruzar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion determinista: cruzar(periodo) → ResultadoConciliacion ──
  async _cruzar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const periodo = input.periodo != null ? String(input.periodo) : null;

    // 1) Los MOVIMIENTOS del banco: los trae declarados la peticion o se PIDE el extracto a E2.
    const { movimientos, fuente_movimientos } = await this._movimientos(pid, input, periodo);

    // 2) Los APUNTES del diario: se PIDE a escritor-diario (B2) POR EVENTO (nunca import cruzado).
    const { asientos, fuente_diario } = await this._diario(pid, periodo);

    // 3) El CORTE DURO de las reglas declaradas (E8) por EVENTO. Sin el, no se inventa regla.
    const reglas = await this._reglas(pid, input);
    const reglas_disponibles = reglas && reglas.disponible === true;

    // Indice de apuntes del diario por su clave natural (clave del asiento) para el cruce.
    const apuntes_por_clave = new Map();
    for (const a of asientos) {
      if (!a || a.clave_natural == null) continue;
      apuntes_por_clave.set(String(a.clave_natural), a);
    }

    const casados = [];
    const sin_contrapartida = [];
    const claves_casadas = new Set();

    // 4) CRUCE por clave natural (determinista): un movimiento = un apunte del diario.
    for (const m of movimientos) {
      const clave = this._claveDe(m);
      if (clave && apuntes_por_clave.has(clave)) {
        casados.push(this._par(m, apuntes_por_clave.get(clave), 'clave_natural'));
        claves_casadas.add(clave);
        continue;
      }
      // Sin casar por clave natural: se prueba el corte por REGLA declarada (E8).
      const corte = this._porRegla(m, reglas);
      if (corte) {
        casados.push(this._par(m, null, 'regla', corte));
        continue;
      }
      // No casa por ninguna via determinista → va al JUICIO (E7), no se interpreta aqui.
      sin_contrapartida.push({
        movimiento: m,
        clave: clave || null,
        motivo: reglas_disponibles
          ? 'sin apunte en el diario ni regla declarada que lo cubra: el juicio es de partida-no-identificada (E7)'
          : 'sin apunte en el diario; las reglas (E8) no respondieron, no se inventa el corte',
        juicio: 'partida-no-identificada'
      });
    }

    // 5) APUNTES del diario sin movimiento bancario en el periodo (el otro lado del desfase).
    const sin_movimiento = [];
    for (const [clave, a] of apuntes_por_clave) {
      if (claves_casadas.has(clave)) continue;
      sin_movimiento.push({ clave, asiento: a, motivo: 'apunte del diario sin movimiento bancario en el periodo' });
    }

    const total_movimientos = movimientos.length;
    const total_asientos = asientos.length;

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        fuente_movimientos,
        fuente_diario,
        reglas_disponibles,
        total_movimientos,
        total_asientos,
        casados,
        sin_contrapartida,
        sin_movimiento,
        // Cuantia cruda del desfase (los importes de lo no casado). El ajuste fino es E9.
        descuadre: this._round(
          sin_contrapartida.reduce((s, x) => s + (this._num(x.movimiento.importe) || 0), 0),
          2
        ),
        // El JUICIO NO vive aqui: se declara la frontera.
        juicio_delegado_a: 'partida-no-identificada'
      }
    };
  }

  // Los movimientos vienen declarados o se piden al extracto (E2) por EVENTO.
  async _movimientos(pid, input, periodo) {
    const declarados = Array.isArray(input.movimientos) ? input.movimientos
      : (input.extracto && Array.isArray(input.extracto.movimientos) ? input.extracto.movimientos : null);
    if (declarados) return { movimientos: declarados, fuente_movimientos: 'declarados' };

    const r = await this._rpc('puerto-extracto.entrar.request',
      { project_id: pid, canal: input.canal, banco: input.banco, periodo }, { timeout_ms: 4000 });
    const movs = r && r.data && Array.isArray(r.data.movimientos) ? r.data.movimientos : null;
    if (movs) return { movimientos: movs, fuente_movimientos: 'puerto-extracto' };
    return { movimientos: [], fuente_movimientos: null };
  }

  // El diario se pide a escritor-diario (B2) por EVENTO.
  async _diario(pid, periodo) {
    const r = await this._rpc('escritor-diario.asientos.request',
      { project_id: pid, periodo }, { timeout_ms: 4000 });
    const asientos = r && r.data && Array.isArray(r.data.asientos) ? r.data.asientos
      : (Array.isArray(r) ? r : null);
    if (asientos) return { asientos, fuente_diario: 'diario' };
    return { asientos: [], fuente_diario: null };
  }

  // El corte duro (E8) se pide por EVENTO para cada movimiento. Si no responde, se declara.
  async _reglas(pid, input) {
    if (input.movimientos && input.reglas_aplicadas) return { disponible: true, aplicadas: input.reglas_aplicadas };
    // Sondeo de disponibilidad del custodio de reglas (una consulta, sin inventar corte).
    const r = await this._rpc('regla-movimiento-bancario.aplicar.request',
      { project_id: pid, movimiento: { fecha: null, importe: null } }, { timeout_ms: 4000 });
    if (r && r.data) return { disponible: true, cache: r.data };
    return { disponible: false };
  }

  // Aplica el corte por regla si el custodio respondio. NUNCA inventa el corte.
  _porRegla(m, reglas) {
    if (!reglas || reglas.disponible !== true) return null;
    if (Array.isArray(reglas.aplicadas)) {
      const hit = reglas.aplicadas.find(x => x && x.clave === this._claveDe(m));
      return hit || null;
    }
    // Con el sondeo disponible pero sin corte por movimiento, no se afirma cobertura.
    return null;
  }

  _par(m, asiento, via, corte = null) {
    return {
      clave: this._claveDe(m) || null,
      via,
      movimiento: m,
      asiento: asiento || null,
      apunte: corte ? corte.apunte : null,
      regla: corte ? corte.regla : null
    };
  }

  // Clave natural del movimiento: la que normalizo E2 (no se recalcula distinto).
  _claveDe(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.clave != null) return String(m.clave);
    const partes = [m.fecha, m.importe, m.signo, (m.referencia != null ? m.referencia : m.concepto)];
    if (partes.every(v => v === null || v === undefined)) return null;
    return partes.map(v => (v === null || v === undefined ? '-' : String(v))).join('|');
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.abs(n) : null;
  }

  // ── Tools ──
  toolCruzar(params) { return this._cruzar(params); }
}

module.exports = ConciliacionBancaria;
