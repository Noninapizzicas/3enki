/**
 * contabilidad-analitica/ajuste-inventario — REFLEJO STATELESS (H3, hoja del plan).
 *
 * LA REGULARIZACION de la merma/rotura: deriva la DIFERENCIA entre el stock TEORICO y el
 * stock REAL y la expresa VALORADA, con su asiento PROPUESTO y la marca de AVISO. Calculo
 * PURO, determinista.
 *
 * ATRIBUTOS del diseno: `teorico:Cuantía` y `real:Cuantía`.
 *   - Ambas son CANTIDADES DECLARADAS por el negocio (lo que el sistema cree que hay y lo
 *     que el recuento encontro). El reflejo NUNCA estima una de las dos: si falta una, la
 *     diferencia queda `[ABIERTO]` — jamas se asume 0 (un teorico 0 inventado convertiria
 *     toda la merma en una compra fantasma).
 *   - El VALOR UNITARIO del ajuste es ParametroDeclarable: entra declarado, o lo trae la
 *     capa de valor de `valoracion-existencia` (H1) POR EVENTO. Sin el, la diferencia en
 *     CANTIDAD se declara igual, pero el ajuste en VALOR queda `[ABIERTO]`.
 *
 * El ASIENTO y el AVISO son la SALIDA del calculo, no su efecto: el reflejo PROPONE el
 * asiento (cuenta + importe derivados) y DECLARA el aviso; NO escribe, NO persiste, NO
 * decide la contrapartida. Quien lo materializa es `escritor-diario` (por EVENTO) y quien
 * lo entrega es la capa de avisos — aqui solo se calcula y se declara que hay desviacion.
 *
 * Invariantes:
 *  - DETERMINISTA: mismo teorico + mismo real → misma diferencia (una sola respuesta).
 *  - Dato ausente = desconocido: falta teorico o real → `diferencia:null` y `abierto:true`.
 *    Nada se estima; ningun valor se rellena con 0.
 *  - NO escribe, NO persiste, NO muta: el stock es de `inventario`.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja H3 del plan-construccion y diseno-oop.md (CLASE AjusteInventario).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AjusteInventario extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ajuste-inventario';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onDiferenciaRequest(e) {
    return this._atender(e, 'diferencia', 'ajuste-inventario.diferencia.response', async (d) => {
      const res = await this._diferencia(d);
      if (res.status !== 200) this.eventBus?.publish('ajuste-inventario.diferencia.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: diferencia(teorico, real) → Asiento propuesto ──
  async _diferencia(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const producto_id = input.producto_id != null ? String(input.producto_id) : null;
    const teorico = this._num(input.teorico != null ? input.teorico : input.stock_teorico);
    const real = this._num(input.real != null ? input.real : input.stock_real);

    // 1) El VALOR UNITARIO del ajuste: declarado, o traido de valoracion-existencia (H1) POR EVENTO.
    const { valor_unitario, fuente_valor } = await this._valorUnitario(pid, producto_id, input);

    // 2) La DIFERENCIA existe con las dos cantidades. Sin una, `[ABIERTO]`.
    const faltan = [];
    if (teorico === null) faltan.push('teorico');
    if (real === null) faltan.push('real');

    const diferencia = faltan.length === 0 ? this._round(real - teorico, 6) : null;

    // 3) El AJUSTE VALORADO: solo con la diferencia Y el valor unitario. Sin valor → abierto.
    let ajuste_valorado = null;
    if (diferencia !== null && valor_unitario !== null) {
      ajuste_valorado = this._round(diferencia * valor_unitario, 2);
    }
    const valor_abierto = diferencia !== null && valor_unitario === null;

    // 4) El ASIENTO PROPUESTO: se DERIVA (cuenta por el tipo declarado), no se decide aqui.
    const asiento_propuesto = ajuste_valorado === null ? null : {
      concepto: input.concepto || input.motivo || 'regularizacion de inventario',
      producto_id,
      cantidad: diferencia,
      valor_unitario,
      importe: ajuste_valorado,
      // El SIGNO se DERIVA: merma/rotura (real<teorico) → negativo; sobrante → positivo.
      signo: ajuste_valorado > 0 ? 'sobrante' : (ajuste_valorado < 0 ? 'merma' : 'nulo'),
      // El corte (cuenta/contrapartida/periodo) NO vive aqui: lo fija el escritor del diario.
      imputacion_delegada_a: 'escritor-diario'
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        producto_id,
        teorico,
        real,
        diferencia,
        valor_unitario,
        fuente_valor,
        ajuste_valorado,
        asiento_propuesto,
        // El AVISO se DECLARA (hay desviacion), no se entrega: la entrega es de otra capa.
        aviso: diferencia !== null && diferencia !== 0 ? 'desviacion_inventario' : null,
        hay_desviacion: diferencia !== null ? diferencia !== 0 : null,
        tipo: diferencia === null ? null
          : (diferencia < 0 ? 'merma' : (diferencia > 0 ? 'sobrante' : 'sin_desviacion')),
        abierto: faltan.length > 0 || valor_abierto,
        faltan: valor_abierto ? [...faltan, 'valor_unitario'] : faltan,
        motivo: faltan.length > 0
          ? `no se deriva la diferencia: falta ${faltan.join(' y ')}`
          : (valor_abierto ? 'la diferencia se declara, pero el ajuste valorado queda [ABIERTO]: falta valor_unitario' : null)
      }
    };
  }

  // El valor unitario: declarado, o traido de la capa de valor (H1) POR EVENTO.
  async _valorUnitario(pid, producto_id, input = {}) {
    const declarado = this._num(input.valor_unitario != null ? input.valor_unitario : input.coste_unitario);
    if (declarado !== null) return { valor_unitario: declarado, fuente_valor: 'declarado' };

    if (!producto_id) return { valor_unitario: null, fuente_valor: null };
    const r = await this._rpc('valoracion-existencia.valorar.request',
      { project_id: pid, producto_id, fecha: input.fecha, metodo: input.metodo }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (!data) return { valor_unitario: null, fuente_valor: null };
    // La capa de valor devuelve un total; el unitario se DERIVA dividiendo por la cantidad
    // ya valorada (no se estima: si no hay cantidad > 0, no hay unitario).
    const total = this._num(data.valor);
    const cant = this._num(data.cantidad);
    if (total !== null && cant !== null && cant > 0) {
      return { valor_unitario: this._round(total / cant, 6), fuente_valor: 'valoracion-existencia' };
    }
    return { valor_unitario: null, fuente_valor: null };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolDiferencia(params) { return this._diferencia(params); }
}

module.exports = AjusteInventario;
