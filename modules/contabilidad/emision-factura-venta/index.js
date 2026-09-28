/**
 * contabilidad/emision-factura-venta — CUSTODIO (O1 + O2, hoja del plan).
 *
 * DECISION DEL DUENO: contabilidad SI emite la factura — es su DOCUMENTO. Cara
 * EMITIDA con serie y numeracion fiscal: numeracion CORRELATIVA SIN SALTOS; un
 * numero duplicado es CORRUPCION del libro, por eso UN SOLO ESCRITOR (guard de
 * rol EMISION). El desglose (bases/impuestos) se COMPONE; se emite ticket o
 * factura completa segun el TIPO, que es DATO del hecho. La rectificativa (O2)
 * es comercial: ABONO / DEVOLUCION / DESCUENTO — el asiento original NO SE
 * BORRA, la rectificativa SUMA (plano 3 de los 4 planos de correccion: != ajuste
 * interno B5 y != rectificacion fiscal D14).
 *
 * CUSTODIO (patron real): store en memoria con las SERIES y los numeros emitidos
 * por proyecto; PosPersistencia (storage /contabilidad/emision-factura-venta/*.json);
 * restaura en project.activated; flush en onUnload. Guard de escritor de la
 * PARCELA: solo el rol EMISION emite/rectifica — dos escritores sobre la misma
 * serie = numeros duplicados = corrupcion (prohibido). Las dependencias
 * (maestro-terceros N1, catalogo-cuentas B1, escritor-diario B2) se leen por
 * EVENTO, NUNCA por require cruzado; si el cliente no esta identificado en el
 * maestro, se DECLARA (no se inventa la ficha) y la emision sigue con el NIF
 * literal del hecho.
 *
 * Emisor/par de fallo: exito publica contabilidad.factura_emitida /
 * contabilidad.factura_rectificada; error su par determinista.
 * NO REUTILIZA: no existe emision de factura con serie fiscal en el inventario
 * (fiscal en Enki = 0 modulos). `prisma/ticket` formatea texto, no emite
 * documento fiscal (patron de formato tomado).
 *
 * Ver hojas O1/O2 del diseno-oop y bloque `emision-factura-venta` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela (O1): la numeracion es de UN solo escritor.
const ROL_EMISION = 'EMISION';

// Tipos de documento emitible (DATO del hecho): ticket simplificado o completa.
const TIPOS = new Set(['TICKET', 'FACTURA', 'SIMPLIFICADA', 'COMPLETA']);

// Motivos de la rectificativa comercial (O2).
const MOTIVOS_RECTIFICATIVA = new Set(['ABONO', 'DEVOLUCION', 'DESCUENTO']);

// Serie por defecto cuando el negocio no declara otra ([ABIERTO]: negocio/canal/unica).
const SERIE_DEFECTO = 'UNICA';

class EmisionFacturaVenta extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'emision-factura-venta';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, series: { <idSerie>: {ultimo, emitidas:[]} },
    //                                    rectificativas: [], series_declaradas: [] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'emision-factura-venta.json',
      dir: '/contabilidad/emision-factura-venta',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.series) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las series y los numeros emitidos del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onEmitirRequest(e) {
    return this._atender(e, 'emitir', 'contabilidad.factura.emitir.response', async (d) => {
      const res = await this._emitir(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.factura_emitida', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.factura.emitir.failed', res);
      }
      return res;
    });
  }

  onRectificarRequest(e) {
    return this._atender(e, 'rectificar', 'contabilidad.factura.rectificar.response', async (d) => {
      const res = await this._rectificar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.factura_rectificada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.factura.rectificar.failed', res);
      }
      return res;
    });
  }

  onSeriesRequest(e) {
    return this._atender(e, 'series', 'contabilidad.factura.series.response', async (d) => {
      const res = this._series(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.factura.series.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-emision-factura-venta-v1', series: {}, rectificativas: [], series_declaradas: [] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // Guard de escritor de la PARCELA: solo EMISION toca la numeracion.
  _guardEscritor(rol) {
    const r = String(rol || '').toUpperCase();
    if (r !== ROL_EMISION) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo EMISION emite/rectifica la factura', {
        rol_esperado: ROL_EMISION, rol_recibido: r
      });
    }
    return null;
  }

  // Compone el desglose (bases + impuestos) desde las lineas. El TIPO es DATO.
  _componerDesglose(factura) {
    const lineas = Array.isArray(factura && factura.lineas) ? factura.lineas : [];
    const desglose = lineas.map((l) => {
      const base = Number(l && (l.base ?? l.importe ?? l.precio));
      const tipo = Number(l && (l.tipo_iva ?? l.iva ?? l.tipo));
      const b = Number.isFinite(base) ? this._round(base, 2) : 0;
      const t = Number.isFinite(tipo) ? tipo : 0;
      return { concepto: (l && (l.concepto || l.descripcion)) || null, base: b, tipo: t, cuota: this._round(b * t / 100, 2), total: this._round(b + b * t / 100, 2) };
    });
    const sumaBases = this._round(desglose.reduce((s, x) => s + x.base, 0), 2);
    const sumaCuotas = this._round(desglose.reduce((s, x) => s + x.cuota, 0), 2);
    return { lineas: desglose, suma_bases: sumaBases, suma_cuotas: sumaCuotas, total: this._round(sumaBases + sumaCuotas, 2) };
  }

  // emitir(factura) -> FacturaEmitida — asigna numero CORRELATIVO SIN SALTOS.
  async _emitir(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._guardEscritor(input && input.rol);
    if (guard) return guard;

    const factura = (input && input.factura) || null;
    if (!factura || typeof factura !== 'object') return this._invalid('factura');

    const tipo = String((factura.tipo || input.tipo || (factura.cliente || factura.id_tercero ? 'FACTURA' : 'TICKET'))).toUpperCase();
    if (!TIPOS.has(tipo)) return this._invalid('factura.tipo');

    const serie = String((input.serie || factura.serie || this._serieDe(pid, input)) || SERIE_DEFECTO).toUpperCase();
    const desglose = this._componerDesglose(factura);
    if (desglose.lineas.length === 0 && !Number.isFinite(Number(factura.total))) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'la factura no trae lineas ni total: no hay desglose que emitir', { serie, tipo });
    }

    const d = this._obtenerOCrear(pid);
    const sec = this._serieOCrear(d, pid, serie);
    const numero = sec.ultimo + 1;                  // correlativo SIN SALTOS
    const idFactura = `${serie}-${String(numero).padStart(6, '0')}`;

    const emitida = {
      id_factura: idFactura,
      serie,
      numero,
      correlativo_sin_saltos: true,
      tipo,
      fecha_emision: (factura.fecha || factura.fecha_emision) || new Date().toISOString().slice(0, 10),
      id_tercero: factura.id_tercero || null,
      nif: factura.nif || null,
      cliente: factura.cliente || null,
      cliente_identificado: null,   // lo rellena la lectura por EVENTO (abajo)
      desglose,
      no_borra: true,
      emitida_por: ROL_EMISION,
      emitida_en: new Date().toISOString()
    };

    // Dependencia por EVENTO (N1): ¿el cliente esta en el maestro? Si no responde, SE DECLARA.
    const cliente = await this._clienteEnMaestro(pid, emitida);
    emitida.cliente_identificado = cliente.identificado;
    emitida.cliente_fuente = cliente.fuente;

    sec.ultimo = numero;
    sec.emitidas.push({ id_factura: idFactura, numero, tipo, total: desglose.total, fecha_emision: emitida.fecha_emision });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        op: 'emitir',
        project_id: pid,
        factura_emitida: emitida,
        serie,
        numero,
        siguiente_numero: numero + 1,
        sin_saltos: true,
        un_solo_escritor: true,
        decision_dueno: 'contabilidad SI emite: la factura es su documento'
      }
    };
  }

  // Dependencia por EVENTO (N1): identifica al cliente en el maestro. TOLERANTE:
  // si no responde, NO se inventa la ficha — se declara la fuente.
  async _clienteEnMaestro(pid, emitida) {
    const nif = emitida.nif;
    if (!nif) return { identificado: false, fuente: 'SIN_NIF' };
    const resp = await this._rpc('contabilidad.tercero.identificar.request', { project_id: pid, nif }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200 || !resp.data) return { identificado: false, fuente: 'NO_DISPONIBLE' };
    return { identificado: !!resp.data.id_tercero, id_tercero: resp.data.id_tercero, fuente: 'MAESTRO_TERCEROS' };
  }

  _serieDe(pid, input) {
    const d = this._store.get(pid);
    if (!d || !Array.isArray(d.series_declaradas) || d.series_declaradas.length === 0) return null;
    return d.series_declaradas[0];
  }

  _serieOCrear(d, pid, serie) {
    if (!d.series[serie]) {
      d.series[serie] = { ultimo: 0, emitidas: [], creada_en: new Date().toISOString() };
      if (!d.series_declaradas.includes(serie)) d.series_declaradas.push(serie);
      this._persist.marcarDirty(pid);
    }
    return d.series[serie];
  }

  // series() -> List<IdSerie> (por negocio/canal/unica — declarable).
  _series(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);
    const series = Object.keys(d.series).map((s) => ({
      id_serie: s,
      ultimo_numero: d.series[s].ultimo,
      siguiente_numero: d.series[s].ultimo + 1,
      n_emitidas: d.series[s].emitidas.length
    }));
    return {
      status: 200,
      data: {
        project_id: pid,
        series,
        n_series: series.length,
        serie_defecto: SERIE_DEFECTO,
        criterio_serie: 'DECLARABLE',   // por negocio/canal/unica ([ABIERTO])
        sin_saltos: true
      }
    };
  }

  // calcularAjuste(original, motivo) -> Importe — abono/devolucion/descuento; NO borra (O2).
  _calcularAjuste(original, motivo) {
    const total = Number(original && (original.total ?? original.importe));
    if (!Number.isFinite(total)) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'la factura original no trae total: no se puede calcular el ajuste', { motivo });
    }
    const m = String(motivo || '').toUpperCase();
    if (!MOTIVOS_RECTIFICATIVA.has(m)) {
      return this._invalid('motivo');
    }
    // El ajuste es NEGATIVO (resta) pero SUMA un asiento nuevo: NUNCA borra.
    const importe = m === 'DESCUENTO'
      ? this._round(Number(original.descuento) || 0, 2)
      : this._round(total, 2);
    return {
      status: 200,
      data: {
        motivo: m,
        total_original: this._round(total, 2),
        importe_ajuste: this._round(-importe, 2),
        signo: 'SUMA_EN_NEGATIVO',
        no_borra: true,
        plano_correccion: 'COMERCIAL_O2'
      }
    };
  }

  // rectificarSustitutiva(serie, rectificativa) -> OK | ERROR (O2).
  async _rectificar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._guardEscritor(input && input.rol);
    if (guard) return guard;

    const rect = (input && (input.rectificativa || input.factura)) || null;
    if (!rect || typeof rect !== 'object') return this._invalid('rectificativa');

    const motivo = String(rect.motivo || input.motivo || '').toUpperCase();
    if (!MOTIVOS_RECTIFICATIVA.has(motivo)) {
      return this._errorResponse(422, 'MOTIVO_NO_VALIDO',
        'la rectificativa exige motivo ABONO | DEVOLUCION | DESCUENTO', {
          motivo_recibido: motivo, motivos_validos: [...MOTIVOS_RECTIFICATIVA]
        });
    }

    const original = rect.factura_original || input.factura_original || null;
    const idOriginal = typeof original === 'string' ? original : (original && original.id_factura) || null;

    const d = this._obtenerOCrear(pid);
    // El original debe existir en la parcela: NO se rectifica lo que no se emitio.
    if (idOriginal) {
      const hallado = Object.keys(d.series).some((s) => d.series[s].emitidas.some((x) => x.id_factura === idOriginal));
      if (!hallado) {
        return this._errorResponse(404, 'ERROR_FACTURA_ORIGINAL_NO_HALLADA',
          `la factura original ${idOriginal} no consta como emitida: no se rectifica a ciegas`, {
            id_factura_original: idOriginal, motivo
          });
      }
    } else {
      return this._errorResponse(422, 'ERROR_ORIGINAL_NO_DECLARADO',
        'la rectificativa no declara su factura original: se DECLARA, no se asume', { motivo });
    }

    const base = (typeof original === 'object' ? original : null) || this._buscarEmitida(d, idOriginal);
    const ajuste = this._calcularAjuste(base, motivo);
    if (ajuste.status !== 200) return ajuste;

    // Serie de la rectificativa: misma que la original salvo declaracion (O1: O2 es posterior).
    const serieOriginal = String(idOriginal).split('-')[0];
    const serieRect = String(rect.serie || input.serie || `${serieOriginal}R`).toUpperCase();
    const sec = this._serieOCrear(d, pid, serieRect);
    const numero = sec.ultimo + 1;
    const idRectificativa = `${serieRect}-${String(numero).padStart(6, '0')}`;

    const rectificada = {
      id_factura: idRectificativa,
      serie: serieRect,
      numero,
      correlativo_sin_saltos: true,
      tipo: 'RECTIFICATIVA',
      id_factura_original: idOriginal,
      motivo,
      importe_ajuste: ajuste.data.importe_ajuste,
      total_original: ajuste.data.total_original,
      no_borra: true,
      suma: true,
      original_intacto: true,
      rectificada_por: ROL_EMISION,
      rectificada_en: new Date().toISOString()
    };

    sec.ultimo = numero;
    sec.emitidas.push({ id_factura: idRectificativa, numero, tipo: 'RECTIFICATIVA', total: rectificada.importe_ajuste, id_factura_original: idOriginal });
    d.rectificativas.push(rectificada);
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        op: 'rectificar',
        project_id: pid,
        factura_original: idOriginal,
        rectificativa: rectificada,
        ajuste: ajuste.data,
        no_borra: true,
        suma: true,
        original_intacto: true,
        plano_correccion: 'COMERCIAL_O2'
      }
    };
  }

  _buscarEmitida(d, idFactura) {
    for (const s of Object.keys(d.series)) {
      const f = d.series[s].emitidas.find((x) => x.id_factura === idFactura);
      if (f) return f;
    }
    return null;
  }

  // ── Tools ──
  toolEmitir(params) { return this._emitir(params); }
  toolRectificar(params) { return this._rectificar(params); }
  toolSeries(params) { return this._series(params); }
  toolCalcularAjuste(params) { return this._calcularAjuste(params.original, params.motivo); }
}

module.exports = EmisionFacturaVenta;
