'use strict';

/**
 * regla-fallo · REFLEJO · PLAZA — G02 (HechoVerificado) + G03 (ReglaPagoFallo) + G06 (TrazabilidadFallo).
 *
 * LA TABLA QUE MIDE UN FALLO: qué hecho lo verifica, quién responde y qué queda trazado.
 * Mide, no juzga. El humano, si acaso, firma.
 *
 *   1. G02 · UN FALLO EXISTE SI Y SÓLO SI LOS HECHOS CON HORA LO VERIFICAN. Sin acta completa no hay
 *      fallo: se dice qué hecho falta y no se adjudica nada. Nunca «seguramente se pasó». Y no
 *      interpreta: no distingue «se pasó porque había cola» de «se pasó porque se olvidó» — eso lo
 *      mira un humano si hace falta, y no cambia el número.
 *   2. G03 · ES UNA TABLA, CON UNA PRUEBA POR FILA. Aquí hay un reloj y una tabla, no un agente que
 *      opina sobre la culpa. Devuelve QUIÉN, no CUÁNTO: los importes están [ABIERTO] (Q28) y salen
 *      como NO_CONSTA — un cargo nace sin importe antes que con un número inventado.
 *   3. G06 · CADA CARGO APUNTA A HECHOS ANTERIORES A ÉL, y se pueden enumerar. Si a un cargo le falta
 *      un hecho, el hecho es posterior al cargo o está desmentido, la traza FALLA. Es la diferencia
 *      entre un cargo y un abuso.
 *
 * Las tres esperas (G01) son tres porque las sufre gente distinta: N1 la espera en tienda (la sufre
 * el rider: la cocina declaró listo más tarde de lo prometido), N2 la espera en el portal (la sufre
 * el cliente) y N3 la espera en la llegada. Sumarlas en una sola N es la forma más rápida de que el
 * que no tuvo la culpa pague. Aquí se miden por separado, y la que no se puede medir se dice.
 *
 * Sin store y sin PosPersistencia: no escribe nada. Lo que mide lo publica como hecho y su dueño
 * (`cargo-fallo`) decide si nace una deuda.
 *
 * Isla: cero require a otra isla.
 */

const ModuloBocaos = require('../_bocaos');

const TIMEOUT_BUS_MS = 2500;
const MAX_SIN_ACTA = 500;

class ReglaFallo extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'regla-fallo';
    this.version = 'reflejo-0.1.0';
    this._path = null;                 // sin store: mide y publica
    this.tiempo_bus_ms = TIMEOUT_BUS_MS;
    this._sinActa = new Map();         // pedido_id → qué hechos faltan (lo dice su custodio)
    this._yaMedidos = new Set();       // pedido_id|hora: un fallo no se mide dos veces por el mismo camino
  }

  // ================= RPC del bus =================
  onEvaluarRequest(e) { return this.servir(e, 'evaluar', 'regla-fallo.evaluar', (d) => this._evaluar(d)); }

  // ================= hechos que escucha =================
  // Un acta incompleta NO es un fallo: es un caso que no se puede adjudicar todavía. Se apunta para
  // que la siguiente pregunta no tenga que volver a descubrirlo.
  async onActaIncompleta(e) {
    const d = this.datos(e);
    if (!d.pedido_id) return null;
    this._sinActa.set(d.pedido_id, Array.isArray(d.faltan) ? d.faltan : []);
    if (this._sinActa.size > MAX_SIN_ACTA) this._sinActa.delete(this._sinActa.keys().next().value);
    return null;
  }

  // Una incidencia abierta es la señal de que algo no salió. Si los hechos lo verifican, se mide; si
  // no, no se dice nada: la incidencia sigue su curso en la cola, que es de quien es.
  async onIncidenciaAbierta(e) {
    const d = this.datos(e);
    if (!d.pedido_id || !d.project_id) return null;
    // Se evalúa en el instante de la queja si lo trae: el caso se abre con su hora, y la medida se
    // hace con los hechos que había entonces.
    const r = await this._evaluar({
      ...d,
      project_id: d.project_id,
      plaza_id: d.plaza_id,
      pedido_id: d.pedido_id,
      instante: d.instante || d.hora || null
    });
    if (r.status >= 400 || !r.data || !r.data.fallo || !r.data.fallo.existe) {
      this.logger?.warn('regla-fallo.no_medible', {
        pedido_id: d.pedido_id, motivo: r.error ? r.error.code : 'sin fallo verificado'
      });
    }
    return null;
  }

  // ================= G02 · G03 · G06 · evaluar (PREGUNTA) =================
  async _evaluar(d) {
    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');

    const instante = this._iso(d.instante) || this.ahora();

    // 1 · el acta del reparto. Sin acta completa no hay fallo (G02).
    const acta = await this._actaDe(d.pedido_id, plaza_id);
    if (!acta || !acta.completa) {
      const delActa = acta && Array.isArray(acta.faltan) && acta.faltan.length > 0 ? acta.faltan : null;
      const faltan = delActa || this._sinActa.get(d.pedido_id) || ['acta del reparto'];
      return {
        status: 200,
        data: {
          fallo: null,
          estado: 'NO_CONSTA',
          motivo: `sin acta completa no hay fallo: falta ${faltan.join(', ')}`,
          faltan,
          pedido_id: d.pedido_id,
          plaza_id
        }
      };
    }

    // 2 · la ventana y la promesa: los números con los que se juzga, con su capa y su autor.
    const [politica, contrato, pedido] = await Promise.all([
      this._politicaDe(plaza_id, instante),
      this._contratoDe(d.pedido_id, plaza_id),
      this._pedidoDe(d.pedido_id, plaza_id)
    ]);

    const ventana = (politica && politica.esperas) || null;
    const relojes = acta.relojes || {};

    // 3 · G02 · las tres esperas, una por una. La que no se puede medir, se dice.
    const esperas = this._medir(relojes, contrato, ventana, instante);

    // 4 · G03 · la tabla: quién responde. Devuelve QUIÉN, no CUÁNTO. Las horas que sostienen cada
    // fila viajan con ella: la evidencia de G06 se enumera con su hora o no es evidencia.
    const filas = this._adjudicar(esperas, {
      pedido_id: d.pedido_id,
      plaza_id,
      tienda_id: (pedido && pedido.tienda_id) || null,
      rider_id: acta.rider_id || (contrato && contrato.rider_id) || null,
      contrato_id: acta.contrato_id || (contrato && contrato.contrato_id) || null,
      horas: {
        prometida: this._iso(contrato && contrato.hora_prometida),
        listo: this._iso(relojes.listo),
        recogida: this._iso(relojes.recogida),
        entrega: this._iso(relojes.entrega)
      }
    });

    // 5 · G06 · la traza de lo que sostiene la tabla.
    const traza = this._traza(esperas, filas, instante);

    const existe = filas.some((f) => f.excedido === true && f.deudor && traza.estado === 'CONFORME');
    const fallo = {
      pedido_id: d.pedido_id,
      plaza_id,
      tienda_id: (pedido && pedido.tienda_id) || null,
      contrato_id: acta.contrato_id || (contrato && contrato.contrato_id) || null,
      rider_id: acta.rider_id || (contrato && contrato.rider_id) || null,
      existe,
      esperas,
      filas,
      traza,
      ventana: ventana ? { capa: politica.capa, version: politica.version, autor: politica.autor, esperas: ventana } : null,
      evaluado_en: instante,
      // Q28 · lo que esta tabla NO puede decir todavía.
      importes: {
        estado: 'NO_CONSTA',
        motivo: 'la tabla de importes por fallo está [ABIERTO] (Q28): se devuelve quién, no cuánto'
      }
    };

    // Solo se publica el HECHO si hay un fallo verificado y trazable. Un «fallo» sin evidencia no se
    // publica: si se publicara, `cargo-fallo` tendría que rechazarlo, y el ruido taparía lo real.
    if (existe) {
      // El mismo pedido con las MISMAS filas excedidas es el mismo fallo, aunque se pregunte otra vez
      // a otra hora: se mide una vez. Si aparece un hecho nuevo que cambia las filas, es otra medida.
      const clave = `${d.pedido_id}|${this.huella(filas.map((f) => ({ fila: f.fila, excedido: f.excedido, min: f.min })))}`;
      if (!this._yaMedidos.has(clave)) {
        this._yaMedidos.add(clave);
        if (this._yaMedidos.size > 2000) this._yaMedidos.delete(this._yaMedidos.values().next().value);
        this.hecho('bocaos.fallo_medido', {
          pedido_id: fallo.pedido_id,
          plaza_id: fallo.plaza_id,
          tienda_id: fallo.tienda_id,
          contrato_id: fallo.contrato_id,
          rider_id: fallo.rider_id,
          esperas: fallo.esperas,
          filas: fallo.filas,
          // G06 · la evidencia enumerable: sin esto, `cargo-fallo` no puede dejar nacer la deuda.
          evidencia: traza.evidencia,
          traza_estado: traza.estado,
          ventana: fallo.ventana,
          importes: fallo.importes,
          hora: instante
        });
      }
    }

    return { status: 200, data: { fallo, estado: existe ? 'MEDIDO' : 'SIN_FALLO' } };
  }

  // ================= G02 · medir =================
  _medir(relojes, contrato, ventana, instante) {
    const esperas = {};
    // Una ventana sin el número no es una ventana: hay medida y no hay cobro, y se dice.
    const hay = (k) => !!(ventana && Number.isFinite(ventana[k]));
    const prometida = this._iso(contrato && contrato.hora_prometida);
    const listo = this._iso(relojes.listo);
    const recogida = this._iso(relojes.recogida);
    const entrega = this._iso(relojes.entrega);

    // N1 · la espera en tienda: lo que la cocina se pasó de la hora prometida. Es lo que el rider
    // espera de pie, y lo que A08 mide. Sin promesa no se mide (no se imputa una promesa).
    if (prometida && listo) {
      const min = this._minutosEntre(prometida, listo);
      esperas.n1_tienda = {
        min,
        limite_min: hay('n1_tienda_min') ? ventana.n1_tienda_min : null,
        excedido: hay('n1_tienda_min') ? min > ventana.n1_tienda_min : null,
        hechos: ['hora prometida del contrato (A24)', 'hora de listo declarada por la cocina (C04/A01)'],
        motivo: hay('n1_tienda_min') ? null : 'sin ventana vigente: hay medida y una medida sin umbral no cobra nada'
      };
    } else {
      esperas.n1_tienda = {
        min: null, limite_min: hay('n1_tienda_min') ? ventana.n1_tienda_min : null, excedido: null,
        motivo: prometida ? 'sin hora de listo en el acta' : 'sin hora prometida en el contrato'
      };
    }

    // N2 · la espera en el portal: la sufre el cliente y NO hay hecho que la mida (F01 no anota la
    // llegada al portal). Se dice; no se estima a partir de la entrega.
    esperas.n2_portal = {
      min: null,
      limite_min: ventana ? ventana.n2_portal_min : null,
      excedido: null,
      motivo: 'no hay hecho de llegada al portal: F01 no lo anota, y sin hecho no hay medida (G02)'
    };

    // N3 · la espera en la llegada: desde la hora prometida hasta la entrega.
    if (prometida && entrega) {
      const min = this._minutosEntre(prometida, entrega);
      esperas.n3_entrega = {
        min,
        limite_min: hay('n3_entrega_min') ? ventana.n3_entrega_min : null,
        excedido: hay('n3_entrega_min') ? min > ventana.n3_entrega_min : null,
        hechos: ['hora prometida del contrato (A24)', 'hora de entrega del acta (F01)'],
        motivo: hay('n3_entrega_min') ? null : 'sin ventana vigente: hay medida y una medida sin umbral no cobra nada'
      };
    } else {
      esperas.n3_entrega = {
        min: null, limite_min: hay('n3_entrega_min') ? ventana.n3_entrega_min : null, excedido: null,
        motivo: prometida ? 'sin hora de entrega en el acta' : 'sin hora prometida en el contrato'
      };
    }

    return esperas;
  }

  // ================= G03 · adjudicar (la tabla) =================
  // Una fila por exceso. `prueba` es la evidencia enumerable de ESA fila (G06). El importe NO se pone:
  // Q28 está abierto y un cero sería un número inventado.
  _adjudicar(esperas, { pedido_id, plaza_id, tienda_id, rider_id, contrato_id, horas = {} }) {
    const filas = [];
    const base = { pedido_id, plaza_id, contrato_id };

    // FILA 1 · la cocina lenta. Es la única que el diseño cierra: «restaurante ↔ rider: la cocina
    // lenta se hace visible y se cobra» (§12). Responde la TIENDA y cobra el RIDER.
    if (esperas.n1_tienda.excedido === true) {
      filas.push({
        ...base,
        fila: 'n1_tienda',
        excedido: true,
        min: esperas.n1_tienda.min,
        limite_min: esperas.n1_tienda.limite_min,
        deudor: tienda_id ? { rol: 'tienda', parte_id: tienda_id } : null,
        acreedor: rider_id ? { rol: 'rider', parte_id: rider_id } : null,
        importe_centimos: null,
        importe_estado: 'NO_CONSTA',
        regla: 'G01 · N1 (espera en tienda) excedida: la cocina declaró listo más tarde de lo prometido, y esa espera la sufre el rider',
        prueba: [
          { hecho: 'contrato', campo: 'hora_prometida', hora: horas.prometida || null },
          { hecho: 'acta', campo: 'relojes.listo', hora: horas.listo || null }
        ]
      });
    } else if (esperas.n1_tienda.excedido === false) {
      filas.push({
        ...base, fila: 'n1_tienda', excedido: false, min: esperas.n1_tienda.min,
        limite_min: esperas.n1_tienda.limite_min, deudor: null, acreedor: null,
        importe_centimos: null, importe_estado: 'NO_CONSTA',
        regla: 'G01 · N1 dentro de la ventana: no hay fallo que cobrar',
        prueba: [
          { hecho: 'contrato', campo: 'hora_prometida', hora: horas.prometida || null },
          { hecho: 'acta', campo: 'relojes.listo', hora: horas.listo || null }
        ]
      });
    }

    // FILA 2 · la llegada tarde. Si la cocina ya llegó tarde, el retraso tiene un hecho anterior que
    // lo explica; si no, el retraso es del reparto — y quién responde en un enlace es Q21 [ABIERTA].
    if (esperas.n3_entrega.excedido === true) {
      const causaCocina = esperas.n1_tienda.excedido === true;
      filas.push({
        ...base,
        fila: 'n3_entrega',
        excedido: true,
        min: esperas.n3_entrega.min,
        limite_min: esperas.n3_entrega.limite_min,
        deudor: null,
        acreedor: null,
        importe_centimos: null,
        importe_estado: 'NO_CONSTA',
        regla: causaCocina
          ? 'G03 · la llegada se pasó y la cocina ya se había pasado: hay dos causas con hecho y el diseño no reparte culpa entre ellas'
          : 'G03 · la llegada se pasó sin que la cocina se pasara: el retraso es del reparto, y quién responde en un enlace es Q21 [ABIERTA]',
        adjudicado: false,
        motivo_no_adjudicado: causaCocina
          ? 'la tabla cierra «la cocina lenta» contra el rider (N1); el retraso del cliente no tiene fila cerrada'
          : 'Q21 [ABIERTA]: no se inventa un responsable',
        prueba: [
          { hecho: 'contrato', campo: 'hora_prometida', hora: horas.prometida || null },
          { hecho: 'acta', campo: 'relojes.entrega', hora: horas.entrega || null }
        ]
      });
    }

    // FILA 3 · el portal: no hay hecho. Se dice para que nadie lo cuente como cero.
    if (esperas.n2_portal.excedido === null) {
      filas.push({
        ...base, fila: 'n2_portal', excedido: null, min: null, limite_min: esperas.n2_portal.limite_min,
        deudor: null, acreedor: null, importe_centimos: null, importe_estado: 'NO_CONSTA',
        regla: 'G02 · sin hecho de llegada al portal no hay medida',
        motivo: esperas.n2_portal.motivo,
        prueba: []
      });
    }

    return filas;
  }

  // ================= G06 · la traza =================
  _traza(esperas, filas, instante) {
    const t = Date.parse(instante);
    const evidencia = [];
    const fallos = [];

    const anota = (ref) => {
      // Cada evidencia es un hecho CON HORA, anterior al cargo y verificable.
      if (!ref.hora) { fallos.push(`${ref.hecho}.${ref.campo} sin hora: no es un hecho, es una impresión`); return; }
      const h = Date.parse(ref.hora);
      if (!Number.isFinite(h)) { fallos.push(`${ref.hecho}.${ref.campo} con hora ilegible`); return; }
      if (h > t) { fallos.push(`${ref.hecho}.${ref.campo} es POSTERIOR al cargo: un cargo no puede apoyarse en el futuro`); return; }
      evidencia.push(ref);
    };

    for (const f of filas) {
      if (f.excedido !== true) continue;
      // Una fila sin partes no es un cargo: es una no-adjudicación dicha (Q21, o la cocina contra el
      // reparto). No puede sostener una deuda y no puede hundir la traza de la que sí lo hace.
      if (!f.deudor || !f.acreedor) continue;
      for (const ref of f.prueba || []) anota(ref);
      // El importe sin número no es un fallo de la traza: es una deuda declarada.
      if (f.importe_centimos !== null) fallos.push(`${f.fila}: lleva importe cuando la tabla no tiene importes (Q28)`);
    }

    return {
      estado: fallos.length === 0 ? 'CONFORME' : 'FALLA',
      evidencia,
      fallos,
      // Q30 · sin prueba, ¿a favor de quién? Abierto: aquí sólo se dice que la traza no sostiene el cargo.
      nota: fallos.length === 0
        ? 'cada fila excedida apunta a hechos anteriores a ella, con hora y enumerables'
        : 'la traza NO sostiene el cargo: no nace deuda'
    };
  }

  // ================= lo que se pide al bus =================
  async _actaDe(pedido_id, plaza_id) {
    try {
      const r = await this._rpc('hechos-reparto.acta.request', {
        project_id: plaza_id, plaza_id, pedido_id
      }, { timeout_ms: this.tiempo_bus_ms });
      if (!r || r.status !== 200 || !r.data) return null;
      if (!r.data.completa) return { completa: false, faltan: r.data.faltan || [] };
      // La hora de cada hecho va CON el acta: la evidencia de G06 se enumera con ellas.
      const acta = r.data.acta || {};
      return {
        completa: true,
        contrato_id: acta.contrato_id || null,
        rider_id: acta.rider_id || null,
        relojes: acta.relojes || {},
        prueba: acta.prueba || null
      };
    } catch (_) {
      return null;
    }
  }

  async _politicaDe(plaza_id, instante) {
    try {
      const r = await this._rpc('config-mercado.politica.request', {
        project_id: plaza_id, plaza_id, instante
      }, { timeout_ms: this.tiempo_bus_ms });
      return (r && r.status === 200 && r.data) ? r.data.politica : null;
    } catch (_) {
      return null;
    }
  }

  async _contratoDe(pedido_id, plaza_id) {
    try {
      const r = await this._rpc('contrato-puntual.de.request', {
        project_id: plaza_id, plaza_id, pedido_id
      }, { timeout_ms: this.tiempo_bus_ms });
      return (r && r.status === 200 && r.data) ? r.data.contrato : null;
    } catch (_) {
      return null;
    }
  }

  async _pedidoDe(pedido_id, plaza_id) {
    try {
      const r = await this._rpc('pedido-mercado.de.request', {
        project_id: plaza_id, plaza_id, pedido_id
      }, { timeout_ms: this.tiempo_bus_ms });
      return (r && r.status === 200 && r.data) ? r.data.pedido : null;
    } catch (_) {
      return null;
    }
  }
}

module.exports = ReglaFallo;
