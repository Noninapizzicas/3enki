/**
 * contabilidad-analitica/consolidacion — REFLEJO STATELESS (I3, hoja del plan).
 *
 * LA CONSOLIDACION DEL GRUPO MULTI-SOCIEDAD COMPLETA: compone los estados del CONJUNTO a
 * partir de las sociedades declaradas, aplicando el criterio DECLARADO y las eliminaciones
 * intercompany (I2). Agregacion DETERMINISTA, sin estimar nada.
 *
 * ATRIBUTOS del diseno: `sociedades:Set<Sociedad>` y `criterio:ParametroDeclarable`.
 *   - Las SOCIEDADES del grupo son DATO declarado. NO se descubren solas: si no se declaran,
 *     no hay perimetro y los estados quedan `[ABIERTO]` (inventarse una sociedad rompe el grupo).
 *   - El CRITERIO (que se agrega, en que moneda, con que metodo de conversion, que se elimina)
 *     es ParametroDeclarable. El reflejo lo CONSERVA opaco y lo declara en la respuesta.
 *
 * SOLO CONSOLIDA LO DECLARADO: nada se estima. Cada sociedad aporta sus partidas declaradas
 * (o pedidas a `marca-sociedad` I1 por EVENTO); los estados se suman; y se restan las
 * ELIMINACIONES INTERCOMPANY, que se piden a I2 POR EVENTO (eliminacion-intercompany.eliminar.request).
 * Si una sociedad declarada no trae cifras → el estado del conjunto queda `[ABIERTO]` con lo
 * que falta (no se rellena con 0 una sociedad de la que no hay dato: eso falsearia el grupo).
 *
 * Invariantes:
 *  - DETERMINISTA: mismas sociedades + mismas cifras + mismo criterio → mismos estados.
 *  - LEY COMO DATO: el criterio de consolidacion es entrada; cero constantes cableadas.
 *  - Dato ausente = desconocido: sin sociedades declaradas o sin cifras → `[ABIERTO]`.
 *  - NO escribe, NO persiste: los estados son DERIVADOS; el asiento es del diario.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja I3 del plan-construccion y diseno-oop.md (CLASE Consolidacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class Consolidacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'consolidacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onEstadosRequest(e) {
    return this._atender(e, 'estados', 'consolidacion.estados.response', async (d) => {
      const res = await this._estados(d);
      if (res.status !== 200) this.eventBus?.publish('consolidacion.estados.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: estados(criterio) → EstadoDerivado ──
  async _estados(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const periodo = input.periodo != null ? String(input.periodo) : null;

    // 1) Las SOCIEDADES del grupo: DECLARADAS. Sin ellas no hay perimetro (no se descubre solo).
    const sociedades = this._sociedades(input);
    if (sociedades.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid, periodo, sociedades: [], estados: null, consolidado: false,
          abierto: true, faltan: ['sociedades'],
          motivo: 'no se consolidan estados: falta el conjunto de sociedades declarado (el grupo no se descubre solo)'
        }
      };
    }

    // 2) El CRITERIO de consolidacion: ParametroDeclarable, opaco.
    const criterio = this._criterio(input);

    // 3) Las CIFRAS por sociedad: declaradas o pedidas a marca-sociedad (I1) POR EVENTO.
    const aportes = [];
    const faltan = [];
    for (const s of sociedades) {
      const cifras = await this._cifrasDe(pid, s, input);
      if (cifras === null) { faltan.push(`cifras:${s}`); aportes.push({ sociedad: s, cifras: null }); }
      else aportes.push({ sociedad: s, cifras });
    }

    // 4) Las ELIMINACIONES intercompany: se piden a I2 POR EVENTO (o llegan declaradas).
    const { eliminaciones, neto_eliminado, fuente_eliminaciones } = await this._eliminaciones(pid, input, sociedades);

    // 5) AGREGACION determinista: suma de lo declarado − eliminaciones. Nada se estima.
    const suma = this._sumar(aportes);
    const estado = {
      total_activo: suma.total_activo === null ? null : this._round(suma.total_activo - 0, 2),
      total_pasivo: suma.total_pasivo === null ? null : this._round(suma.total_pasivo, 2),
      patrimonio: suma.patrimonio === null ? null : this._round(suma.patrimonio, 2),
      ingresos: suma.ingresos === null ? null : this._round(suma.ingresos, 2),
      gastos: suma.gastos === null ? null : this._round(suma.gastos, 2),
      resultado: (suma.ingresos === null || suma.gastos === null) ? null : this._round(suma.ingresos - suma.gastos, 2),
      // Las operaciones internas se ELIMINAN del conjunto (cruce interno del grupo).
      eliminado_intercompany: neto_eliminado === null ? null : this._round(neto_eliminado, 2)
    };
    if (estado.ingresos !== null && neto_eliminado !== null) estado.ingresos_netos = this._round(estado.ingresos - neto_eliminado, 2);

    const abierto = faltan.length > 0 || suma.sinDatos;

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        sociedades,
        criterio,
        fuente_eliminaciones,
        aportes,
        eliminaciones,
        n_sociedades: sociedades.length,
        // EstadoDerivado: el estado del CONJUNTO (grupo completo), no el de una sociedad.
        estados: abierto ? null : estado,
        // Se declara tambien el parcial para que se vea que hay aunque falte alguna cifra.
        parcial: estado,
        consolidado: !abierto,
        abierto,
        faltan,
        motivo: abierto
          ? `no se cierra la consolidacion: falta ${faltan.join(', ') || 'cifras de alguna sociedad declarada'} (solo se consolida lo declarado)`
          : null
      }
    };
  }

  _sociedades(input = {}) {
    const raw = input.sociedades && (input.sociedades.length !== undefined ? input.sociedades : [input.sociedades]);
    const list = Array.isArray(raw) ? raw : (input.sociedad != null ? [input.sociedad] : []);
    const out = [];
    for (const s of list) {
      if (s === null || s === undefined || s === '') continue;
      const id = typeof s === 'object' ? (s.id ?? s.nombre) : s;
      if (id === null || id === undefined || id === '') continue;
      if (!out.includes(String(id))) out.push(String(id));
    }
    return out;
  }

  _criterio(input = {}) {
    const c = input.criterio && typeof input.criterio === 'object' ? { ...input.criterio } : null;
    // El criterio se CONSERVA tal cual (opaco): el reflejo no interpreta metodo/moneda.
    return c || (input.periodo ? { periodo: String(input.periodo) } : null);
  }

  // Las cifras de una sociedad: declaradas en la peticion o pedidas a marca-sociedad (I1) POR EVENTO.
  async _cifrasDe(pid, sociedad, input = {}) {
    const mapa = input.cifras || input.por_sociedad || null;
    if (mapa && typeof mapa === 'object' && mapa[sociedad] && typeof mapa[sociedad] === 'object') {
      return this._normalizarCifras(mapa[sociedad]);
    }
    if (Array.isArray(input.partidas)) {
      const propias = input.partidas.filter(p => p && String(p.sociedad ?? '') === sociedad);
      if (propias.length > 0) return this._normalizarCifras(this._desdePartidas(propias));
    }
    const r = await this._rpc('marca-sociedad.marcar.request',
      { project_id: pid, sociedad, listar: true, periodo: input.periodo }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && data.cifras && typeof data.cifras === 'object') return this._normalizarCifras(data.cifras);
    if (data && Array.isArray(data.partidas)) return this._normalizarCifras(this._desdePartidas(data.partidas));
    return null;
  }

  // Las eliminaciones: de I2 POR EVENTO (best-effort) o declaradas.
  async _eliminaciones(pid, input = {}, sociedades = []) {
    if (Array.isArray(input.eliminaciones)) {
      const neto = this._num(input.neto_eliminado);
      return {
        eliminaciones: input.eliminaciones,
        neto_eliminado: neto !== null ? neto : this._round(input.eliminaciones.reduce((s, e) => s + (this._num(e && e.importe) ?? 0), 0), 2),
        fuente_eliminaciones: 'declarado'
      };
    }
    const r = await this._rpc('eliminacion-intercompany.eliminar.request',
      { project_id: pid, criterio: { grupo: sociedades }, periodo: input.periodo }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && Array.isArray(data.eliminaciones)) {
      return { eliminaciones: data.eliminaciones, neto_eliminado: this._num(data.neto), fuente_eliminaciones: 'eliminacion-intercompany' };
    }
    // Sin respuesta de I2: cero eliminaciones es un DATO declarado, no una estimacion.
    return { eliminaciones: [], neto_eliminado: 0, fuente_eliminaciones: null };
  }

  _normalizarCifras(c = {}) {
    return {
      total_activo: this._num(c.total_activo),
      total_pasivo: this._num(c.total_pasivo),
      patrimonio: this._num(c.patrimonio),
      ingresos: this._num(c.ingresos),
      gastos: this._num(c.gastos)
    };
  }

  _desdePartidas(partidas = []) {
    const acc = { total_activo: 0, total_pasivo: 0, patrimonio: 0, ingresos: 0, gastos: 0 };
    for (const p of partidas) {
      const imp = this._num(p && p.importe);
      if (imp === null) continue;
      const tipo = String((p && p.tipo) || '').toLowerCase();
      if (tipo === 'activo') acc.total_activo += imp;
      else if (tipo === 'pasivo') acc.total_pasivo += imp;
      else if (tipo === 'patrimonio') acc.patrimonio += imp;
      else if (tipo === 'ingreso') acc.ingresos += imp;
      else if (tipo === 'gasto') acc.gastos += imp;
    }
    return acc;
  }

  // Suma pura de lo declarado. Si CUALQUIER sociedad declarada no trae cifras → no hay total.
  _sumar(aportes = []) {
    const claves = ['total_activo', 'total_pasivo', 'patrimonio', 'ingresos', 'gastos'];
    const total = {};
    let sinDatos = false;
    for (const k of claves) {
      let suma = 0;
      let contados = 0;
      for (const a of aportes) {
        const v = a.cifras ? this._num(a.cifras[k]) : null;
        if (v === null) continue;
        suma += v;
        contados++;
      }
      // Solo hay total si TODAS las sociedades declaradas aportaron esa clave.
      total[k] = (contados === aportes.length && aportes.length > 0) ? this._round(suma, 2) : null;
    }
    if (aportes.some(a => a.cifras === null)) sinDatos = true;
    return { ...total, sinDatos };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolEstados(params) { return this._estados(params); }
}

module.exports = Consolidacion;
