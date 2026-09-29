/**
 * contabilidad-entrada/emision-factura-venta — CUSTODIO CON PERSISTENCIA (O1, hoja del plan).
 *
 * LA CARA EMITIDA de la factura de venta, con SERIE y NUMERACION. DECISION DEL DUEÑO: **contabilidad
 * SI emite la factura de venta** — es SU documento (≠ D8 registro interno ≠ D9 formato estructurado).
 * La emite y la REGISTRA; **NO la cobra**: el cobro es de la operacion (el flujo economico de la
 * vertical), no del libro. Por eso este modulo no toca caja ni banco.
 *
 * Gobierna la SECUENCIA de numeracion: **numero duplicado = corrupcion** → UN SOLO ESCRITOR. El
 * emisor (rol EMISOR_FACTURA_VENTA) es el unico que emite; cualquier otro rol es rechazado (403).
 * Un numero ya emitido en la misma serie NO se reutiliza: se rechaza (409 NUMERO_DUPLICADO) — jamas
 * se reescribe una factura emitida (append-only).
 *
 * LA LEY ENTRA COMO DATO (invariante 5): NO se cablea el desglose de impuestos (ni tipos, ni
 * porcentajes, ni regimenes), ni el formato de serie, ni plazos. El DESGLOSE DE IMPUESTOS SE
 * COMPONE: `impuestos` llega DECLARADO en la peticion (o se pide POR EVENTO a liquidacion-iva D1),
 * y la base/total se COMPONEN de lo declarado — nunca de una tabla legal. Si no hay base ni
 * impuestos declarados, se declara (`emitida:false`) en vez de inventar importes.
 *
 * El hecho minimo del tercero (receptor) se puede pedir a maestro-terceros (N1) POR EVENTO; nunca
 * por `require`. El formato estructurado se delega a factura-electronica (D9) POR EVENTO.
 *
 * Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja O1 del plan-construccion y diseno-oop.md (CLASE EmisionFacturaVenta).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor: el emisor de la factura de venta.
const ROL_ESCRITOR = 'EMISOR_FACTURA_VENTA';

class EmisionFacturaVenta extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'emision-factura-venta';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, series: Map<serie, {ultimo, facturas:[]}>, facturas: [] }
    this._emisiones = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'emision-factura-venta.json',
      dir: '/contabilidad/emision-factura-venta',
      snapshot: (pid) => {
        const e = this._emisiones.get(pid);
        if (!e) return null;
        return {
          project_id: pid,
          esquema: e.esquema,
          series: [...e.series.entries()].map(([serie, s]) => ({ serie, ...s })),
          facturas: e.facturas
        };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const series = new Map();
        for (const s of (data.series || [])) {
          if (!s || s.serie == null) continue;
          const { serie, ...resto } = s;
          series.set(String(serie), resto);
        }
        this._emisiones.set(pid, {
          esquema: data.esquema || 'contabilidad-emision-factura-venta-v1',
          series,
          facturas: Array.isArray(data.facturas) ? data.facturas : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las emisiones del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onEmitirRequest(e) {
    return this._atender(e, 'emitir', 'emision-factura-venta.emitir.response', async (d) => {
      const res = await this._emitir(d);
      if (res.status === 200 && res.data.emitida) {
        // Exito → evento de dominio: la factura quedo emitida. Lo consume registro-verifactu (D8).
        this.eventBus?.publish('contabilidad.factura_emitida', {
          project_id: res.data.project_id,
          factura: res.data.factura,
          serie: res.data.factura.serie,
          numero: res.data.factura.numero,
          clave: res.data.factura.clave,
          // Contabilidad la emite y la registra; NO la cobra (el cobro es de la operacion).
          cobrada: false,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        this.eventBus?.publish('emision-factura-venta.emitir.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor): emite la cara de la factura de venta ──
  async _emitir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el emisor emite la factura de venta.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el emisor de factura (EMISOR_FACTURA_VENTA) emite la factura de venta',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const serie = input.serie != null ? String(input.serie).trim() : '';
    if (!serie) return this._invalid('serie');

    // El receptor: declarado o pedido a maestro-terceros (N1) POR EVENTO. Nunca por require.
    const receptor = await this._receptor(pid, input);

    // El DESGLOSE de impuestos es DECLARADO (o pedido a liquidacion-iva D1). NO se cablea ningun tipo.
    const impuestos = await this._impuestos(pid, input);

    // La base y el total se COMPONEN de lo declarado; sin base no se inventa (invariante 7).
    const base = this._num(input.base);
    if (base === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          serie,
          emitida: false,
          factura: null,
          motivo: 'sin base declarada no se emite la factura (no se inventan importes)',
          cobrada: false
        }
      };
    }

    const total = this._componerTotal(base, impuestos, input);

    const e = this._obtenerOCrear(pid);
    const s = e.series.get(serie) || { ultimo: null, facturas: [] };

    // El numero lo declara el emisor o lo gobierna la SECUENCIA de la serie (ultimo + paso declarado).
    const numero = this._numero(input, s);
    if (numero === null) return this._invalid('numero');

    // NUMERO DUPLICADO = CORRUPCION: no se reutiliza jamas un numero ya emitido en la serie.
    if (s.facturas.includes(numero)) {
      return this._errorResponse(409, 'NUMERO_DUPLICADO',
        'el numero ya fue emitido en esta serie: numero duplicado = corrupcion',
        { serie, numero, ultimo: s.ultimo });
    }

    const clave = `${serie}/${numero}`;
    for (const f of e.facturas) {
      if (f.clave === clave) {
        return this._errorResponse(409, 'NUMERO_DUPLICADO',
          'la clave serie/numero ya existe: numero duplicado = corrupcion', { serie, numero, clave });
      }
    }

    const ahora = new Date().toISOString();
    const factura = {
      clave,
      serie,
      numero,
      fecha: input.fecha != null ? String(input.fecha) : ahora,
      emisor: input.emisor ?? null,
      receptor,
      base,
      impuestos,
      total,
      moneda: input.moneda != null ? String(input.moneda) : null,
      // Desglose COMPUESTO, no cableado; la ley entro como dato.
      desglose: this._desglose(base, impuestos),
      emitida_por: ROL_ESCRITOR,
      emitida_en: ahora
    };

    // Append-only: la factura emitida se apila; NUNCA se reescribe.
    e.facturas.push(factura);
    s.facturas.push(numero);
    s.ultimo = numero;
    e.series.set(serie, s);
    e.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        emitida: true,
        factura,
        secuencia: { serie, ultimo: s.ultimo },
        // Contabilidad emite y registra SU documento; NO lo cobra.
        cobrada: false,
        cobro_de: 'la operacion'
      }
    };
  }

  // El receptor: declarado en la peticion o pedido a maestro-terceros (N1) POR EVENTO.
  async _receptor(pid, input = {}) {
    if (input.receptor && typeof input.receptor === 'object') return input.receptor;
    const nif = input.receptor_nif != null ? String(input.receptor_nif) : null;
    if (!nif) return null;
    const r = await this._rpc('maestro-terceros.ficha.request',
      { project_id: pid, tercero: { nif } }, { timeout_ms: 4000 });
    const d = r && r.status === 200 ? r.data : null;
    return (d && d.ficha) ? d.ficha : { nif };
  }

  // El desglose de impuestos es DATO declarado (o pedido a liquidacion-iva D1 POR EVENTO).
  async _impuestos(pid, input = {}) {
    if (Array.isArray(input.impuestos)) return input.impuestos;
    const r = await this._rpc('liquidacion-iva.calcular.request', {
      project_id: pid,
      base: this._num(input.base),
      impuestos: input.impuestos ?? null
    }, { timeout_ms: 4000 });
    const d = r && r.status === 200 ? r.data : null;
    if (d && Array.isArray(d.impuestos)) return d.impuestos;
    return [];
  }

  // Compone el total desde la base y los impuestos DECLARADOS (cuota declarada por linea).
  _componerTotal(base, impuestos, input = {}) {
    if (this._num(input.total) !== null) return this._num(input.total);
    const cuotas = (Array.isArray(impuestos) ? impuestos : [])
      .map(i => this._num(i && (i.cuota != null ? i.cuota : i.importe)))
      .filter(v => v !== null);
    const suma = cuotas.reduce((a, b) => a + b, 0);
    return this._round(base + suma, 2);
  }

  // Desglose linea a linea: base + cuota declarada → total por linea. Compuesto, no cableado.
  _desglose(base, impuestos) {
    const lista = Array.isArray(impuestos) ? impuestos : [];
    const lineas = lista.map(i => {
      const cuota = this._num(i && (i.cuota != null ? i.cuota : i.importe));
      return { tipo: i && i.tipo != null ? String(i.tipo) : null, tipo_valor: i && i.tipo_valor != null ? i.tipo_valor : null, cuota };
    });
    const total_impuestos = lineas.map(l => l.cuota).filter(v => v !== null).reduce((a, b) => a + b, 0);
    return { base, lineas, total_impuestos: this._round(total_impuestos, 2), total: this._round(base + total_impuestos, 2) };
  }

  // El numero: declarado, o gobernado por la SECUENCIA de la serie con el paso declarado.
  _numero(input, s) {
    if (input.numero !== undefined && input.numero !== null && String(input.numero).trim() !== '') {
      return String(input.numero).trim();
    }
    const ultimo = s && s.ultimo != null ? String(s.ultimo) : null;
    const paso = this._num(input.paso != null ? input.paso : 1);
    const siguiente = (ultimo !== null && /^\d+$/.test(ultimo))
      ? String(Number(ultimo) + (paso !== null ? paso : 1)).padStart(ultimo.length, '0')
      : (ultimo === null ? '1' : null);
    return siguiente;
  }

  _num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _obtenerOCrear(pid) {
    let e = this._emisiones.get(pid);
    if (!e) {
      e = { esquema: 'contabilidad-emision-factura-venta-v1', series: new Map(), facturas: [] };
      this._emisiones.set(pid, e);
      this._persist.marcarDirty(pid);
    }
    return e;
  }

  // Lectura directa para otras hojas (no muta): la factura emitida por clave serie/numero.
  factura(pid, clave) {
    const e = pid ? this._emisiones.get(pid) : null;
    if (!e) return null;
    return e.facturas.find(f => f.clave === String(clave)) || null;
  }

  // ── Tools ──
  toolEmitir(params) { return this._emitir(params); }
}

module.exports = EmisionFacturaVenta;
