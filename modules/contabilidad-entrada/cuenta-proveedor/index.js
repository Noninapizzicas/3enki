/**
 * contabilidad-entrada/cuenta-proveedor — REFLEJO STATELESS (N3, hoja del plan).
 *
 * **LA CUENTA CORRIENTE DEL PROVEEDOR: LO QUE LE DEBEMOS. DERIVADA DEL LIBRO.**
 *
 * Mayor auxiliar del tercero: cada factura de compra VIVA y su saldo. NO almacena nada: el libro
 * es `escritor-diario` (B2) y la ficha del tercero es `maestro-terceros` (N1) — aqui solo se
 * DERIVA la cuenta corriente por EVENTO.
 *
 * 🔴 **EL MAESTRO DE TERCEROS ES UNICO (N1, ya construido).** Cliente y proveedor cuelgan del
 * MISMO tercero. Este reflejo NO crea un maestro nuevo ni una ficha paralela: pide la ficha a
 * `maestro-terceros.ficha.request` POR EVENTO y trabaja sobre ES tercero (con `roles`). Si el
 * maestro no responde, la cuenta se declara `tercero_disponible:false` — jamas se inventa la ficha.
 *
 * 🔴 **LA CUENTA CONTABLE ES DECLARABLE, NO CABLEADA.** Ninguna subcuenta (400.x, 410...) esta
 * escrita aqui: la trae el input (`cuenta`) o la ficha del tercero (`cuenta_proveedor`). Sin
 * cuenta declarada, el emparejamiento usa la CLAVE del tercero declarada en los apuntes
 * (`tercero`/`clave`/`nif`) — y se declara con que criterio se emparejo.
 *
 * ATRIBUTOS del diseno: `diario:EscritorDiario`, `tercero:Tercero`.
 * METODOS: `saldo(t:Tercero):Cuantía`, `facturas_vivas(t):Set<Factura>`.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos asientos + mismo tercero + mismo convenio → mismo saldo (una sola respuesta).
 *  - Dato ausente = desconocido: sin asientos `disponible:false` (no se estima un saldo en 0); una
 *    factura sin importe declarado no se da por viva ni por pagada, se declara ABIERTA.
 *  - NO escribe, NO persiste, NO muta y NO decide: la cuenta corriente es un DERIVADO del libro.
 *  - El convenio de signo es DECLARADO y visible (`acreedor` por defecto: saldo = Σhaber − Σdebe).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja N3 del plan-construccion y diseno-oop.md (CLASE CuentaProveedor).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CuentaProveedor extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuenta-proveedor';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onSaldoRequest(e) {
    return this._atender(e, 'saldo', 'cuenta-proveedor.saldo.response', async (d) => {
      const res = await this._saldo(d);
      if (res.status !== 200) this.eventBus?.publish('cuenta-proveedor.saldo.failed', res);
      return res;
    });
  }

  onFacturasVivasRequest(e) {
    return this._atender(e, 'facturas_vivas', 'cuenta-proveedor.facturas_vivas.response', async (d) => {
      const res = await this._facturas_vivas(d);
      if (res.status !== 200) this.eventBus?.publish('cuenta-proveedor.facturas_vivas.failed', res);
      return res;
    });
  }

  // ── SEÑAL (fire-and-forget, TOLERANTE): el libro avisa de un asiento nuevo. N3 es BAJO DEMANDA
  // y stateless: no acumula — solo deja constancia de que la cuenta corriente quedo desactualizada.
  onAsientoRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    this.logger?.info('cuenta-proveedor.asiento_registrado', {
      module: this.name,
      project_id: d.project_id,
      numero: d.numero !== undefined ? d.numero : (d.asiento && d.asiento.numero !== undefined ? d.asiento.numero : null),
      correlation_id: d.correlation_id
    });
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // saldo(t:Tercero) → Cuantía (lo que le debemos)
  // ══════════════════════════════════════════════════════════════════════
  async _saldo(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ctx = await this._contexto(pid, input);
    if (!ctx.tercero_disponible) {
      return {
        status: 200,
        data: {
          project_id: pid, tipo: 'cuenta-proveedor',
          tercero: null, tercero_disponible: false,
          saldo: null, sum_debe: null, sum_haber: null, num_apuntes: 0,
          disponible: false,
          convenio: ctx.convenio,
          abierto: {
            tercero: 'el maestro-terceros (N1) no respondio y no se declaro la ficha: no se inventa el tercero',
            asientos: ctx.asientos_disponible ? null : 'no hay asientos declarados y escritor-diario (B2) no respondio'
          }
        }
      };
    }

    if (!ctx.asientos_disponible) {
      return {
        status: 200,
        data: {
          project_id: pid, tipo: 'cuenta-proveedor',
          tercero: ctx.tercero, tercero_disponible: true,
          saldo: null, sum_debe: null, sum_haber: null, num_apuntes: 0,
          disponible: false,
          convenio: ctx.convenio,
          criterio_emparejamiento: ctx.criterio,
          abierto: {
            tercero: null,
            // 🔴 Un saldo en 0 sin asientos seria una invencion: se declara NO DISPONIBLE.
            asientos: 'no hay asientos declarados y escritor-diario (B2) no respondio: el saldo NO se estima (no se devuelve 0)'
          }
        }
      };
    }

    const { sum_debe, sum_haber, num_apuntes, apuntes } = this._agregar(ctx);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'cuenta-proveedor',
        tercero: ctx.tercero,
        tercero_disponible: true,
        // El SALDO con el convenio declarado y visible (acreedor por defecto: Σhaber − Σdebe).
        saldo: this._round(this._aplicarConvenio(sum_debe, sum_haber, ctx.convenio), 2),
        convenio: ctx.convenio,
        sum_debe: this._round(sum_debe, 2),
        sum_haber: this._round(sum_haber, 2),
        num_apuntes,
        apuntes,
        disponible: true,
        // Con que criterio se emparejo el tercero: la cuenta es DECLARABLE, no cableada.
        criterio_emparejamiento: ctx.criterio,
        fuente_asientos: ctx.fuente_asientos,
        fuente_tercero: ctx.fuente_tercero,
        // Lo que el maestro unico declara de este tercero (roles: un tercero puede ser cliente Y proveedor).
        roles: ctx.tercero ? ctx.tercero.roles : null,
        deriva_de: ['escritor-diario (B2)', 'maestro-terceros (N1)'],
        abierto: { tercero: null, asientos: null }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // facturas_vivas(t) → Set<Factura> (cada factura de compra viva y su pendiente)
  // ══════════════════════════════════════════════════════════════════════
  async _facturas_vivas(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ctx = await this._contexto(pid, input);
    if (!ctx.asientos_disponible) {
      return {
        status: 200,
        data: {
          project_id: pid, tipo: 'cuenta-proveedor',
          tercero: ctx.tercero, tercero_disponible: ctx.tercero_disponible,
          facturas_vivas: [], num_facturas_vivas: 0, disponible: false,
          criterio_emparejamiento: ctx.criterio,
          abierto: {
            asientos: 'no hay asientos declarados y escritor-diario (B2) no respondio: no se inventa ninguna factura',
            tercero: ctx.tercero_disponible ? null : 'el maestro-terceros (N1) no respondio y no se declaro la ficha'
          }
        }
      };
    }

    const facturas = [];
    const abiertos = [];
    let indice = 0;
    for (const a of ctx.asientos) {
      indice += 1;
      if (!this._esFacturaDeCompra(a)) continue;
      if (!this._delTercero(a, ctx)) continue;

      const clave = this._claveFactura(a, indice);
      const importe = this._importe(a);
      // Sin importe declarado la factura NO se da por viva ni por pagada: se declara ABIERTA.
      if (importe === null) {
        abiertos.push({ clave, motivo: 'la factura no declara importe: no se puede decir si esta viva (no se estima)' });
        continue;
      }
      const aplicado = this._aplicado(ctx.asientos, clave);
      const pendiente = this._round(Math.abs(importe) - aplicado, 2);
      facturas.push({
        clave,
        numero: a.factura != null ? String(a.factura) : (a.numero !== undefined ? a.numero : null),
        clave_natural: a.clave_natural !== undefined ? a.clave_natural : null,
        fecha: a.fecha !== undefined ? a.fecha : null,
        importe: this._round(Math.abs(importe), 2),
        aplicado,
        pendiente,
        // VIVA = queda pendiente distinto de cero. Determinista; sin criterio cableado.
        viva: pendiente !== 0,
        // Vencimiento DECLARADO en el propio asiento (N6 lo calcula aparte): aqui no se recalcula.
        fecha_vencimiento: a.fecha_vencimiento !== undefined ? a.fecha_vencimiento : null,
        asiento: a
      });
    }

    const vivas = facturas.filter((f) => f.viva === true);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'cuenta-proveedor',
        tercero: ctx.tercero,
        tercero_disponible: ctx.tercero_disponible,
        // El conjunto que pidio el diseno: las facturas VIVAS (pendiente != 0).
        facturas_vivas: vivas,
        facturas: facturas,
        num_facturas_vivas: vivas.length,
        num_facturas: facturas.length,
        total_pendiente: this._round(vivas.reduce((s, f) => s + f.pendiente, 0), 2),
        disponible: true,
        criterio_emparejamiento: ctx.criterio,
        fuente_asientos: ctx.fuente_asientos,
        fuente_tercero: ctx.fuente_tercero,
        deriva_de: ['escritor-diario (B2)', 'maestro-terceros (N1)'],
        abierto: {
          // Lo que no se pudo determinar NO se rellena: se declara aparte.
          facturas_sin_importe: abiertos.length > 0 ? abiertos : null,
          tercero: ctx.tercero_disponible ? null : 'el maestro-terceros (N1) no respondio y no se declaro la ficha',
          asientos: null
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // El CONTEXTO: el tercero (N1, maestro unico) + los asientos (B2) + el convenio declarado.
  // ══════════════════════════════════════════════════════════════════════
  async _contexto(pid, input) {
    const convenio = input.convenio != null ? String(input.convenio).toLowerCase().trim() : 'acreedor';

    // 1 · El TERCERO: declarado en la peticion, o pedido al MAESTRO UNICO (N1) POR EVENTO.
    let tercero = input.tercero && typeof input.tercero === 'object' ? input.tercero : null;
    let fuente_tercero = tercero ? 'declarado' : null;
    if (!tercero && (input.nif != null || input.numero_fiscal != null || input.tercero_id != null)) {
      const r = await this._rpc('maestro-terceros.ficha.request', {
        project_id: pid,
        tercero: {
          nif: input.nif != null ? input.nif : (input.numero_fiscal != null ? input.numero_fiscal : input.tercero_id)
        }
      }, { timeout_ms: 4000 });
      const data = r && r.data ? r.data : null;
      if (data && data.encontrado === true && data.tercero) {
        tercero = data.tercero;
        fuente_tercero = 'maestro-terceros';
      }
    }

    // La CUENTA contable del proveedor: DECLARABLE (input o ficha). NUNCA cableada.
    const cuenta = input.cuenta != null ? String(input.cuenta)
      : (tercero && tercero.cuenta_proveedor != null ? String(tercero.cuenta_proveedor)
        : (tercero && tercero.cuenta != null ? String(tercero.cuenta) : null));

    // La CLAVE del tercero (para emparejar apuntes que no traen cuenta): DECLARADA.
    const clave_tercero = input.tercero_id != null ? String(input.tercero_id)
      : (tercero ? String(tercero.nif != null ? tercero.nif : (tercero.clave != null ? tercero.clave : '')) || null : null);

    // 2 · Los ASIENTOS: declarados, o pedidos al diario (B2) POR EVENTO.
    const candidatos = input.asientos != null ? input.asientos : input.libro;
    let asientos = null;
    let fuente_asientos = null;
    if (Array.isArray(candidatos)) { asientos = candidatos; fuente_asientos = 'declarados'; }
    else if (candidatos && typeof candidatos === 'object' && Array.isArray(candidatos.asientos)) {
      asientos = candidatos.asientos; fuente_asientos = 'declarados';
    } else {
      const r = await this._rpc('escritor-diario.asientos.request',
        { project_id: pid, periodo: input.periodo ?? null }, { timeout_ms: 4000 });
      const data = r && r.data ? r.data : null;
      if (data && Array.isArray(data.asientos)) { asientos = data.asientos; fuente_asientos = 'escritor-diario'; }
    }

    return {
      tercero,
      tercero_disponible: Boolean(tercero),
      fuente_tercero,
      cuenta,
      clave_tercero,
      criterio: cuenta ? `cuenta declarada (${cuenta})` : (clave_tercero ? `clave del tercero declarada en los apuntes (${clave_tercero})` : 'sin cuenta ni clave declarada: no se puede emparejar'),
      convenio,
      asientos,
      asientos_disponible: Array.isArray(asientos),
      fuente_asientos
    };
  }

  // Agrega los apuntes del tercero: Σdebe, Σhaber y el detalle.
  _agregar(ctx) {
    let sum_debe = 0;
    let sum_haber = 0;
    const apuntes = [];
    for (const a of ctx.asientos) {
      for (const ap of this._apuntesDe(a)) {
        if (!this._apunteDelTercero(ap, ctx)) continue;
        const debe = this._num(ap.debe) || 0;
        const haber = this._num(ap.haber) || 0;
        sum_debe += debe;
        sum_haber += haber;
        apuntes.push({
          numero: a && a.numero !== undefined ? a.numero : null,
          fecha: a && a.fecha !== undefined ? a.fecha : null,
          concepto: a && a.concepto !== undefined ? a.concepto : null,
          cuenta: ap.cuenta !== undefined ? ap.cuenta : null,
          debe, haber
        });
      }
    }
    return { sum_debe, sum_haber, num_apuntes: apuntes.length, apuntes };
  }

  // El convenio de signo: DECLARADO y visible. Por defecto acreedor (lo que le debemos).
  _aplicarConvenio(sum_debe, sum_haber, convenio) {
    if (convenio === 'deudor') return sum_debe - sum_haber;
    return sum_haber - sum_debe;   // 'acreedor' (defecto declarado)
  }

  _apuntesDe(a) {
    if (!a || typeof a !== 'object') return [];
    if (Array.isArray(a.apuntes)) return a.apuntes;
    // Un asiento sin apuntes declarados no aporta a la cuenta: nada se asume.
    return [];
  }

  // ¿El apunte es del tercero? Por la CUENTA declarada o por la CLAVE del tercero declarada.
  _apunteDelTercero(ap, ctx) {
    if (!ap || typeof ap !== 'object') return false;
    if (ctx.cuenta && ap.cuenta != null && String(ap.cuenta) === ctx.cuenta) return true;
    if (ctx.clave_tercero) {
      const k = ap.tercero != null ? ap.tercero : (ap.clave != null ? ap.clave : ap.nif);
      if (k != null && String(k) === ctx.clave_tercero) return true;
    }
    return false;
  }

  _delTercero(a, ctx) {
    if (ctx.cuenta && a.cuenta != null && String(a.cuenta) === ctx.cuenta) return true;
    if (ctx.clave_tercero) {
      const k = a.tercero != null ? a.tercero : (a.clave != null ? a.clave : a.nif);
      if (k != null && String(k) === ctx.clave_tercero) return true;
    }
    // Sin cuenta ni clave declarada, no se puede afirmar que el asiento sea del tercero.
    return false;
  }

  // ¿El asiento es una FACTURA DE COMPRA? Solo por lo que DECLARA (tipo declarado o marca): no se cablea.
  _esFacturaDeCompra(a) {
    if (!a || typeof a !== 'object') return false;
    if (a.es_factura_compra === true || a.es_factura === true) return true;
    if (a.factura != null) return true;
    const tipo = a.tipo != null ? String(a.tipo).toLowerCase().trim() : '';
    return tipo === 'factura_compra' || tipo === 'factura-compra';
  }

  _claveFactura(a, indice) {
    if (a && a.factura != null) return String(a.factura);
    if (a && a.clave_natural != null) return String(a.clave_natural);
    return `asiento_${a && a.numero !== undefined ? a.numero : indice}`;
  }

  // Lo aplicado (pagado/aplicado) a una factura: asientos que DECLARAN aplicarla (`aplica_a`/`pago_de`).
  _aplicado(asientos, clave) {
    let total = 0;
    for (const a of asientos) {
      if (!a || typeof a !== 'object') continue;
      const ref = a.aplica_a != null ? a.aplica_a : a.pago_de;
      if (ref === null || ref === undefined) continue;
      if (String(ref) !== clave) continue;
      const importe = this._importe(a);
      if (importe !== null) total += Math.abs(importe);
    }
    return this._round(total, 2);
  }

  // El importe del asiento: el declarado (mayor apunte) — NO se recalcula el asiento.
  _importe(a) {
    if (!a || typeof a !== 'object') return null;
    const directo = this._num(a.importe != null ? a.importe : (a.total != null ? a.total : a.suma_debe));
    if (directo !== null) return directo;
    const apuntes = this._apuntesDe(a);
    let max = null;
    for (const ap of apuntes) {
      const v = this._num(ap && (ap.debe != null ? ap.debe : ap.haber));
      if (v === null) continue;
      if (max === null || Math.abs(v) > Math.abs(max)) max = v;
    }
    return max;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolSaldo(params) { return this._saldo(params); }
  toolFacturasVivas(params) { return this._facturas_vivas(params); }
}

module.exports = CuentaProveedor;
