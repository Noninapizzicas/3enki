/**
 * contabilidad-entrada/estado-cuenta-proveedor — REFLEJO STATELESS (N4, hoja del plan).
 *
 * **EL EXTRACTO CONFRONTABLE CON EL PROVEEDOR. Compone desde la cuenta corriente (N3).**
 *
 * Estado formal de la cuenta a una fecha: los movimientos y el saldo con su procedencia, listos
 * para que el proveedor los CONFRONTE con su propia contabilidad. Es la pieza de la conciliacion
 * de saldos con el tercero.
 *
 * 🔴 **COMPONE, NO RECALCULA LA CUENTA.** El mayor auxiliar lo DERIVA `cuenta-proveedor` (N3);
 * aqui se PIDE por EVENTO (`cuenta-proveedor.facturas_vivas.request` y `cuenta-proveedor.saldo.request`)
 * y se COMPONE el extracto. Si N3 no responde y no se declaran las partidas, el extracto se
 * declara NO DISPONIBLE (`disponible:false`): jamas se inventa la cuenta.
 *
 * 🔴 **LA CONFRONTACION SE DECLARA, NO SE AJUSTA.** Si el proveedor declara su saldo
 * (`saldo_proveedor`), la DIFERENCIA con el saldo derivado se calcula y se DECLARA (`diferencia`,
 * `diferencias[]`) — con las partidas que las explican, si se declaran. El extracto NO corrige
 * nada, NO cuadra por su cuenta y NO decide quien tiene razon: la conciliacion es un acto
 * humano/proveedor y las diferencias quedan declaradas para que se resuelvan fuera.
 *
 * ATRIBUTOS del diseno: `auxiliar:CuentaProveedor`.
 * METODOS: `extracto(t:Tercero, hasta):Informe`.
 *
 * Invariantes:
 *  - DETERMINISTA: mismas partidas + misma fecha de corte → mismo extracto.
 *  - Dato ausente = desconocido: sin corte declarado se declara `hasta:null` (todo lo conocido);
 *    sin partidas no se compone nada; una partida sin importe se declara aparte (abierto).
 *  - NO escribe, NO persiste, NO muta y NO decide: el extracto es un DERIVADO; confrontarlo es del
 *    proveedor/asesor (`[ABIERTO]` quien confronta).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja N4 del plan-construccion y diseno-oop.md (CLASE EstadoCuentaProveedor).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class EstadoCuentaProveedor extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estado-cuenta-proveedor';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onExtractoRequest(e) {
    return this._atender(e, 'extracto', 'estado-cuenta-proveedor.extracto.response', async (d) => {
      const res = await this._extracto(d);
      if (res.status !== 200) this.eventBus?.publish('estado-cuenta-proveedor.extracto.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // extracto(t:Tercero, hasta) → Informe (extracto confrontable)
  // ══════════════════════════════════════════════════════════════════════
  async _extracto(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La FECHA DE CORTE es DECLARABLE. Sin corte → hasta:null (todo lo conocido, declarado).
    const hasta = this._fecha(input.hasta) || (input.hasta != null ? null : null);
    const hasta_declarada = input.hasta !== undefined && input.hasta !== null && String(input.hasta).trim() !== '';

    // Las PARTIDAS: declaradas, o compuestas por cuenta-proveedor (N3) POR EVENTO.
    const fuente = await this._partidas(pid, input);
    if (!fuente.disponible) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'estado-cuenta-proveedor',
          tercero: input.tercero || null,
          hasta,
          disponible: false,
          partidas: [],
          movimientos: [],
          saldo_derivado: null,
          saldo_proveedor: null,
          diferencia: null,
          confrontable: false,
          abierto: {
            partidas: 'no se declararon las partidas y cuenta-proveedor (N3) no respondio: el extracto NO se inventa',
            hasta: hasta_declarada && hasta === null ? 'la fecha de corte declarada no es una fecha valida' : null
          }
        }
      };
    }

    // 1 · Las PARTIDAS: ordenadas de forma DETERMINISTA (por fecha y, a igualdad, por orden de llegada).
    const conFecha = [];
    const sinFecha = [];
    let orden = 0;
    for (const p of fuente.partidas) {
      orden += 1;
      const fecha = this._fecha(p && (p.fecha != null ? p.fecha : p.fecha_contable));
      const importe = this._num(p && (p.importe != null ? p.importe : (p.pendiente != null ? p.pendiente : (p.total != null ? p.total : null))));
      if (importe === null) {
        // Una partida sin importe NO se lee como 0: se declara aparte (nada se estima).
        sinFecha.push({ ...p, motivo: 'la partida no declara importe: no se lee como 0 (nada se estima)' });
        continue;
      }
      const item = { ...p, fecha, importe: this._round(Math.abs(importe), 2), _orden: orden };
      if (!fecha) { sinFecha.push({ ...item, motivo: 'la partida no declara fecha: no se ordena contra el corte' }); continue; }
      // El CORTE: si se declaro `hasta`, solo lo que cae dentro.
      if (hasta !== null && fecha > hasta) continue;
      conFecha.push(item);
    }
    conFecha.sort((a, b) => (a.fecha < b.fecha ? -1 : (a.fecha > b.fecha ? 1 : a._orden - b._orden)));

    // 2 · El SALDO DERIVADO a la fecha de corte: del auxiliar (N3) si lo dio, o la suma de partidas.
    const saldo_derivado = fuente.saldo !== null && fuente.saldo !== undefined
      ? this._round(Number(fuente.saldo), 2)
      : this._round(conFecha.reduce((s, p) => s + this._firma(p) * p.importe, 0), 2);

    // 3 · 🔴 LA CONFRONTACION: el saldo que DECLARA el proveedor. Si lo declara, la diferencia se
    //     DECLARA — no se ajusta. Sin saldo del proveedor declarado, no hay confrontacion (null).
    const saldo_proveedor = this._num(
      input.saldo_proveedor !== undefined ? input.saldo_proveedor
        : (input.confrontacion && input.confrontacion.saldo_proveedor !== undefined ? input.confrontacion.saldo_proveedor : null)
    );
    // La DIFERENCIA declarada: derivado − proveedor. Positiva = el proveedor reclama menos de lo
    // que nosotros debemos... se DECLARA tal cual con su procedencia; no se interpreta ni se ajusta.
    const diferencia = saldo_proveedor === null ? null : this._round(saldo_derivado - saldo_proveedor, 2);

    // Las PARTIDAS DE DIFERENCIA (las que explican el descuadre): DECLARADAS. No se deducen solas.
    const partidas_diferencia = Array.isArray(input.partidas_diferencia)
      ? input.partidas_diferencia
      : (input.confrontacion && Array.isArray(input.confrontacion.partidas_diferencia) ? input.confrontacion.partidas_diferencia : null);

    const movimientos = conFecha.map((p) => ({
      fecha: p.fecha,
      clave: p.clave !== undefined ? p.clave : (p.clave_natural !== undefined ? p.clave_natural : null),
      numero: p.numero !== undefined ? p.numero : null,
      concepto: p.concepto !== undefined ? p.concepto : null,
      importe: p.importe,
      signo: this._firma(p),
      asiento: p.asiento !== undefined ? p.asiento : null
    }));

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'estado-cuenta-proveedor',
        tercero: fuente.tercero || input.tercero || null,
        // La fecha de corte del extracto, tal como se declaro (o null = todo lo conocido).
        hasta,
        hasta_declarada,
        disponible: true,
        // El extracto se compone desde el auxiliar: se declara la procedencia (no caja negra).
        fuente_partidas: fuente.fuente,
        movimientos,
        num_movimientos: movimientos.length,
        // Lo que no se pudo leer/ordenar NO se rellena: se declara aparte.
        sin_fecha_o_sin_importe: sinFecha,
        saldo_derivado,
        deriva_de: fuente.fuente === 'declaradas' ? ['partidas declaradas'] : ['cuenta-proveedor (N3)'],
        // 🔴 EL CONFRONTABLE: el extracto esta listo para que el proveedor lo compare.
        confrontable: true,
        confrontacion: {
          // Sin saldo del proveedor declarado NO hay confrontacion: no se simula ([ABIERTO] quien confronta).
          saldo_derivado,
          saldo_proveedor,
          diferencia,
          cuadra: saldo_proveedor === null ? null : diferencia === 0,
          partidas_diferencia: partidas_diferencia,
          // 🔴 Las diferencias SE DECLARAN; el extracto NO las corrige ni cuadra por su cuenta.
          se_ajusta_automaticamente: false,
          resuelve: 'proveedor/asesor ([ABIERTO] quien confronta): las diferencias se declaran, no se ajustan solas'
        },
        abierto: {
          confrontacion: saldo_proveedor === null
            ? 'el proveedor no declaro su saldo: el extracto es confrontable pero no se ha confrontado ([ABIERTO] quien confronta)'
            : null,
          partidas_diferencia: (diferencia !== null && diferencia !== 0 && !partidas_diferencia)
            ? 'hay diferencia con el saldo del proveedor y no se declararon las partidas que la explican: no se deducen solas'
            : null,
          hasta: hasta_declarada && hasta === null ? 'la fecha de corte declarada no es una fecha valida: se compone sin corte' : null
        }
      }
    };
  }

  // Las PARTIDAS: declaradas en la peticion, o compuestas pidiendo el auxiliar (N3) POR EVENTO.
  async _partidas(pid, input) {
    const declaradas = input.partidas != null ? input.partidas : input.movimientos;
    if (Array.isArray(declaradas)) {
      return { partidas: declaradas, tercero: input.tercero || null, saldo: input.saldo_derivado ?? null, fuente: 'declaradas', disponible: true };
    }

    // 1) Las facturas/partidas vivas del auxiliar (N3).
    const r = await this._rpc('cuenta-proveedor.facturas_vivas.request', {
      project_id: pid,
      tercero: input.tercero ?? null,
      tercero_id: input.tercero_id ?? null,
      nif: input.nif ?? null,
      cuenta: input.cuenta ?? null,
      convenio: input.convenio ?? null,
      asientos: input.asientos ?? null,
      periodo: input.periodo ?? null
    }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (!data || !Array.isArray(data.facturas)) return { partidas: [], tercero: null, saldo: null, fuente: null, disponible: false };

    // 2) El saldo del auxiliar (N3), para el corte. Best-effort: si no llega, se suma de las partidas.
    const rs = await this._rpc('cuenta-proveedor.saldo.request', {
      project_id: pid,
      tercero: input.tercero ?? null,
      tercero_id: input.tercero_id ?? null,
      nif: input.nif ?? null,
      cuenta: input.cuenta ?? null,
      convenio: input.convenio ?? null,
      asientos: input.asientos ?? null,
      periodo: input.periodo ?? null
    }, { timeout_ms: 4000 });
    const sd = rs && rs.data ? rs.data : null;

    return {
      partidas: data.facturas,
      tercero: data.tercero || null,
      saldo: sd && typeof sd.saldo === 'number' ? sd.saldo : null,
      fuente: 'cuenta-proveedor',
      disponible: true
    };
  }

  // El SIGNO de una partida segun su tipo DECLARADO (no se cablea el convenio del negocio).
  _firma(p) {
    const t = p && p.tipo != null ? String(p.tipo).toLowerCase().trim() : '';
    if (t === 'abono' || t === 'pago' || t === 'anticipo' || t === 'descuento' || t === 'rappel') return -1;
    return 1;
  }

  _fecha(v) {
    if (v === undefined || v === null || v === '') return null;
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolExtracto(params) { return this._extracto(params); }
}

module.exports = EstadoCuentaProveedor;
