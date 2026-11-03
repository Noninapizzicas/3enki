'use strict';

/**
 * contrato-tramos · CUSTODIO · PLAZA — E06 (ContratoTramos) + N02 (SimuladorTramos).
 *
 * EL CONTRATO DE TRAMOS, CON VIGENCIA. Tres tramos (1 · 2 · 3): un fijo mensual y unos céntimos
 * por pedido, y A QUIÉN. El contratante de la TIENDA es la plaza, no el nacional (Q42): si
 * facturara el nacional, el contrato estaría roto en dos y el canon no tendría con qué
 * justificarse.
 *
 * Tres reglas que son el módulo:
 *
 *   1. VIGENCIA, NO VERDAD DE HOY. Un cambio rige desde su hora y no reescribe lo ya devengado.
 *      `vigente(parte, instante)` devuelve el contrato que estaba VIVO en aquel instante, no el
 *      de hoy (R5 del determinismo): la cuenta de una tienda no cambia sola a fin de mes.
 *   2. LA FORMA ES CERRADA. Tramo, fijo, céntimos por pedido, a quién, desde, autor y acta. Ni
 *      antigüedad, ni exclusividad, ni cuota mínima, ni permanencia (Q34/Q35): si viajan, 409.
 *   3. SIN ACEPTACIÓN NO HAY DEVENGO. El contrato lo declara la plaza con autor y acta, pero no
 *      devenga hasta que la parte lo acepta (I08, `bocaos.terminos_aceptados`). Se dice con
 *      `devenga: false` y su motivo; no se finge que consta.
 *
 * Y N02: el simulador recalcula con los hechos de ESA tienda (sus pedidos, sus cargos), no con
 * una media del mercado. Simula, no aplica: el contrato se cambia declarando, con acta.
 *
 * Los valores de la tabla son PROVISIONALES (Q14) y viven en una sola constante: el día que se
 * sepan, se cambian aquí y todos los que leen el tramo ven lo mismo.
 *
 * Isla: cero require a otra isla. Lo que necesita lo pide al bus; nadie más escribe este hecho.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

// E06 · la tabla de tramos. PROVISIONAL (Q14): valores de ejemplo de pizzepos, revisables.
const TRAMOS = {
  1: { fijo_mensual_cents: 3900, cents_por_pedido_rider: 10, cents_por_pedido_tienda: 20 },
  2: { fijo_mensual_cents: 7900, cents_por_pedido_rider: 10, cents_por_pedido_tienda: 20 },
  3: { fijo_mensual_cents: 14900, cents_por_pedido_rider: 10, cents_por_pedido_tienda: 20 }
};

const PARTES = ['rider', 'tienda'];

// Q34/Q35: lo que la forma NO tiene. Si llega, el contrato no se escribe.
const PROHIBIDAS = [
  'antiguedad', 'antiguedad_meses', 'exclusividad', 'cuota_minima', 'cuota_minima_cents',
  'permanencia', 'permanencia_meses', 'prioridad', 'minimo_pedidos', 'penalizacion'
];

const CENTIMOS = (v) => Number.isInteger(v) && v >= 0;

class ContratoTramos extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'contrato-tramos';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/contrato-tramos.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onDeclararRequest(e) { return this.servir(e, 'declarar', 'contrato-tramos.declarar', (d) => this._declarar(d)); }
  onVigenteRequest(e) { return this.servir(e, 'vigente', 'contrato-tramos.vigente', (d) => this._vigente(d)); }
  onSimularRequest(e) { return this.servir(e, 'simular', 'contrato-tramos.simular', (d) => this._simular(d)); }

  // ================= hechos que escucha =================
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // I08: la parte acepta el tramo que le rige. Sin esto no hay devengo ni propuesta para ella.
  async onTerminosAceptados(e) {
    const d = this.datos(e);
    if (!d.project_id) return null;
    const parte_id = d.parte_id || d.rider_id || d.tienda_id;
    if (!parte_id) return null;

    const est = await this.estado(d.project_id);
    const vigente = this._vivo(est, parte_id, this._iso(d.hora) || this.ahora());
    if (!vigente) {
      // El hecho no se tira: se apunta para cuando la declaración llegue.
      est.pendientes = est.pendientes || {};
      est.pendientes[parte_id] = {
        terminos: { version: String(d.version ?? ''), hora: this._iso(d.hora) || this.ahora() }
      };
      await this.guardar(d.project_id);
      return null;
    }
    vigente.aceptado_en = this._iso(d.hora) || this.ahora();
    vigente.aceptado_version = d.version === undefined ? null : String(d.version);
    await this.guardar(d.project_id);
    this.logger?.info('contrato-tramos.aceptado', { parte_id, contrato_id: vigente.contrato_id });
    return null;
  }

  // El acta es la puerta firmada: si trae tramos, entra por la MISMA validación que declarar.
  async onActaAnotada(e) {
    const d = this.datos(e);
    if (!d.project_id) return null;
    const bruto = d.tramos || d.contrato;
    if (!bruto) return null;
    const parte_id = bruto.parte_id || d.parte_id || d.rider_id || d.tienda_id;
    if (!parte_id) return null;
    return this._declarar({
      project_id: d.project_id,
      plaza_id: d.plaza_id,
      parte_id,
      parte: bruto.parte || d.parte || null,
      tramo: bruto.tramo,
      fijo_mensual_cents: bruto.fijo_mensual_cents,
      cents_por_pedido: bruto.cents_por_pedido,
      desde: bruto.desde || d.desde || d.hora,
      autor: d.autor || d.firmado_por,
      acta: d.acta || d.acta_id || d.asiento_id
    });
  }

  // ================= E06 · declarar (ORDEN) =================
  async _declarar(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.parte_id) return this._invalid('parte_id');

    const parte = d.parte || (d.rider_id ? 'rider' : (d.tienda_id ? 'tienda' : null));
    if (!PARTES.includes(parte)) {
      return this._errorResponse(400, 'INVALID_INPUT', `parte debe ser ${PARTES.join(' | ')}: el contrato es de una parte`, { field: 'parte' });
    }
    // Q42: el contratante de la tienda es la plaza. Una declaración de tramos nunca es del nacional.
    if (d.unidad === 'nacional' || d.ambito === 'nacional') {
      return this._errorResponse(409, 'CONTRATO_ES_DE_LA_PLAZA',
        'el contratante de la tienda es la plaza, no el nacional (Q42)', { field: 'unidad' });
    }

    const prohibidas = PROHIBIDAS.filter((k) => d[k] !== undefined && d[k] !== null);
    if (prohibidas.length > 0) {
      return this._errorResponse(409, 'FORMA_CERRADA',
        'el tramo es fijo + céntimos por pedido: no hay antigüedad, ni exclusividad, ni cuota mínima (Q34/Q35)',
        { field: prohibidas[0], rechazos: prohibidas });
    }
    const forma = ['contrato_id', 'project_id', 'plaza_id', 'parte', 'parte_id', 'rider_id', 'tienda_id',
      'tramo', 'fijo_mensual_cents', 'cents_por_pedido', 'desde', 'autor', 'acta',
      // lo que el bus pega a cualquier hecho (no son términos del contrato)
      'request_id', 'correlation_id', 'origen', 'publicado_en', 'timestamp', 'hora'];
    const fueraDeForma = Object.keys(d).filter((k) => !forma.includes(k) && !PROHIBIDAS.includes(k) && !k.startsWith('_'));
    if (fueraDeForma.length > 0) {
      return this._errorResponse(409, 'FORMA_CERRADA',
        'lo que no está en la tabla del tramo no se guarda: se dice el campo y no se escribe el contrato',
        { field: fueraDeForma[0], rechazos: fueraDeForma });
    }

    const tramo = Number(d.tramo);
    if (![1, 2, 3].includes(tramo)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'tramo debe ser 1 | 2 | 3', { field: 'tramo' });
    }
    const autor = this._autor(d.autor);
    if (!autor) {
      return this._errorResponse(400, 'INVALID_INPUT', 'autor requerido: ningún tramo sin autor', { field: 'autor' });
    }
    const acta = d.acta || d.acta_id || (d.autor && typeof d.autor === 'object' ? d.autor.acta : null) || null;
    if (!acta) {
      return this._errorResponse(409, 'SIN_ACTA',
        'ningún tramo se declara sin acta (O02): el contrato mueve dinero, no se cambia de palabra',
        { field: 'acta', hueco: 'sin acta' });
    }

    const tabla = TRAMOS[tramo];
    const fijo = d.fijo_mensual_cents === undefined ? tabla.fijo_mensual_cents : d.fijo_mensual_cents;
    if (!CENTIMOS(fijo)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'fijo_mensual_cents debe ser un entero en céntimos ≥ 0', { field: 'fijo_mensual_cents' });
    }
    const porDefecto = parte === 'rider' ? tabla.cents_por_pedido_rider : tabla.cents_por_pedido_tienda;
    const cents = d.cents_por_pedido === undefined ? porDefecto : d.cents_por_pedido;
    if (!CENTIMOS(cents)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'cents_por_pedido debe ser un entero en céntimos ≥ 0', { field: 'cents_por_pedido' });
    }

    const desde = this._iso(d.desde) || this.ahora();
    const est = await this.estado(d.project_id);
    est.contratos = est.contratos || {};
    est.contratos[d.parte_id] = est.contratos[d.parte_id] || [];

    const declarados = est.contratos[d.parte_id];
    const contrato_id = d.contrato_id || `tr-${crypto.randomUUID().slice(0, 8)}`;
    const ya = declarados.find((x) => x.contrato_id === contrato_id);
    if (ya) {
      return { status: 200, data: { contrato_id, version: ya.version, idempotente: true, contrato: this._vista(ya, desde) } };
    }

    // La vigencia no reescribe el pasado: si ya hay un tramo fechado después, este llega tarde.
    const futura = declarados.find((x) => Date.parse(x.desde) > Date.parse(desde));
    if (futura) {
      return this._errorResponse(409, 'VIGENCIA_RETROACTIVA',
        `no se reescribe lo devengado: ya hay un tramo vigente desde ${futura.desde} (v${futura.version})`,
        { field: 'desde', desde, vigente_desde: futura.desde, version_vigente: futura.version });
    }

    const contrato = {
      contrato_id,
      parte,
      parte_id: d.parte_id,
      plaza_id: this.plaza_id || d.plaza_id || d.project_id,
      tramo,
      fijo_mensual_cents: fijo,
      cents_por_pedido: cents,
      // La tabla completa queda guardada: el día que cambie, este contrato sigue diciendo la suya.
      tabla: { ...tabla },
      version: declarados.length + 1,
      autor,
      acta: String(acta),
      desde,
      declarado_en: this.ahora(),
      aceptado_en: null,
      aceptado_version: null
    };
    declarados.push(contrato);
    await this.guardar(d.project_id);

    this.hecho('bocaos.tramos_actualizados', {
      contrato_id,
      plaza_id: contrato.plaza_id,
      parte,
      parte_id: contrato.parte_id,
      tramo,
      fijo_mensual_cents: fijo,
      cents_por_pedido: cents,
      version: contrato.version,
      autor,
      acta: contrato.acta,
      desde,
      // Sin aceptación de la parte no hay devengo: el hecho lo dice, no lo calla.
      devenga: false,
      motivo_devengo: 'pendiente de aceptación de la parte (I08)'
    });

    return { status: 201, data: { contrato_id, version: contrato.version, desde, contrato: this._vista(contrato, desde) } };
  }

  // ================= E06 · el vigente (PREGUNTA) =================
  // Devuelve el contrato que estaba VIVO en el instante pedido. No el de hoy: el de entonces.
  async _vigente(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.parte_id) return this._invalid('parte_id');
    const instante = this._iso(d.instante) || this.ahora();
    const est = await this.estado(d.project_id);
    const contrato = this._vivo(est, d.parte_id, instante);
    if (!contrato) {
      return {
        status: 200,
        data: {
          contrato: null,
          no_consta: true,
          parte_id: d.parte_id,
          instante,
          // E06: sin contrato vigente aceptado no hay devengo ni propuesta para esa parte.
          devenga: false,
          motivo: 'sin contrato vigente para esa parte en ese instante'
        }
      };
    }
    const vista = this._vista(contrato, instante);
    return { status: 200, data: { contrato: vista, no_consta: false, instante, devenga: vista.devenga, motivo: vista.motivo_devengo } };
  }

  // ================= N02 · simular (PREGUNTA) =================
  // Recalcula con los hechos de ESA parte. No con una media del mercado. Y no aplica.
  async _simular(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.parte_id) return this._invalid('parte_id');
    const hechos = Array.isArray(d.hechos) ? d.hechos : (Array.isArray(d.pedidos) ? d.pedidos : null);
    if (!hechos || hechos.length === 0) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'hechos requeridos: el simulador recalcula sobre hechos de esa parte, no sobre un ejemplo de folleto',
        { field: 'hechos' });
    }

    const instante = this._iso(d.instante) || this.ahora();
    const est = await this.estado(d.project_id);
    const actual = this._vivo(est, d.parte_id, instante);

    const alt = d.alternativa || d.tramo_alternativo || {};
    const tramo = Number(alt.tramo ?? d.tramo);
    if (![1, 2, 3].includes(tramo)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'la alternativa exige tramo 1 | 2 | 3', { field: 'alternativa.tramo' });
    }
    const tabla = TRAMOS[tramo];
    const parte = (actual && actual.parte) || d.parte || (d.rider_id ? 'rider' : 'tienda');
    const fijo_alt = alt.fijo_mensual_cents === undefined ? tabla.fijo_mensual_cents : alt.fijo_mensual_cents;
    const cents_alt = alt.cents_por_pedido === undefined
      ? (parte === 'rider' ? tabla.cents_por_pedido_rider : tabla.cents_por_pedido_tienda)
      : alt.cents_por_pedido;
    if (!CENTIMOS(fijo_alt) || !CENTIMOS(cents_alt)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'la alternativa se expresa en céntimos enteros', { field: 'alternativa' });
    }

    // Sólo cuenta lo que consta: un pedido sin hecho de entrega no devenga céntimos por pedido.
    const filas = hechos.map((h, i) => {
      const entregado = h.entregado === true || h.estado === 'ENTREGADO';
      const cargos = Number.isInteger(h.cargos_centimos) ? h.cargos_centimos : 0;
      return {
        i,
        pedido_id: h.pedido_id || null,
        entregado,
        cargos_centimos: cargos,
        // Lo que este pedido paga con cada tabla: por pedido entregado + sus cargos.
        antes_cents: actual && entregado ? actual.cents_por_pedido + cargos : (actual ? cargos : null),
        ahora_cents: entregado ? cents_alt + cargos : cargos
      };
    });
    const suma = (k) => filas.reduce((t, f) => t + (Number.isFinite(f[k]) ? f[k] : 0), 0);

    return {
      status: 200,
      data: {
        simulacion: {
          parte,
          parte_id: d.parte_id,
          instante,
          base: actual
            ? { contrato_id: actual.contrato_id, tramo: actual.tramo, fijo_mensual_cents: actual.fijo_mensual_cents, cents_por_pedido: actual.cents_por_pedido, version: actual.version }
            : null,
          alternativa: { tramo, fijo_mensual_cents: fijo_alt, cents_por_pedido: cents_alt },
          filas,
          resumen: {
            n: filas.length,
            entregados: filas.filter((f) => f.entregado).length,
            por_pedido_antes_cents: suma('antes_cents'),
            por_pedido_ahora_cents: suma('ahora_cents'),
            // El fijo es mensual: se compara aparte porque no depende de cuántos pedidos hubo.
            fijo_antes_cents: actual ? actual.fijo_mensual_cents : null,
            fijo_ahora_cents: fijo_alt,
            diferencia_por_pedido_cents: suma('ahora_cents') - suma('antes_cents')
          },
          // Lo que el simulador NO puede decir.
          limites: [
            'recalcula con los hechos de ESA parte; no con una media del mercado (N02)',
            'un pedido sin hecho de entrega no devenga céntimos: se cuenta aparte y se dice',
            'no aplica: cambiar el tramo exige declarar con autor, acta y aceptación (E06 + I08)'
          ],
          aplicada: false
        }
      }
    };
  }

  // ================= la vigencia, como tabla =================
  _vivo(est, parte_id, instante) {
    const t = Date.parse(instante);
    const declarados = (est.contratos && est.contratos[parte_id]) || [];
    const vivos = declarados.filter((x) => Date.parse(x.desde) <= t);
    if (vivos.length === 0) return null;
    vivos.sort((a, b) => {
      const d = Date.parse(b.desde) - Date.parse(a.desde);
      return d !== 0 ? d : b.version - a.version;
    });
    return vivos[0];
  }

  // Cada contrato con sus sellos y su respuesta a la única pregunta que importa: ¿devenga?
  _vista(contrato, instante) {
    const aceptado = !!contrato.aceptado_en;
    return {
      contrato_id: contrato.contrato_id,
      plaza_id: contrato.plaza_id,
      parte: contrato.parte,
      parte_id: contrato.parte_id,
      tramo: contrato.tramo,
      fijo_mensual_cents: contrato.fijo_mensual_cents,
      cents_por_pedido: contrato.cents_por_pedido,
      tabla: contrato.tabla,
      version: contrato.version,
      autor: contrato.autor,
      acta: contrato.acta,
      desde: contrato.desde,
      declarado_en: contrato.declarado_en,
      aceptado_en: contrato.aceptado_en || null,
      aceptado_version: contrato.aceptado_version || null,
      devenga: aceptado,
      motivo_devengo: aceptado ? 'aceptado por la parte (I08)' : 'pendiente de aceptación de la parte (I08)',
      instante: instante || null
    };
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') return a.id || a.nombre || a.rol || null;
    return null;
  }
}

module.exports = ContratoTramos;
module.exports.TRAMOS = TRAMOS;
module.exports.PROHIBIDAS = PROHIBIDAS;
