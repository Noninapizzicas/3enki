/**
 * contabilidad-analitica/comparador-periodos — REFLEJO STATELESS (J9, hoja del plan).
 *
 * COMPARAR: ejercicio vs ejercicio, mes vs mes, real vs presupuesto. La lente del jefe para poder
 * DECIDIR: sin comparacion no se sabe si el mes ha ido bien o mal. Determinista: mismos dos periodos
 * + misma metrica → mismo delta.
 *
 * ATRIBUTOS del diseno: `presupuesto:Presupuesto`, `desviacion:Desviacion`.
 *   METODOS: comparar(a,b):Delta.
 *   REGLA: ejercicio vs ejercicio, mes vs mes, real vs presupuesto. REUTILIZA J3/J4, NO los duplica.
 *
 * ================== REUTILIZA J3/J4, NO LOS DUPLICA ==================
 * El modo `real_vs_presupuesto` NO recalcula nada: DELEGA en `desviacion` (J4) POR EVENTO
 * (`desviacion.calcular.request`), que ya compone el real (de J2) contra el objetivo que el JEFE
 * declaro (de J3). Aqui solo se PRESENTA el delta y el ratio: cero aritmetica propia del dominio.
 *
 * En los modos `ejercicio_vs_ejercicio` y `mes_vs_mes` NO se recalcula la cifra de ningun periodo:
 * cada extremo se PIDE ya calculado a su dueño POR EVENTO (o llega declarado). La unica aritmetica
 * de este reflejo es la DIFERENCIA entre los dos extremos — comparar, que es su oficio.
 *
 * LA METRICA ES DECLARABLE: que se compara (margen, resultado, caja, ...) lo declara el jefe; sin
 * metrica declarada NO se compara por defecto (elegirla seria decidir por el). Sin los dos extremos
 * declarados/obtenidos NO se computa delta: `[ABIERTO]`, no un 0 que nadie midio.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos extremos + misma metrica → mismo delta.
 *  - Dato ausente = desconocido: sin metrica o sin alguno de los dos periodos → `delta:null`,
 *    `abierto:true` con lo que falta.
 *  - REUTILIZA SIN DUPLICAR: J3/J4 se piden por evento; J2/C2/E4 por evento. Cero reglas cableadas.
 *  - NO escribe, NO persiste: la comparacion es un DERIVADO.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja J9 del plan-construccion y diseno-oop.md (CLASE ComparadorPeriodos).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los modos de comparacion que pueden venir DECLARADOS en la peticion (solo los nombres).
const MODOS = new Set(['ejercicio_vs_ejercicio', 'mes_vs_mes', 'real_vs_presupuesto']);

// De donde se pide la cifra de un periodo, segun la metrica DECLARADA (por EVENTO, nunca recalculada).
const FUENTES = {
  margen: { evento: 'margen-analitico.calcular.request', dueño: 'margen-analitico', campo: 'margen_total' },
  resultado: { evento: 'cuenta-resultados.calcular.request', dueño: 'cuenta-resultados', campo: 'resultado' },
  caja: { evento: 'saldo-tesoreria.calcular.request', dueño: 'saldo-tesoreria', campo: 'saldo_total' }
};

class ComparadorPeriodos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'comparador-periodos';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCompararRequest(e) {
    return this._atender(e, 'comparar', 'comparador-periodos.comparar.response', async (d) => {
      const res = await this._comparar(d);
      if (res.status !== 200) this.eventBus?.publish('comparador-periodos.comparar.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: comparar(a,b) → Delta (REUTILIZA J3/J4) ──
  async _comparar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const modo = this._modo(input);
    if (modo === null) {
      return {
        status: 200,
        data: {
          project_id: pid, modo: null, metrica: null,
          a: null, b: null, delta: null, delta_relativa: null, signo: null,
          abierto: true, faltan: ['modo'],
          motivo: 'no se compara: falta declarar el modo (ejercicio_vs_ejercicio | mes_vs_mes | real_vs_presupuesto)'
        }
      };
    }

    // EL MODO QUE REUTILIZA J4: real vs presupuesto NO se recalcula — se DELEGA en desviacion (J4).
    if (modo === 'real_vs_presupuesto') {
      return this._realVsPresupuesto(pid, input);
    }

    // MODO periodo vs periodo: la METRICA es declarable (sin ella no se elige por el jefe).
    const metrica = input.metrica != null ? String(input.metrica).toLowerCase() : null;
    if (metrica === null) {
      return {
        status: 200,
        data: {
          project_id: pid, modo, metrica: null,
          a: null, b: null, delta: null, delta_relativa: null, signo: null,
          abierto: true, faltan: ['metrica'],
          motivo: 'no se compara periodo vs periodo: la metrica a comparar es DECLARABLE y no se declaro'
        }
      };
    }

    // Los dos EXTREMOS: declarados, o pedidos YA CALCULADOS a su dueño POR EVENTO. No se recalculan.
    const a = await this._extremo(pid, input, metrica, 'a', input.desde);
    const b = await this._extremo(pid, input, metrica, 'b', input.hasta);

    const faltan = [];
    if (a.valor === null) faltan.push('a:' + (a.periodo ?? 'sin_periodo'));
    if (b.valor === null) faltan.push('b:' + (b.periodo ?? 'sin_periodo'));

    if (faltan.length > 0) {
      return {
        status: 200,
        data: {
          project_id: pid, modo, metrica, fuente_metrica: a.fuente || b.fuente || null,
          a, b, delta: null, delta_relativa: null, signo: null,
          abierto: true, faltan,
          motivo: 'no se computa el delta: falta el valor de ' + faltan.join(', ')
            + ' (no se compara contra un 0 que nadie midio)'
        }
      };
    }

    const delta = this._round(a.valor - b.valor, 2);
    const signo = delta > 0 ? 'SUBE' : (delta < 0 ? 'BAJA' : 'IGUAL');
    const relativa = b.valor !== 0 ? this._round(delta / Math.abs(b.valor), 4) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        modo,
        metrica,
        fuente_metrica: a.fuente || b.fuente || null,
        a,
        b,
        // Delta = a − b. La unica aritmetica de este reflejo: comparar.
        delta,
        delta_relativa: relativa,
        signo,
        // Se declara el sentido para que el jefe no tenga que interpretar el signo.
        direccion: signo === 'SUBE' ? 'MEJORA_EN_A' : (signo === 'BAJA' ? 'MEJORA_EN_B' : 'SIN_CAMBIO'),
        abierto: false,
        faltan: [],
        motivo: null
      }
    };
  }

  // ── real vs presupuesto: DELEGA en desviacion (J4). No duplica J3/J4. ──
  async _realVsPresupuesto(pid, input = {}) {
    const r = await this._rpc('desviacion.calcular.request', {
      project_id: pid,
      dimension: input.dimension != null ? input.dimension : null,
      periodo: input.periodo != null ? input.periodo : (input.hasta != null ? input.hasta : null),
      real: input.real != null ? input.real : undefined,
      objetivo: input.objetivo != null ? input.objetivo : undefined,
      umbral: input.umbral != null ? input.umbral : undefined
    }, { timeout_ms: 5000 });
    const data = r && r.data ? r.data : null;

    // Sin respuesta de J4 NO se recalcula la desviacion aqui (eso seria duplicar J4).
    if (!data) {
      return {
        status: 200,
        data: {
          project_id: pid, modo: 'real_vs_presupuesto', metrica: 'desviacion',
          fuente: 'desviacion', a: null, b: null,
          delta: null, delta_relativa: null, signo: null,
          abierto: true, faltan: ['desviacion'],
          motivo: 'no se compara real vs presupuesto: desviacion (J4) no respondio (aqui NO se recalcula la desviacion)'
        }
      };
    }

    const delta = this._num(data.desviacion);
    return {
      status: 200,
      data: {
        project_id: pid,
        modo: 'real_vs_presupuesto',
        metrica: 'desviacion',
        // La traza de la delegacion: el delta es el de J4, con su signo y su umbral declarado.
        fuente: 'desviacion',
        a: { periodo: data.periodo ?? null, valor: this._num(data.real), rol: 'real' },
        b: { periodo: data.periodo ?? null, valor: this._num(data.objetivo), rol: 'presupuesto' },
        delta,
        delta_relativa: this._num(data.desviacion_relativa),
        signo: data.signo ?? null,
        avisa: data.avisa ?? false,
        umbral: this._num(data.umbral),
        abierto: data.abierto === true || delta === null,
        faltan: Array.isArray(data.faltan) ? data.faltan : [],
        motivo: data.motivo ?? null
      }
    };
  }

  // ── Un extremo: declarado, o pedido YA CALCULADO a su dueño POR EVENTO ──
  async _extremo(pid, input = {}, metrica, lado, periodo) {
    const decl = input[lado];
    if (decl !== undefined && decl !== null) {
      if (typeof decl === 'object') {
        return {
          periodo: decl.periodo != null ? String(decl.periodo) : null,
          valor: this._num(decl.valor != null ? decl.valor : decl.importe),
          fuente: 'declarado',
          rol: decl.rol != null ? String(decl.rol) : null
        };
      }
      if (this._num(decl) !== null) {
        return { periodo: periodo != null ? String(periodo) : null, valor: this._num(decl), fuente: 'declarado', rol: null };
      }
    }
    // Sin valor declarado: se pide a la FUENTE de la metrica declarada, POR EVENTO (nunca se recalcula).
    const f = FUENTES[metrica];
    if (!f) {
      return { periodo: periodo != null ? String(periodo) : null, valor: null, fuente: null, rol: null };
    }
    const r = await this._rpc(f.evento, { project_id: pid, periodo, ejercicio: periodo, eje: input.eje }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (!data) return { periodo: periodo != null ? String(periodo) : null, valor: null, fuente: null, rol: null };
    return {
      periodo: periodo != null ? String(periodo) : null,
      valor: this._num(data[f.campo]),
      fuente: f.dueño,
      rol: null
    };
  }

  _modo(input = {}) {
    const m = input.modo != null ? String(input.modo).toLowerCase() : null;
    if (m === null) {
      // Compatibilidad declarada: si el jefe declara real+objetivo explicitamente, es real_vs_presupuesto.
      if (input.real != null && (input.objetivo != null || input.presupuesto != null)) return 'real_vs_presupuesto';
      return null;
    }
    return MODOS.has(m) ? m : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolComparar(params) { return this._comparar(params); }
}

module.exports = ComparadorPeriodos;
