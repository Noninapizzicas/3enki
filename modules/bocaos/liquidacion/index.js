'use strict';

/**
 * liquidacion · CUSTODIO · PLAZA — H01 · H02 · H05 · E04 · E05 · A32 · H06.
 *
 * EL ÚNICO DINERO DE LA PLAZA. Devengo por contrato vigente en la hora del hecho, ciclo semanal
 * cerrado e inmutable, reparto del pago en cobros directos y la guarda de que la plaza no retiene
 * lo ajeno.
 *
 *   1. H01/E04 · SE DEVENGA POR PEDIDO ACEPTADO, con la tarifa del contrato que estaba VIVO cuando
 *      ocurrió el hecho — no la de hoy. Nunca por kilómetro ahorrado, nunca por viaje, nunca por
 *      porcentaje del ticket (A32). Y se devuelven DOS cifras: lo seguro y lo que está en duda
 *      (un pedido cancelado tras aceptar, Q18). No se elige: elegir es del dueño y queda en acta.
 *   2. H02 · UN CIERRE NO SE REABRE. El segundo cierre del mismo periodo devuelve el mismo cierre,
 *      no uno nuevo; una corrección es una nota en el periodo siguiente. El ciclo NO incluye el
 *      canon: si lo incluyera, apagar el nacional dejaría de ser posible (auditoría 4).
 *   3. H06/A32 · LA PLAZA NO RETIENE. Ningún cierre descuenta una deuda ni un kilómetro ahorrado,
 *      y el reparto del pago (E05) pone a la plaza sólo en los cobros de SU cuota: comida y
 *      reparto son cobros DIRECTOS entre las partes.
 *
 * LO QUE NO SE INVENTA (y por eso sale NO_CONSTA en vez de un número):
 *   · LA PARTE DEL FIJO QUE TOCA A UN PERIODO. El fijo es MENSUAL y el ciclo es SEMANAL; el
 *     prorrateo no está en el diseño (Q26 [ABIERTO]). Si quien cierra declara `prorrateo`
 *     (`dias_periodo` y `dias_mes`), se calcula con SUS números; si no, se devenga el variable y
 *     el fijo se declara NO_CONSTA con su motivo. Un fijo inventado sería una cuota que nadie pactó.
 *   · LA MORA (H05). Los días, el recargo y el aviso previo están [ABIERTOS]: la escala se recibe
 *     declarada (`escala_mora`); sin escala no hay recargo ni suspensión, sólo la deuda visible.
 *   · EL CANON (E05 · cobro 5). Lo emite el nacional (R26): aquí sólo se enumera el camino.
 *
 * Single-writer: nadie más escribe este hecho. Store `/bocaos/liquidacion.json` por proyecto.
 * Isla: cero require a otra isla. Lo que necesita lo pide al bus (contrato-tramos, pedido-mercado).
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const TIMEOUT_CONTRATO_MS = 2500;
const TIMEOUT_PEDIDO_MS = 1500;
const LOTE = 8;

const JOB_CICLO = 'bocaos.ciclo_semanal';

// A32/H06 · lo que NO puede entrar en un cálculo de la cuota. Si aparece, el cierre no se hace.
const CAPTURA_DEL_AHORRO = [
  'km_ahorrados', 'kilometros_ahorrados', 'ahorro_centimos', 'ahorro_generado',
  'pedidos_enlazados', 'enlaces', 'porcentaje_ticket', 'pct_ticket', 'comision_pct'
];
const RETENCION = ['descontar_cargos', 'compensar_deudas', 'descontar_de_devengo', 'retener', 'netear_cargos'];

class Liquidacion extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'liquidacion';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/liquidacion.json';
    this.job_ciclo = JOB_CICLO;
  }

  // ================= RPC del bus (una línea por op) =================
  onAbrirRequest(e) { return this.servir(e, 'abrir', 'liquidacion.abrir', (d) => this._abrir(d)); }
  onCerrarRequest(e) { return this.servir(e, 'cerrar', 'liquidacion.cerrar', (d) => this._cerrar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'liquidacion.de', (d) => this._de(d)); }
  onCuentaRequest(e) { return this.servir(e, 'cuenta', 'liquidacion.cuenta', (d) => this._cuenta(d)); }

  // ================= hechos que escucha =================
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (!d.project_id) return null;
    const est = await this.estado(d.project_id);

    // Q26 [ABIERTO]: el día y la hora del ciclo no se inventan. Se programa SÓLO si la plaza los
    // declara (`ciclo.horario`, expresión cron). Sin horario, el ciclo se cierra a mano y se dice.
    const ciclo = d.ciclo || (d.config && d.config.ciclo) || null;
    if (ciclo && typeof ciclo.horario === 'string' && ciclo.horario.trim()) {
      est.job = est.job || {};
      if (!est.job.ciclo) {
        est.job.ciclo = { nombre: this.job_ciclo, horario: ciclo.horario.trim(), creado_en: this.ahora() };
        await this.guardar(d.project_id);
        this.eventBus.publish('scheduler.job.created', {
          name: this.job_ciclo,
          description: 'cierre del ciclo semanal de la plaza (H02)',
          project_id: d.project_id,
          trigger: { type: 'cron', expression: est.job.ciclo.horario },
          action: { type: 'mqtt', topic: 'bocaos.ciclo_semanal.disparo' },
          options: { enabled: true, overlap: false }
        });
      }
    }
    return null;
  }

  // El contrato puntual de un pedido: es la prueba de que hubo ACEPTACIÓN, y por tanto la base del
  // devengo (H01: un pedido que no tuvo aceptación no devenga nada).
  async onContratoCreado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    const est = await this.estado(d.project_id);
    est.pedidos = est.pedidos || {};
    if (est.pedidos[d.pedido_id]) return null;     // un pedido aceptado una vez, devenga una vez
    const hora = this._iso(d.hora_aceptacion || d.hora_contrato) || this.ahora();
    est.pedidos[d.pedido_id] = {
      pedido_id: d.pedido_id,
      plaza_id: d.plaza_id || d.project_id,
      contrato_id: d.contrato_id || null,
      rider_id: d.rider_id || null,
      tienda_id: d.tienda_id || null,
      hora_aceptacion: hora,
      precio_cents: Number.isInteger(d.precio_cents) ? d.precio_cents : null,
      periodo: this._periodoDe(hora)
    };
    await this.guardar(d.project_id);
    return null;
  }

  // Los hechos del reparto no mueven la cuota (H01 devenga por pedido ACEPTADO): se guardan porque
  // son lo que la cuenta de la parte necesita para distinguir ganado de reclamado (M01).
  async onHechoRepartoAnotado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    const est = await this.estado(d.project_id);
    est.reparto = est.reparto || {};
    const r = (est.reparto[d.pedido_id] = est.reparto[d.pedido_id] || { hechos: [] });
    r.hechos.push({ tipo: d.tipo, hora: this._iso(d.hora), autor: d.autor || null });
    await this.guardar(d.project_id);
    return null;
  }

  // Una deuda anotada se VE en el cierre y NO se descuenta de ningún devengo (H06). Se guarda para
  // que la cuenta de las dos partes la pueda nombrar.
  async onCargoAnotado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.cargo_id) return null;
    const est = await this.estado(d.project_id);
    est.cargos = est.cargos || {};
    est.cargos[d.cargo_id] = {
      cargo_id: d.cargo_id,
      pedido_id: d.pedido_id || null,
      deudor: d.deudor || null,
      acreedor: d.acreedor || null,
      importe_centimos: d.importe_centimos === undefined ? null : d.importe_centimos,
      importe_estado: d.importe_estado || 'NO_CONSTA',
      estado: d.estado || 'ANOTADO'
    };
    await this.guardar(d.project_id);
    return null;
  }

  // El disparo del scheduler: se filtra por NOMBRE del job (este despliegue puede tener más jobs).
  async onSchedulerJobTriggered(e) {
    const d = (e && e.data) || e || {};
    const nombre = d.jobName || d.name || (d.job && d.job.name) || null;
    if (nombre !== this.job_ciclo) return null;
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return null;
    const est = await this.estado(project_id);
    const abierto = Object.values(est.periodos || {}).find((p) => p.estado === 'ABIERTO');
    const periodo = abierto ? abierto.periodo : this._periodoDe(this.ahora());
    this.logger?.info('liquidacion.ciclo.disparado', { project_id, periodo });
    const r = await this._cerrar({ project_id, plaza_id: project_id, periodo, cerrado_por: 'scheduler' });
    if (r.status >= 400) {
      // El ciclo falla, pero no se da por cerrado: se dice (un cierre a medias es peor que ninguno).
      this.logger?.warn('liquidacion.ciclo.fallido', { project_id, periodo, code: r.error?.code });
    }
    return null;
  }

  // ================= H02 · abrir (ORDEN) =================
  async _abrir(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    const est = await this.estado(project_id);
    est.periodos = est.periodos || {};

    const periodo = d.periodo || this._periodoDe(d.instante || this.ahora());
    const p = est.periodos[periodo];
    if (p && p.estado === 'CERRADO') {
      return this._errorResponse(409, 'PERIODO_CERRADO',
        'ese periodo ya está cerrado: una corrección es una nota en el periodo siguiente (H02)',
        { field: 'periodo', periodo, cerrado_en: p.cerrado_en });
    }
    if (p) return { status: 200, data: { periodo: p, idempotente: true } };

    const nuevo = {
      periodo,
      plaza_id: d.plaza_id || project_id,
      abierto_en: this._iso(d.instante) || this.ahora(),
      cerrado_en: null,
      estado: 'ABIERTO',
      cierre: null
    };
    est.periodos[periodo] = nuevo;
    await this.guardar(project_id);
    return { status: 201, data: { periodo: nuevo } };
  }

  // ================= H02 · cerrar (ORDEN) — INMUTABLE =================
  async _cerrar(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');

    // A32/H06 · antes de cerrar: si alguien pide un descuento o un porcentaje del ticket, no hay
    // cierre. Un cierre que retiene es el fin del argumento («no somos banco»).
    const veneno = this._veneno(d);
    if (veneno) return this._no_retencion(veneno);

    const est = await this.estado(project_id);
    est.periodos = est.periodos || {};

    const periodo = d.periodo || this._periodoDe(d.instante || this.ahora());
    const existente = est.periodos[periodo];
    if (existente && existente.estado === 'CERRADO') {
      // H02 · el segundo cierre NO cambia el primero. Idempotente, con el mismo cierre y su huella.
      return { status: 200, data: { periodo: existente, cierre: existente.cierre, idempotente: true } };
    }

    const prorrateo = this._prorrateo(d.prorrateo);
    // El hecho del contrato dice el rider y la hora; la TIENDA del pedido vive en el pedido. Sin
    // resolverla, el devengo de la tienda desaparecería en silencio — y el silencio, en dinero, es
    // una parte que no cobra. Se pregunta al que lo sabe y se apunta en el pedido.
    await this._hidratarPedidos(project_id, est, periodo, d);
    const partes = await this._partes(project_id, est, periodo, d);
    const filas = [];
    for (const parte of partes) {
      filas.push(await this._devengar(project_id, est, periodo, parte, prorrateo, d));
    }

    // H06 · el cierre dice lo que NO ha hecho, con nombres: ni descuenta deudas ni toca la comida.
    const cargos = Object.values(est.cargos || {}).filter((c) => c.estado !== 'ANULADO');
    const cierre = {
      cierre_id: `li-${crypto.randomUUID().slice(0, 8)}`,
      periodo,
      plaza_id: d.plaza_id || project_id,
      abierto_en: existente ? existente.abierto_en : this.ahora(),
      cerrado_en: this.ahora(),
      cerrado_por: this._autor(d.cerrado_por) || 'sin declarar',
      partes: filas,
      // El canon NO está (H02): el ciclo cierra sin nacional y sin pedirle permiso a nadie.
      incluye_canon: false,
      canon: { incluido: false, motivo: 'el canon es del nacional (R26); el ciclo de la plaza cierra sin él' },
      // H06 · lo que NO se ha hecho.
      cargos_descontados: [],
      cargos: cargos.map((c) => ({
        cargo_id: c.cargo_id, deudor: c.deudor, acreedor: c.acreedor,
        importe_centimos: c.importe_centimos, importe_estado: c.importe_estado,
        descontado: false, cobrable: false,
        motivo: 'la plaza no retiene: la deuda se ve y no se descuenta (H06/Q29)'
      })),
      retencion: false,
      avisos: []
    };

    // Lo que el cierre no pudo verificar, dicho por el propio cierre (no en un log que nadie lee).
    const sinVerificar = filas.flatMap((f) => f.detalle || []).filter((x) => x.cancelacion_verificada === false);
    if (sinVerificar.length > 0) {
      cierre.avisos.push(`${sinVerificar.length} pedido(s) sin verificación de cancelación: se devengan como seguros (H01) y aquí se dice`);
    }
    const noConsta = filas.filter((f) => f.devenga === false);
    if (noConsta.length > 0) {
      cierre.avisos.push(`${noConsta.length} parte(s) sin contrato vigente aceptado: no devengan (E06)`);
    }
    const sinFijo = filas.filter((f) => f.fijo_estado === 'NO_CONSTA');
    if (sinFijo.length > 0) {
      cierre.avisos.push(`el fijo mensual de ${sinFijo.length} parte(s) no se prorratea sin ` +
        '`prorrateo.dias_periodo`/`dias_mes` declarados (Q26): se devenga el variable y el fijo se declara NO_CONSTA');
    }

    cierre.huella = this.huella({
      periodo: cierre.periodo, partes: cierre.partes, cerrado_en: cierre.cerrado_en
    });
    cierre.estado = 'CERRADO';

    est.periodos[periodo] = {
      periodo,
      plaza_id: cierre.plaza_id,
      abierto_en: cierre.abierto_en,
      cerrado_en: cierre.cerrado_en,
      estado: 'CERRADO',
      cierre
    };
    await this.guardar(project_id);

    // Los HECHOS: un devengo por parte (congelado) y el cierre del ciclo.
    for (const f of filas) {
      this.hecho('bocaos.devengo_anotado', {
        periodo,
        plaza_id: cierre.plaza_id,
        cierre_id: cierre.cierre_id,
        parte_id: f.parte_id,
        parte: f.parte,
        contrato_id: f.contrato_id,
        tramo: f.tramo,
        pedidos: f.pedidos,
        cents_por_pedido: f.cents_por_pedido,
        variable_seguro_centimos: f.variable_seguro_centimos,
        variable_en_duda_centimos: f.variable_en_duda_centimos,
        fijo_periodo_centimos: f.fijo_periodo_centimos,
        fijo_estado: f.fijo_estado,
        total_seguro_centimos: f.total_seguro_centimos,
        total_seguro_estado: f.total_seguro_estado,
        devenga: f.devenga,
        // Y lo que no se ha hecho, en el hecho: nada de esto se descontó.
        descontado: false,
        retenido: false
      });
    }
    this.hecho('bocaos.ciclo_cerrado', {
      cierre_id: cierre.cierre_id,
      periodo,
      plaza_id: cierre.plaza_id,
      cerrado_en: cierre.cerrado_en,
      cerrado_por: cierre.cerrado_por,
      huella: cierre.huella,
      partes: filas.length,
      total_seguro_centimos: this._sumaSegura(filas),
      incluye_canon: false,
      retencion: false,
      avisos: cierre.avisos
    });

    return { status: 201, data: { periodo: est.periodos[periodo], cierre } };
  }

  // ================= H01/E04 · devengar (la proyección) =================
  async _devengar(project_id, est, periodo, parte, prorrateo, d) {
    const pedidos = Object.values(est.pedidos || {}).filter((p) => p.periodo === periodo);

    // E04 · la tarifa del contrato VIGENTE EN LA HORA DEL HECHO, no la de hoy. Se pregunta a su
    // dueño por cada pedido: si la tarifa cambió a mitad de semana, cada pedido lleva la suya.
    const suyos = pedidos.filter((p) => this._esDe(p, parte));
    const contratos = await this._contratosDe(project_id, parte, suyos, d);

    const fila = {
      parte_id: parte.parte_id,
      parte: parte.parte,
      contrato_id: null,
      tramo: null,
      version: null,
      pedidos: suyos.length,
      cents_por_pedido: null,
      variable_seguro_centimos: null,
      variable_en_duda_centimos: null,
      fijo_mensual_centimos: null,
      fijo_periodo_centimos: null,
      fijo_estado: 'NO_CONSTA',
      total_seguro_centimos: null,
      total_seguro_estado: 'NO_CONSTA',
      devenga: false,
      motivo: null,
      detalle: []
    };

    if (contratos.todas === null) {
      // E06 · sin contrato vigente aceptado no hay devengo ni propuesta para esa parte.
      fila.motivo = 'sin contrato de tramos vigente para esa parte en ese periodo (E06): no hay devengo';
      return fila;
    }
    if (contratos.todas.devenga === false) {
      fila.contrato_id = contratos.todas.contrato_id || null;
      fila.tramo = contratos.todas.tramo ?? null;
      fila.motivo = contratos.todas.motivo_devengo || 'el contrato no devenga: falta la aceptación de la parte (I08)';
      return fila;
    }

    fila.devenga = true;
    fila.contrato_id = contratos.todas.contrato_id || null;
    fila.tramo = contratos.todas.tramo ?? null;
    fila.version = contratos.todas.version ?? null;
    fila.fijo_mensual_centimos = Number.isInteger(contratos.todas.fijo_mensual_cents)
      ? contratos.todas.fijo_mensual_cents : null;

    // H01 · dos cifras: lo seguro y lo que depende de una pregunta abierta (Q18).
    let seguro = 0;
    let duda = 0;
    let seguroConocido = true;
    let dudaConocida = true;

    for (const p of suyos) {
      const contrato = contratos.porPedido.get(p.pedido_id) || contratos.todas;
      const cents = Number.isInteger(contrato.cents_por_pedido) ? contrato.cents_por_pedido : null;
      const cancelacion = await this._cancelado(project_id, p, d);

      const enDuda = cancelacion.estado === 'CANCELADO';
      const filaDetalle = {
        pedido_id: p.pedido_id,
        hora_aceptacion: p.hora_aceptacion,
        precio_cents: p.precio_cents,
        cents_por_pedido: cents,
        contrato_id: contrato.contrato_id || fila.contrato_id,
        // Q18 [ABIERTO] · un pedido cancelado tras aceptar NO se decide aquí: queda en duda.
        estado: enDuda ? 'en_duda' : 'seguro',
        motivo: enDuda ? 'cancelado después de aceptar (Q18 [ABIERTO]): no se elige, se dice' : null,
        cancelacion: cancelacion.estado,
        cancelacion_verificada: cancelacion.verificada
      };
      fila.detalle.push(filaDetalle);

      if (cents === null) {
        if (enDuda) dudaConocida = false; else seguroConocido = false;
        continue;
      }
      if (enDuda) duda += cents; else seguro += cents;
    }

    fila.cents_por_pedido = Number.isInteger(contratos.todas.cents_por_pedido)
      ? contratos.todas.cents_por_pedido : null;
    if (!seguroConocido) {
      fila.variable_seguro_centimos = null;
      fila.motivo = 'hay pedidos de esa parte sin tarifa por pedido en su contrato: no se suma un cero';
    } else {
      fila.variable_seguro_centimos = seguro;
    }
    fila.variable_en_duda_centimos = dudaConocida ? duda : null;

    // EL FIJO: mensual, el ciclo semanal. Sin prorrateo declarado no se inventa la parte que toca.
    if (fila.fijo_mensual_centimos === null) {
      fila.fijo_estado = 'NO_CONSTA';
      fila.fijo_periodo_centimos = null;
    } else if (prorrateo) {
      fila.fijo_periodo_centimos = this._round(
        (fila.fijo_mensual_centimos * prorrateo.dias_periodo) / prorrateo.dias_mes, 4);
      fila.fijo_periodo_centimos = Math.round(fila.fijo_periodo_centimos);
      fila.fijo_estado = 'PRORRATEADO';
      fila.prorrateo = { ...prorrateo, regla: 'declarado por quien cierra; Q26 [ABIERTO]' };
    } else {
      fila.fijo_estado = 'NO_CONSTA';
      fila.fijo_periodo_centimos = null;
      fila.motivo_fijo = 'el fijo es mensual y el ciclo semanal: la parte que toca no consta (Q26). ' +
        'Declara `prorrateo.dias_periodo`/`dias_mes` para que se calcule con tus números';
    }

    if (fila.variable_seguro_centimos !== null && fila.fijo_estado === 'PRORRATEADO') {
      fila.total_seguro_centimos = fila.variable_seguro_centimos + (fila.fijo_periodo_centimos || 0);
      fila.total_seguro_estado = 'SUMA';
    } else {
      // Ni un total a medias: se dice qué falta en vez de sumar lo que hay y llamarlo cuota.
      fila.total_seguro_centimos = null;
      fila.total_seguro_estado = 'NO_CONSTA';
    }
    return fila;
  }

  // E04 · contratos por pedido (la tarifa de la hora del hecho). Una sola pregunta por parte si
  // todos los pedidos caen en el mismo contrato; si no, una por pedido.
  async _contratosDe(project_id, parte, pedidos, d) {
    if (d.contratos && typeof d.contratos === 'object' && d.contratos[parte.parte_id]) {
      const dado = d.contratos[parte.parte_id];
      return { todas: dado, porPedido: new Map() };
    }
    const instantes = pedidos.length > 0 ? pedidos.map((p) => p.hora_aceptacion) : [this.ahora()];
    const consultas = [];
    for (const instante of instantes) {
      consultas.push(this._rpc('contrato-tramos.vigente.request', {
        project_id, parte_id: parte.parte_id, instante
      }, { timeout_ms: TIMEOUT_CONTRATO_MS }));
    }
    const respuestas = await this._enLotes(consultas);
    const porPedido = new Map();
    let primera = null;
    let todasIguales = true;
    respuestas.forEach((r, i) => {
      const c = r && r.data ? r.data.contrato : null;
      if (i === 0) primera = c;
      else if (!c || !primera || c.contrato_id !== primera.contrato_id) todasIguales = false;
      if (c && pedidos[i]) porPedido.set(pedidos[i].pedido_id, c);
    });
    return { todas: todasIguales ? primera : primera, porPedido, todasIguales };
  }

  // Una sola pregunta por pedido en todo el cierre: de ella salen la tienda y el estado (Q18).
  async _hidratarPedidos(project_id, est, periodo, d) {
    const suyos = Object.values(est.pedidos || {}).filter((p) => p.periodo === periodo && !p.consultado);
    const consultas = suyos.map((p) => {
      if (d.cancelados && typeof d.cancelados === 'object' && d.cancelados[p.pedido_id] !== undefined) {
        const v = d.cancelados[p.pedido_id];
        p.estado_pedido = v === true || v === 'CANCELADO' ? 'CANCELADO' : (v === false ? 'VIVO' : String(v));
        p.consultado = true;
        return Promise.resolve(null);
      }
      return this._rpc('pedido-mercado.de.request', {
        project_id, pedido_id: p.pedido_id
      }, { timeout_ms: TIMEOUT_PEDIDO_MS }).then((r) => {
        p.consultado = true;
        if (!r || typeof r.status === 'number' && r.status >= 400 || !r.data || !r.data.pedido) {
          p.estado_pedido = 'NO_CONSTA';
          return null;
        }
        const pedido = r.data.pedido;
        p.estado_pedido = pedido.estado || 'NO_CONSTA';
        // La tienda del pedido: el contrato no la trae y es la que paga el tramo de coordinación.
        if (!p.tienda_id && pedido.tienda_id) p.tienda_id = pedido.tienda_id;
        return null;
      });
    });
    await this._enLotes(consultas);
    if (suyos.length > 0) await this.guardar(project_id);
  }

  // Q18 · ¿se canceló después de aceptar? Se pregunta a quien lo sabe; si no contesta, se dice.
  async _cancelado(project_id, pedido, d) {
    if (pedido.consultado) {
      const estado = pedido.estado_pedido || 'NO_CONSTA';
      return { estado, verificada: estado !== 'NO_CONSTA' };
    }
    if (d.cancelados && typeof d.cancelados === 'object' && d.cancelados[pedido.pedido_id]) {
      return { estado: 'CANCELADO', verificada: true };
    }
    if (d.cancelados && typeof d.cancelados === 'object' && d.cancelados[pedido.pedido_id] === false) {
      return { estado: 'VIVO', verificada: true };
    }
    const r = await this._rpc('pedido-mercado.de.request', {
      project_id, pedido_id: pedido.pedido_id
    }, { timeout_ms: TIMEOUT_PEDIDO_MS });
    if (!r || typeof r.status === 'number' && r.status >= 400 || !r.data || !r.data.pedido) {
      return { estado: 'NO_CONSTA', verificada: false };
    }
    return { estado: r.data.pedido.estado || 'NO_CONSTA', verificada: true };
  }

  // Quién se devenga: las partes declaradas en el cierre + las que aparecen en los pedidos. Un
  // rider o una tienda con fijo y sin pedidos en la semana tiene que poder cerrarse igual.
  async _partes(project_id, est, periodo, d) {
    const mapa = new Map();
    const declaradas = Array.isArray(d.partes) ? d.partes : [];
    for (const p of declaradas) {
      const parte_id = typeof p === 'string' ? p : p.parte_id;
      if (!parte_id) continue;
      const parte = typeof p === 'string' ? (String(parte_id).startsWith('rider') ? 'rider' : 'tienda') : (p.parte || 'tienda');
      mapa.set(parte_id, { parte_id, parte });
    }
    for (const pedido of Object.values(est.pedidos || {})) {
      if (pedido.periodo !== periodo) continue;
      if (pedido.rider_id && !mapa.has(pedido.rider_id)) mapa.set(pedido.rider_id, { parte_id: pedido.rider_id, parte: 'rider' });
      if (pedido.tienda_id && !mapa.has(pedido.tienda_id)) mapa.set(pedido.tienda_id, { parte_id: pedido.tienda_id, parte: 'tienda' });
    }
    // El orden es estable: el mismo cierre, los mismos renglones (R5 del determinismo).
    return [...mapa.values()].sort((a, b) => String(a.parte_id).localeCompare(String(b.parte_id)));
  }

  _esDe(pedido, parte) {
    if (parte.parte === 'rider') return pedido.rider_id === parte.parte_id;
    return pedido.tienda_id === parte.parte_id;
  }

  // ================= de (PREGUNTA) =================
  async _de(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    const est = await this.estado(project_id);
    const periodo = d.periodo || this._periodoDe(d.instante || this.ahora());

    const p = est.periodos?.[periodo];
    if (!p) {
      return this._errorResponse(404, 'PERIODO_NO_CONSTA',
        'ese periodo no se ha abierto en esta plaza', { field: 'periodo', periodo });
    }
    if (d.parte_id) {
      const fila = p.cierre ? (p.cierre.partes || []).find((f) => f.parte_id === d.parte_id) : null;
      if (!fila) {
        return this._errorResponse(404, 'PARTE_NO_CONSTA',
          p.cierre ? 'esa parte no tiene devengo en ese cierre' : 'el periodo no está cerrado: no hay devengo congelado',
          { field: 'parte_id', periodo });
      }
      return { status: 200, data: { periodo, estado: p.estado, devengo: fila, cierre_id: p.cierre.cierre_id } };
    }
    return {
      status: 200,
      data: {
        periodo,
        estado: p.estado,
        abierto_en: p.abierto_en,
        cerrado_en: p.cerrado_en,
        cierre: p.cierre || null,
        pedidos: Object.values(est.pedidos || {}).filter((x) => x.periodo === periodo).length,
        // Sin cierre no hay devengo congelado: se dice, no se calcula por detrás.
        devengo_estado: p.cierre ? 'CONGELADO' : 'NO_CONSTA (el periodo no está cerrado)'
      }
    };
  }

  // ================= cuenta (PREGUNTA) · el dinero de la plaza =================
  async _cuenta(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    const est = await this.estado(project_id);
    const periodo = d.periodo || this._periodoDe(d.instante || this.ahora());
    const p = est.periodos?.[periodo];
    const cierre = p && p.cierre ? p.cierre : null;
    const filas = cierre ? cierre.partes : [];

    const cargos = Object.values(est.cargos || {}).filter((c) => c.estado !== 'ANULADO');
    const porParte = {};
    for (const c of cargos) {
      for (const rol of ['deudor', 'acreedor']) {
        const id = c[rol] && c[rol].parte_id;
        if (!id) continue;
        porParte[id] = porParte[id] || { debe: [], le_deben: [] };
        (rol === 'deudor' ? porParte[id].debe : porParte[id].le_deben).push(c.cargo_id);
      }
    }

    return {
      status: 200,
      data: {
        periodo,
        estado: p ? p.estado : 'NO_CONSTA',
        cierre_id: cierre ? cierre.cierre_id : null,
        // H06 · lo que la plaza cobra: su cuota, y sólo su cuota.
        cobra: 'sólo su cuota (tramo + céntimos por pedido aceptado). Nunca la comida ni el reparto (H06)',
        partes: filas.map((f) => ({
          parte_id: f.parte_id, parte: f.parte,
          variable_seguro_centimos: f.variable_seguro_centimos,
          variable_en_duda_centimos: f.variable_en_duda_centimos,
          fijo_periodo_centimos: f.fijo_periodo_centimos,
          fijo_estado: f.fijo_estado,
          total_seguro_centimos: f.total_seguro_centimos,
          total_seguro_estado: f.total_seguro_estado,
          devenga: f.devenga,
          cargos_debe: porParte[f.parte_id] ? porParte[f.parte_id].debe : [],
          cargos_le_deben: porParte[f.parte_id] ? porParte[f.parte_id].le_deben : []
        })),
        total_seguro_centimos: this._sumaSegura(filas),
        total_seguro_estado: filas.length && filas.every((f) => Number.isInteger(f.total_seguro_centimos)) ? 'SUMA' : 'NO_CONSTA',
        // E05 · los caminos del dinero del cierre: la plaza sólo aparece en los de su cuota.
        reparto: cierre ? this._reparto(cierre, { hay_nacional: d.hay_nacional === true }) : null,
        // Los cargos NO se restan nunca: se ven, con nombre (H06/Q29).
        cargos: cargos.map((c) => ({
          cargo_id: c.cargo_id, deudor: c.deudor, acreedor: c.acreedor,
          importe_centimos: c.importe_centimos, importe_estado: c.importe_estado,
          descontado: false, cobrable: false
        })),
        cargos_descontados: [],
        retencion: false,
        mora: this._mora(project_id, est, d),
        nacional: { incluido: false, motivo: 'el canon es del nacional y no entra en el ciclo de la plaza (H02)' }
      }
    };
  }

  // ================= H05 · mora (proyección, no se aplica nada) =================
  // Los valores están [ABIERTOS]: la escala se recibe declarada. Sin escala no hay recargo ni
  // suspensión — sólo la deuda visible, que es lo único que el diseño permite afirmar hoy.
  _mora(project_id, est, d) {
    const escala = this._escala(d.escala_mora);
    if (!escala) {
      return {
        aplica: false, estado: 'NO_CONSTA',
        motivo: 'días, recargo y aviso previo de la mora están [ABIERTOS]: sin `escala_mora` declarada no se aplica nada (H05)',
        pasos: ['recordatorio', 'recargo', 'suspension']
      };
    }
    const deudas = Object.values(est.cargos || {}).filter((c) => c.estado !== 'ANULADO');
    const dias = Number.isFinite(d.dias_impago) ? d.dias_impago : null;
    const paso = (parte_id) => {
      if (dias === null) return { paso: 'NO_CONSTA', motivo: 'sin `dias_impago` no se sabe en qué escalón está' };
      if (dias >= escala.suspension_dias) {
        // H05 · la suspensión NO corta pedidos en vuelo ni propuestas vivas.
        if (d.en_vuelo === true || (Number.isFinite(d.propuestas_vivas) && d.propuestas_vivas > 0)) {
          return {
            paso: 'SUSPENSION_BLOQUEADA',
            motivo: 'no se suspende con pedidos en vuelo o propuestas vivas (H05): se queda en el escalón anterior',
            alcance: 'entrada_de_pedidos_nuevos'
          };
        }
        return { paso: 'SUSPENSION', alcance: 'entrada_de_pedidos_nuevos', corta_pedidos_en_vuelo: false, corta_propuestas_vivas: false };
      }
      if (dias >= escala.recargo_dias) {
        return { paso: 'RECARGO', recargo_centimos: Number.isInteger(escala.recargo_centimos) ? escala.recargo_centimos : null, recargo_estado: Number.isInteger(escala.recargo_centimos) ? 'DECLARADO' : 'NO_CONSTA' };
      }
      if (dias >= escala.recordatorio_dias) return { paso: 'RECORDATORIO' };
      return { paso: 'AL_DIA' };
    };
    const porParte = {};
    for (const c of deudas) {
      const id = c.deudor && c.deudor.parte_id;
      if (!id) continue;
      porParte[id] = porParte[id] || { parte_id: id, cargos: [], ...paso(id) };
      porParte[id].cargos.push(c.cargo_id);
    }
    return {
      aplica: true, estado: 'DECLARADA', escala,
      motivo: 'la escala la declara la plaza: el diseño no fija días ni recargo (H05 [ABIERTO])',
      por_parte: Object.values(porParte),
      // La mora es de ESTA plaza: no se contagia ni se compensa con otra.
      ambito: 'esta plaza'
    };
  }

  _escala(e) {
    if (!e || typeof e !== 'object') return null;
    const n = (v) => Number.isInteger(v) && v >= 0;
    if (!n(e.recordatorio_dias) || !n(e.recargo_dias) || !n(e.suspension_dias)) return null;
    if (e.recargo_dias < e.recordatorio_dias || e.suspension_dias < e.recargo_dias) return null;
    return {
      recordatorio_dias: e.recordatorio_dias,
      recargo_dias: e.recargo_dias,
      suspension_dias: e.suspension_dias,
      recargo_centimos: Number.isInteger(e.recargo_centimos) ? e.recargo_centimos : null,
      aviso_previo_dias: Number.isInteger(e.aviso_previo_dias) ? e.aviso_previo_dias : null
    };
  }

  // ================= E05 · reparto del pago (conversión pura) =================
  // Un precio se convierte en cobros DIRECTOS entre partes. La plaza sólo aparece en los cobros de
  // SU cuota; el cobro del nacional no lo emite ella (R26).
  _reparto(cierre, { hay_nacional = false } = {}) {
    const filas = cierre.partes || [];
    const suma = (parte, campo) => filas
      .filter((f) => f.parte === parte)
      .reduce((t, f) => t + (Number.isInteger(f[campo]) ? f[campo] : 0), 0);
    const conocido = (parte, campo) => filas.filter((f) => f.parte === parte).every((f) => Number.isInteger(f[campo]));

    // El precio del reparto es UNO por pedido: aparece en la fila del rider y en la de la tienda, y
    // sumarlo dos veces convertiría el cobro del cliente al rider en el doble.
    const porPedido = new Map();
    for (const f of filas) {
      for (const x of f.detalle || []) {
        if (x.precio_cents === null || x.precio_cents === undefined) continue;
        if (!porPedido.has(x.pedido_id)) porPedido.set(x.pedido_id, x.precio_cents);
      }
    }
    const precio_rider = [...porPedido.values()].reduce((t, v) => t + v, 0);

    const cobros = [
      {
        n: 1, de: 'cliente', a: 'rider', concepto: 'el precio ÍNTEGRO del reparto',
        importe_centimos: precio_rider || null,
        importe_estado: precio_rider ? 'SUMA' : 'NO_CONSTA',
        intermediaria: false, plaza_cobra: false,
        motivo: precio_rider ? null : 'no consta el precio de los repartos de ese cierre'
      },
      {
        n: 2, de: 'cliente', a: 'tienda', concepto: 'el importe de la comida',
        importe_centimos: null, importe_estado: 'NO_CONSTA',
        intermediaria: false, plaza_cobra: false,
        motivo: 'la comida es de la tienda: la plaza no la toca ni la conoce (H06)'
      },
      {
        n: 3, de: 'tienda', a: 'plaza', concepto: 'su cuota: fijo del tramo + céntimos por pedido aceptado',
        importe_centimos: this._cuotaDe(filas, 'tienda'),
        importe_estado: this._cuotaEstado(filas, 'tienda'),
        intermediaria: false, plaza_cobra: true,
        motivo: null
      },
      {
        n: 4, de: 'rider', a: 'plaza', concepto: 'su cuota: céntimos por pedido aceptado',
        importe_centimos: this._cuotaDe(filas, 'rider'),
        importe_estado: this._cuotaEstado(filas, 'rider'),
        intermediaria: false, plaza_cobra: true,
        motivo: null
      }
    ];
    if (hay_nacional) {
      cobros.push({
        n: 5, de: 'plaza', a: 'nacional', concepto: 'canon',
        importe_centimos: null, importe_estado: 'NO_CONSTA',
        intermediaria: false, plaza_cobra: false,
        motivo: 'el canon lo emite el nacional (R26): aquí sólo se enumera el camino del dinero'
      });
    }
    return {
      cobros,
      regla: 'un precio se convierte en cobros DIRECTOS entre partes: la plaza no es intermediaria de ningún importe que no sea su cuota (E05/H06)',
      // La lista de caminos, para que `guarda-no-recauda` tenga algo que recorrer.
      caminos: cobros.map((c) => `${c.de} → ${c.a}`),
      retencion: false,
      incluye_canon: hay_nacional
    };
  }

  _cuotaDe(filas, parte) {
    const suyas = filas.filter((f) => f.parte === parte);
    if (suyas.length === 0) return 0;
    if (!suyas.every((f) => Number.isInteger(f.total_seguro_centimos))) return null;
    return suyas.reduce((t, f) => t + f.total_seguro_centimos, 0);
  }

  _cuotaEstado(filas, parte) {
    const suyas = filas.filter((f) => f.parte === parte);
    if (suyas.length === 0) return 'SUMA';
    return suyas.every((f) => Number.isInteger(f.total_seguro_centimos)) ? 'SUMA' : 'NO_CONSTA';
  }

  // ================= guardas =================
  _veneno(d) {
    const puesto = (v) => v !== undefined && v !== null && v !== false && v !== 0 && v !== '';
    for (const k of CAPTURA_DEL_AHORRO) if (puesto(d[k])) return { tipo: 'A32', campo: k, code: 'NO_CAPTURA_DEL_AHORRO' };
    for (const k of RETENCION) if (d[k] === true) return { tipo: 'H06', campo: k, code: 'NO_RETENCION' };
    return null;
  }

  _no_retencion(v) {
    if (v.tipo === 'A32') {
      return this._errorResponse(409, 'NO_CAPTURA_DEL_AHORRO',
        'la cuota se calcula por pedido aceptado: kilómetros ahorrados, enlaces o porcentaje del ticket no entran (A32)',
        { field: v.campo, regla: 'A32' });
    }
    return this._errorResponse(409, 'NO_RETENCION',
      'la plaza no retiene: un cierre no descuenta una deuda de un devengo (H06)',
      { field: v.campo, regla: 'H06' });
  }

  _sumaSegura(filas) {
    if (filas.length === 0) return 0;
    return filas.every((f) => Number.isInteger(f.total_seguro_centimos))
      ? filas.reduce((t, f) => t + f.total_seguro_centimos, 0) : null;
  }

  _prorrateo(p) {
    if (!p || typeof p !== 'object') return null;
    const ok = Number.isInteger(p.dias_periodo) && p.dias_periodo > 0 &&
      Number.isInteger(p.dias_mes) && p.dias_mes >= p.dias_periodo;
    return ok ? { dias_periodo: p.dias_periodo, dias_mes: p.dias_mes } : null;
  }

  async _enLotes(promesas) {
    const out = [];
    for (let i = 0; i < promesas.length; i += LOTE) {
      out.push(...await Promise.all(promesas.slice(i, i + LOTE)));
    }
    return out;
  }

  // ISO 8601 (semana del año, en UTC): el periodo del ciclo.
  _periodoDe(iso) {
    const fecha = new Date(iso);
    const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
    const dia = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dia + 3);
    const primero = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const pdia = (primero.getUTCDay() + 6) % 7;
    primero.setUTCDate(primero.getUTCDate() - pdia + 3);
    const semana = 1 + Math.round((d - primero) / 604800000);
    return `${d.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') return a.id || a.parte_id || a.rol || a.nombre || null;
    return null;
  }
}

module.exports = Liquidacion;
module.exports.JOB_CICLO = JOB_CICLO;
