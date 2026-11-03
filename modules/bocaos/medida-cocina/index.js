'use strict';

/**
 * medida-cocina · REFLEJO · TIENDA — L03 (PuntualidadDeclarada).
 *
 * LA PUNTUALIDAD DECLARADA DE UNA COCINA: la DISTRIBUCIÓN de la hora de listo frente a la hora
 * prometida, por franja y con n. Se publica ANTES de que el rider acepte, y es lo que A08 usa para
 * medir la espera probable.
 *
 *   «Esta cocina se pasa 4 minutos la mitad de las veces»  → información.
 *   «Esta cocina tiene un 3 sobre 5»                        → juicio.
 *
 * Aquí sólo se puede construir lo primero. No hay nota, ni estrellas, ni media ponderada, ni un
 * umbral que convierta la distribución en veredicto: la respuesta lleva `nota: null` y `estrellas:
 * null` por construcción, no por prudencia.
 *
 * Y sin datos suficientes NO hay distribución: NO_CONSTA, y el rider ve «sin histórico». Un mercado
 * nuevo no puede inventar una reputación, y una plaza recién abierta tampoco (Q51). El mínimo de
 * muestras se DECLARA en la respuesta (`minimo_n`) para que se sepa con qué se decidió.
 *
 * Las muestras viajan EN LA PREGUNTA (el dato va en el evento): este módulo no tiene store y no barre
 * el histórico de nadie. Si una muestra no trae la hora de listo, se le PIDE a `hecho-listo.de` (el
 * hecho, con su hora, es suyo). Si no trae la hora prometida, la muestra NO se mide: se cuenta aparte
 * (`sin_promesa`). No se imputa una promesa que nadie declaró.
 *
 * La única lectura plaza→tienda que el diseño permite es ésta, y está escrita en A02: la plaza lee lo
 * que la tienda PUBLICA, nunca su carta, su carrito ni sus clientes. Una tienda que pregunta por otra
 * tienda se lleva un 403.
 *
 * Isla: cero require a otra isla. Sin store, sin PosPersistencia: no escribe nada.
 */

const ModuloBocaos = require('../_bocaos');

// El mínimo de muestras con el que una distribución dice algo. Es un número DECLARADO (va en la
// respuesta): cambiarlo es una decisión visible, no un detalle de implementación.
const MINIMO_N = 5;
const TIMEOUT_BUS_MS = 1500;

const BUCKETS = [
  { clave: 'a_tiempo', hasta: 0, etiqueta: 'a tiempo o antes' },
  { clave: 'hasta_2', hasta: 2, etiqueta: 'hasta 2 min tarde' },
  { clave: 'hasta_5', hasta: 5, etiqueta: 'hasta 5 min tarde' },
  { clave: 'hasta_10', hasta: 10, etiqueta: 'hasta 10 min tarde' },
  { clave: 'mas_de_10', hasta: null, etiqueta: 'más de 10 min tarde' }
];

class MedidaCocina extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'medida-cocina';
    this.version = 'reflejo-0.1.0';
    this._path = null;                  // sin store: no hay histórico que guardar, sólo se mide lo que llega
    this.minimo_n = MINIMO_N;
    this.tiempo_bus_ms = TIMEOUT_BUS_MS;
  }

  // ================= RPC del bus (una línea por op) =================
  onMedirRequest(e) { return this.servir(e, 'medir', 'medida-cocina.medir', (d) => this._medir(d)); }
  onHistorialRequest(e) { return this.servir(e, 'historial', 'medida-cocina.historial', (d) => this._historial(d)); }

  // ================= L03 · medir =================
  async _medir(d) {
    if (!d.project_id) return this._invalid('project_id');
    const tienda_id = d.tienda_id || d.project_id;
    const ajeno = this._ajena(d, tienda_id);
    if (ajeno) return ajeno;

    const muestras = await this._muestras(d, tienda_id);
    if (muestras.error) return muestras.error;

    const franja = this._franja(d.franja);
    const dentro = franja ? muestras.filas.filter((f) => this._enFranja(f.hora_listo, franja)) : muestras.filas;
    const minimo_n = Number.isInteger(d.minimo_n) && d.minimo_n > 0 ? d.minimo_n : this.minimo_n;

    const medida = this._distribucion(dentro, { minimo_n, tienda_id, franja, sin_promesa: muestras.sin_promesa });

    return { status: 200, data: { medida } };
  }

  // ================= L03 · historial (la serie, franja a franja) =================
  // Sin franja en la pregunta, la franja ES la hora del día del hecho de listo: se agrupa por lo que
  // pasó, no por un calendario que alguien tenga que mantener.
  async _historial(d) {
    if (!d.project_id) return this._invalid('project_id');
    const tienda_id = d.tienda_id || d.project_id;
    const ajeno = this._ajena(d, tienda_id);
    if (ajeno) return ajeno;

    const muestras = await this._muestras(d, tienda_id);
    if (muestras.error) return muestras.error;

    const minimo_n = Number.isInteger(d.minimo_n) && d.minimo_n > 0 ? d.minimo_n : this.minimo_n;
    const porHora = new Map();
    for (const f of muestras.filas) {
      const h = this._hora(f.hora_listo);
      if (h === null) continue;
      if (!porHora.has(h)) porHora.set(h, []);
      porHora.get(h).push(f);
    }

    const franjas = [...porHora.keys()].sort((a, b) => a - b).map((h) => {
      const m = this._distribucion(porHora.get(h), {
        minimo_n, tienda_id, franja: { desde_hora: h, hasta_hora: h }, sin_promesa: 0
      });
      return {
        franja: `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59`,
        hora: h,
        estado: m.estado,
        n: m.n,
        p50_min: m.p50_min,
        p90_min: m.p90_min,
        a_tiempo_pct: m.a_tiempo_pct
      };
    });

    return {
      status: 200,
      data: {
        historial: {
          tienda_id,
          minimo_n,
          franjas,
          n_total: muestras.filas.length,
          sin_promesa: muestras.sin_promesa,
          nota: null,
          estrellas: null,
          // Q51: lo que este historial NO dice, dicho.
          limites: [
            'las muestras viajan en la pregunta: se mide lo que la tienda declara, no lo que la plaza recuerda',
            'la franja es la hora del ISO de la hora de listo (UTC)',
            'sin la hora prometida la muestra no se mide: no se imputa una promesa',
            `con menos de ${minimo_n} muestras por franja se responde NO_CONSTA, no una media de dos`
          ]
        }
      }
    };
  }

  // ================= la distribución (y lo que NO es) =================
  _distribucion(filas, { minimo_n, tienda_id, franja, sin_promesa }) {
    const n = filas.length;
    const base = {
      tienda_id,
      franja: franja || null,
      n,
      n_minimo: minimo_n,
      sin_promesa: sin_promesa || 0,
      // L03: la salida es una distribución o un NO_CONSTA. Nunca una nota.
      tipo: 'distribucion',
      nota: null,
      estrellas: null,
      criterio: 'hora de listo declarada por la cocina − hora prometida (minutos)'
    };

    if (n < minimo_n) {
      return {
        ...base,
        estado: 'NO_CONSTA',
        motivo: `sin datos suficientes: ${n} muestra(s) y el mínimo declarado es ${minimo_n}`,
        hueco: 'sin histórico',
        // El rider ve «sin histórico»; no se le enseña una distribución de dos casos.
        distribucion: null,
        p50_min: null,
        p90_min: null,
        a_tiempo_pct: null,
        espera_medida_min: null
      };
    }

    const desvios = filas.map((f) => f.desvio_min).sort((a, b) => a - b);
    const cubos = BUCKETS.map((b, i) => {
      const desde = i === 0 ? -Infinity : BUCKETS[i - 1].hasta;
      const hasta = b.hasta;
      const cuenta = desvios.filter((x) => (i === 0 ? x <= b.hasta : (x > desde && (hasta === null || x <= hasta)))).length;
      return {
        clave: b.clave,
        etiqueta: b.etiqueta,
        desde_min_exclusivo: i === 0 ? null : desde,
        hasta_min: hasta,
        cuenta,
        pct: this._round((cuenta * 100) / n, 1)
      };
    });

    return {
      ...base,
      estado: 'MEDIDA',
      distribucion: cubos,
      min_min: desvios[0],
      max_min: desvios[desvios.length - 1],
      p50_min: this._percentil(desvios, 50),
      p90_min: this._percentil(desvios, 90),
      a_tiempo_pct: cubos[0].pct,
      // A08 · lo que un rider ESPERARÍA si llega a la hora prometida: la media de lo que la cocina se
      // adelantó (nunca negativo — si llega tarde, el rider no espera). Es el número que el panel de la
      // tienda y el rider tienen que ver IGUAL (L01): sale de aquí, de la misma serie.
      espera_medida_min: this._round(desvios.reduce((s, x) => s + Math.max(0, -x), 0) / n, 2),
      // Se dice lo que se puede decir con estos números y lo que no.
      lectura: `la mitad de las veces se pasa ${this._percentil(desvios, 50)} min o menos; 1 de cada 10, ${this._percentil(desvios, 90)} min o más`
    };
  }

  // ================= las muestras =================
  async _muestras(d, tienda_id) {
    const crudas = Array.isArray(d.hechos) ? d.hechos
      : (Array.isArray(d.muestras) ? d.muestras
        : (Array.isArray(d.servicios) ? d.servicios : null));
    if (!crudas) {
      return { error: this._errorResponse(400, 'INVALID_INPUT',
        'hechos requeridos: la serie viaja en la pregunta (el dato va en el evento)', { field: 'hechos' }) };
    }

    const filas = [];
    let sin_promesa = 0;
    let sin_hora = 0;

    for (const raw of crudas) {
      if (!raw || typeof raw !== 'object') continue;
      const hora_prometida = this._iso(raw.hora_prometida || raw.prometida || raw.promesa);
      let hora_listo = this._iso(raw.hora_listo || raw.listo || raw.listo_at);
      // La hora del hecho es del hecho: si la muestra sólo trae el pedido, se le pide a su custodio.
      if (!hora_listo && raw.pedido_id && d.plaza_id) {
        hora_listo = await this._horaDeListo(d.plaza_id, raw.pedido_id);
      }
      if (!hora_prometida) { sin_promesa += 1; continue; }
      if (!hora_listo) { sin_hora += 1; continue; }
      filas.push({
        pedido_id: raw.pedido_id || null,
        hora_prometida,
        hora_listo,
        desvio_min: this._minutosEntre(hora_prometida, hora_listo)
      });
    }

    return { filas, sin_promesa: sin_promesa + sin_hora };
  }

  async _horaDeListo(plaza_id, pedido_id) {
    try {
      const r = await this._rpc('hecho-listo.de.request', {
        project_id: plaza_id, plaza_id, pedido_id
      }, { timeout_ms: this.tiempo_bus_ms });
      const h = r && r.status === 200 && r.data && r.data.hecho ? r.data.hecho.hora_listo : null;
      return this._iso(h);
    } catch (_) {
      return null;
    }
  }

  // ================= guardas =================
  // Una tienda pregunta por SU cocina. La plaza puede preguntar (es la lectura que A02 documenta).
  // Otra tienda, no: 403 y se dice por qué.
  _ajena(d, tienda_id) {
    const quien = String(d.project_id || '');
    if (/^plaza-/.test(quien)) return null;
    if (d.tienda_id && quien !== tienda_id) {
      return this._errorResponse(403, 'TIENDA_AJENA',
        'una tienda sólo mide su propia cocina: la puntualidad de otra no es asunto suyo (L02/L03)',
        { field: 'tienda_id', pedido: tienda_id, quien });
    }
    return null;
  }

  _franja(f) {
    if (!f || typeof f !== 'object') return null;
    const desde = Number.isFinite(f.desde_hora) ? f.desde_hora : null;
    const hasta = Number.isFinite(f.hasta_hora) ? f.hasta_hora : null;
    if (desde === null && hasta === null) return null;
    return { desde_hora: desde === null ? 0 : desde, hasta_hora: hasta === null ? 23 : hasta };
  }

  _enFranja(iso, franja) {
    const h = this._hora(iso);
    return h !== null && h >= franja.desde_hora && h <= franja.hasta_hora;
  }

  _hora(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return new Date(t).getUTCHours();
  }

  _percentil(ordenados, p) {
    if (ordenados.length === 0) return null;
    const i = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1));
    return ordenados[i];
  }
}

module.exports = MedidaCocina;
module.exports.MINIMO_N = MINIMO_N;
module.exports.BUCKETS = BUCKETS;
