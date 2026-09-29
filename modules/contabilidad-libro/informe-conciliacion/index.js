/**
 * contabilidad-libro/informe-conciliacion — REFLEJO STATELESS (E10, hoja del plan).
 *
 * El DOCUMENTO DE CUADRE: saldo del banco ↔ saldo contable AJUSTADO. La PRUEBA de que cuadra.
 * Compone el informe a partir de lo que YA existe — NO lo produce de la nada:
 *   - el CRUCE extracto ↔ diario (conciliacion-bancaria E1) POR EVENTO,
 *   - las PARTIDAS EN TRANSITO que explican el desfase (partida-conciliatoria E9) POR EVENTO,
 *   - el SALDO contable (saldo-tesoreria) POR EVENTO, si esta disponible.
 *
 * DERIVA, NO DECIDE (invariante): este reflejo NO cierra la conciliacion, NO ajusta el saldo,
 * NO asienta nada y NO juzga si el descuadre es aceptable. Se limita a:
 *   saldo_banco + partidas_en_transito = saldo_contable_ajustado
 * y a DECLARAR si la igualdad se cumple o no (`cuadra:true|false`) y de cuanto es la diferencia.
 * Un descuadre NO se corrige aqui: se declara y su resolucion queda en la cola del humano.
 *
 * Invariantes:
 *  - DETERMINISTA: mismas fuentes → mismo informe (una sola respuesta correcta).
 *  - Dato ausente = desconocido: sin cruce, sin partidas o sin saldo contable NO se estima el
 *    informe; se declara que falta la fuente (`fuentes.<x>_disponible:false`) y el informe queda
 *    `emitido:false`. Jamas se rellena un saldo con 0 ni con un valor por defecto.
 *  - NO escribe, NO persiste, NO muta: E1 cierra el cruce, E9 compone las partidas.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja E10 del plan-construccion y diseno-oop.md (CLASE InformeConciliacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class InformeConciliacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'informe-conciliacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onComponerRequest(e) {
    return this._atender(e, 'componer', 'informe-conciliacion.componer.response', async (d) => {
      const res = await this._componer(d);
      if (res.status !== 200) this.eventBus?.publish('informe-conciliacion.componer.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: componer(periodo) → Informe (deriva, no decide) ──
  async _componer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const periodo = input.periodo != null ? String(input.periodo) : null;

    // 1) El CRUCE (E1) POR EVENTO: es la columna vertebral del informe.
    const { cruce, fuente_cruce } = await this._cruce(pid, input, periodo);
    const cruce_disponible = Boolean(cruce);

    // 2) Las PARTIDAS EN TRANSITO (E9) POR EVENTO: lo que explica el desfase.
    const { partidas, fuente_partidas } = await this._partidas(pid, input, cruce, periodo);
    const partidas_disponible = partidas !== null;

    // 3) El SALDO CONTABLE (saldo-tesoreria) POR EVENTO, si esta disponible.
    const { saldo_contable, saldo_disponible, fuente_saldo } = await this._saldo(pid, input, periodo);

    // 4) El SALDO DEL BANCO: lo declara el extracto/cruce o la peticion. No se deduce.
    const saldo_banco = this._num(
      input.saldo_banco != null ? input.saldo_banco
        : (input.saldo_extracto != null ? input.saldo_extracto
          : (cruce && cruce.saldo_banco != null ? cruce.saldo_banco : null))
    );

    // 5) La ADICION de las partidas en transito que ajustan el saldo contable.
    const suma_transito = partidas
      ? this._round(partidas.reduce((s, p) => s + (this._num(p && p.importe) || 0), 0), 2)
      : null;
    // Saldo contable ajustado = saldo contable + partidas en transito (por definicion del cuadre).
    const saldo_contable_ajustado = (saldo_contable !== null && suma_transito !== null)
      ? this._round(saldo_contable + suma_transito, 2)
      : null;

    // 6) La PRUEBA: ¿cuadra? No se decide nada — se declara la igualdad y su diferencia.
    const comparable = saldo_banco !== null && saldo_contable_ajustado !== null;
    const diferencia = comparable ? this._round(saldo_banco - saldo_contable_ajustado, 2) : null;
    const cuadra = comparable ? diferencia === 0 : null;

    // Sin las fuentes suficientes el informe NO se emite: nada se estima.
    const fuentes_ok = cruce_disponible && partidas_disponible && saldo_banco !== null && saldo_contable !== null;

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        tipo: 'informe-conciliacion',
        emitido: fuentes_ok,
        cuadra,
        diferencia,
        saldo_banco,
        saldo_contable,
        partidas_en_transito: partidas || [],
        suma_transito,
        saldo_contable_ajustado,
        fuentes: {
          cruce_disponible,
          partidas_disponible,
          saldo_disponible,
          fuente_cruce,
          fuente_partidas,
          fuente_saldo
        },
        // Deriva de E1/E9 y de saldo-tesoreria; no cierra nada ni decide sobre el descuadre.
        deriva_de: ['conciliacion-bancaria', 'partida-conciliatoria', 'saldo-tesoreria'],
        // Lo que falta por declarar/llegar (nada se rellena con un valor por defecto).
        abierto: {
          saldo_banco: saldo_banco !== null ? null : 'el saldo del banco no llega declarado (extracto/cruce)',
          saldo_contable: saldo_contable !== null ? null : 'saldo-tesoreria no respondio: no se estima el saldo contable',
          cruce: cruce_disponible ? null : 'E1 (conciliacion-bancaria) no respondio',
          partidas: partidas_disponible ? null : 'E9 (partida-conciliatoria) no respondio',
          descuadre: (cuadra === false)
            ? 'la conciliacion NO cuadra: la diferencia se declara y su resolucion es de la cola del humano'
            : null
        }
      }
    };
  }

  // El cruce (E1) declarado o pedido POR EVENTO.
  async _cruce(pid, input, periodo) {
    if (input.cruce && typeof input.cruce === 'object') return { cruce: input.cruce, fuente_cruce: 'declarado' };
    const r = await this._rpc('conciliacion-bancaria.cruzar.request',
      { project_id: pid, periodo, movimientos: input.movimientos }, { timeout_ms: 4000 });
    const cruce = r && r.data ? r.data : null;
    if (cruce && typeof cruce === 'object') return { cruce, fuente_cruce: 'conciliacion-bancaria' };
    return { cruce: null, fuente_cruce: null };
  }

  // Las partidas en transito (E9) declaradas o pedidas POR EVENTO. null = fuente no disponible.
  async _partidas(pid, input, cruce, periodo) {
    if (Array.isArray(input.partidas)) return { partidas: input.partidas, fuente_partidas: 'declaradas' };
    const r = await this._rpc('partida-conciliatoria.desfase.request',
      { project_id: pid, periodo, cruce }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && Array.isArray(data.partidas)) return { partidas: data.partidas, fuente_partidas: 'partida-conciliatoria' };
    return { partidas: null, fuente_partidas: null };
  }

  // El saldo contable (saldo-tesoreria) POR EVENTO. Si no llega, no se estima.
  async _saldo(pid, input, periodo) {
    if (input.saldo_contable != null) {
      return { saldo_contable: this._num(input.saldo_contable), saldo_disponible: true, fuente_saldo: 'declarado' };
    }
    const r = await this._rpc('saldo-tesoreria.calcular.request',
      { project_id: pid, periodo, cuenta: input.cuenta }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    const saldo = data && data.saldo != null ? this._num(data.saldo) : null;
    if (saldo !== null) return { saldo_contable: saldo, saldo_disponible: true, fuente_saldo: 'saldo-tesoreria' };
    return { saldo_contable: null, saldo_disponible: false, fuente_saldo: null };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolComponer(params) { return this._componer(params); }
}

module.exports = InformeConciliacion;
