/**
 * contabilidad-entrada/emision-factura-venta — CUSTODIO CON PERSISTENCIA (O1, hoja del plan).
 *
 * La cara EMITIDA con SERIE/NUMERACION. Decision del dueno: CONTABILIDAD SI EMITE la
 * factura de venta. Y por eso es CUSTODIO: un NUMERO DUPLICADO = CORRUPCION → UN escritor.
 * La numeracion es una SECUENCIA por serie: emitir dos veces la misma (serie, numero) NO
 * se tolera — se RECHAZA (409 NUMERO_DUPLICADO). Un libro de facturas con numeros repetidos
 * no se puede deshacer.
 *
 * Invariantes:
 *  - NUMERACION UNICA por (serie, numero): repetirla → rechazo. No se renumera en silencio.
 *  - La serie y el numero son DECLARADOS; si no viene el numero, se toma el SIGUIENTE de la
 *    serie (secuencia del custodio) — nunca un numero inventado fuera de serie.
 *  - Sin base/lineas → no se emite (dato ausente = desconocido; no se fabrica la cuantia).
 *  - APPEND-ONLY: la factura emitida se apila; NADA se borra. Una rectificacion es OTRA
 *    factura (O2), no una edicion de esta.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R2 · ESCRIBE → ANUNCIA: al emitir publica `contabilidad.factura_emitida` (lo consumen
 * registro-verifactu y factura-rectificativa). Ademas SUBE (best-effort) las peticiones de
 * cadena: verifactu, factura-electronica, asiento, ficha de tercero y archivo del documento.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + single-writer + append-only.
 * Ver hoja O1 del plan-construccion y diseno-oop.md (CLASE EmisionFacturaVenta).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class EmisionFacturaVenta extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'emision-factura-venta';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, series: Map<serie, {ultimo, facturas:Map<numero,factura>}> }
    this._emisiones = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'emision-factura-venta.json',
      dir: '/contabilidad/emision-factura-venta',
      snapshot: (pid) => {
        const e = this._emisiones.get(pid);
        if (!e) return null;
        const series = {};
        for (const [serie, s] of e.series) series[serie] = { ultimo: s.ultimo, facturas: [...s.facturas.values()] };
        return { project_id: pid, esquema: e.esquema, series };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const series = new Map();
        for (const [serie, s] of Object.entries(data.series || {})) {
          const facturas = new Map();
          for (const f of (s.facturas || [])) if (f && f.numero != null) facturas.set(String(f.numero), f);
          series.set(serie, { ultimo: Number(s.ultimo) || 0, facturas });
        }
        this._emisiones.set(pid, { esquema: data.esquema || 'contabilidad-emision-factura-venta-v1', series });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la numeracion del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC unico: emitir (ORDEN → ui_handler panel) ──
  onEmitirRequest(e) {
    return this._atender(e, 'emitir', 'emision-factura-venta.emitir.response', async (d) => {
      const res = this._emitir(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: una factura de venta quedo emitida.
        this.eventBus?.publish('contabilidad.factura_emitida', {
          project_id: res.data.project_id,
          factura: res.data.factura,
          serie: res.data.factura.serie,
          numero: res.data.factura.numero,
          total: res.data.factura.total,
          correlation_id: d.correlation_id
        });
        this._encadenar(res, d);
      } else {
        this.eventBus?.publish('emision-factura-venta.emitir.failed', res);
      }
      return res;
    });
  }

  // SUBE (best-effort) la cadena post-emision: verifactu, factura-electronica, asiento,
  // ficha de tercero, archivo del documento. NO espera respuesta (fire-and-forget).
  _encadenar(res, d) {
    const pid = res.data.project_id;
    const factura = res.data.factura;
    const pub = (ev, payload) => { try { this.eventBus?.publish(ev, { project_id: pid, factura, correlation_id: d.correlation_id, ...payload }); } catch (_) { /* best-effort */ } };
    pub('registro-verifactu.encadenar.request', { documento_id: factura.documento_id || factura.id });
    pub('factura-electronica.entrar.request', { documento_id: factura.documento_id || factura.id });
    pub('escritor-diario.asentar.request', { asiento: factura.asiento || null, origen: 'emision-factura-venta' });
    pub('maestro-terceros.ficha.request', { tercero: factura.tercero || null });
    pub('expediente-documental.archivar.request', { documento_id: factura.documento_id || factura.id });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _emitir(input) → { status, data }  ·  numeracion unica (single-writer)
  // ══════════════════════════════════════════════════════════════════════
  _emitir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const serie = input.serie != null ? String(input.serie).trim() : 'A';
    if (!serie) return this._invalid('serie');

    // Sin cuantia declarada NO se emite una factura vacia (no se fabrica el importe).
    const base = Number.isFinite(Number(input.base)) ? this._round(Number(input.base), 2) : null;
    const iva = Number.isFinite(Number(input.iva)) ? this._round(Number(input.iva), 2) : null;
    const total = Number.isFinite(Number(input.total)) ? this._round(Number(input.total), 2)
      : (base != null && iva != null ? this._round(base + iva, 2) : null);
    if (base === null && total === null && !Array.isArray(input.lineas)) {
      return this._invalid('base'); // sin base ni lineas ni total: nada que facturar
    }

    const em = this._obtenerOCrear(pid);
    const s = this._serieDe(em, serie);

    // El numero: DECLARADO o el SIGUIENTE de la serie. Jamas un numero de otra serie ni uno inventado.
    let numero;
    if (input.numero !== undefined && input.numero !== null && String(input.numero).trim() !== '') {
      numero = String(input.numero).trim();
    } else {
      numero = String(s.ultimo + 1);
    }

    // ── EL CERROJO: numero duplicado = corrupcion → RECHAZA (no renumera en silencio) ──
    if (s.facturas.has(numero)) {
      return this._errorResponse(409, 'NUMERO_DUPLICADO',
        'esa (serie, numero) ya esta emitida: un numero duplicado es corrupcion del libro; se RECHAZA',
        {
          project_id: pid,
          serie,
          numero,
          duplicado: true,
          ultimo: s.ultimo
        });
    }

    const ahora = new Date().toISOString();
    const n = Number(numero);
    if (Number.isFinite(n) && n > s.ultimo) s.ultimo = n;

    const factura = {
      id: `${pid}-${serie}-${numero}`,
      serie,
      numero,
      fecha: input.fecha != null ? String(input.fecha) : ahora.slice(0, 10),
      base,
      iva,
      total,
      tercero: input.tercero != null ? input.tercero : null,
      lineas: Array.isArray(input.lineas) ? input.lineas : [],
      documento_id: input.documento_id != null ? String(input.documento_id) : null,
      asiento: input.asiento && typeof input.asiento === 'object' ? input.asiento : null,
      emitida_en: ahora,
      emitida_por: input.por != null ? String(input.por) : null
    };
    // APPEND-ONLY: se apila; NUNCA se edita una factura emitida (la correccion es O2).
    s.facturas.set(numero, factura);
    em.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        factura,
        emitida: true,
        total_emitidas: this._contar(em),
        ultimo_de_serie: s.ultimo,
        append_only: true,
        abierto: {
          iva: iva !== null ? null : 'la factura no declaro cuota de IVA (se emite el hueco, no se estima)',
          tercero: factura.tercero ? null : 'la factura no declaro tercero',
          asiento: factura.asiento ? null : 'no se adjunto asiento: el diario lo recibira por su camino'
        }
      }
    };
  }

  _obtenerOCrear(pid) {
    let e = this._emisiones.get(pid);
    if (!e) {
      e = { esquema: 'contabilidad-emision-factura-venta-v1', series: new Map() };
      this._emisiones.set(pid, e);
      this._persist.marcarDirty(pid);
    }
    return e;
  }

  _serieDe(em, serie) {
    let s = em.series.get(serie);
    if (!s) {
      s = { ultimo: 0, facturas: new Map() };
      em.series.set(serie, s);
    }
    return s;
  }

  _contar(em) {
    let n = 0;
    for (const s of em.series.values()) n += s.facturas.size;
    return n;
  }

  // Lectura directa de una factura emitida (mismo proceso) — solo lectura.
  facturaDe(pid, serie, numero) {
    const em = pid ? this._emisiones.get(pid) : null;
    if (!em) return null;
    const s = em.series.get(String(serie));
    return s ? (s.facturas.get(String(numero)) || null) : null;
  }

  // ── Tools ──
  toolEmitir(params) { return this._emitir(params); }
}

module.exports = EmisionFacturaVenta;
