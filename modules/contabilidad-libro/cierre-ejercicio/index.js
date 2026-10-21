/**
 * contabilidad-libro/cierre-ejercicio — CUSTODIO CON PERSISTENCIA (C4, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * EL CIERRE EN DOS NIVELES (decision del dueno):
 *   · El DIA cierra la CAJA           (nivel 'dia', clave (proyecto, ejercicio, mes, dia))
 *   · El MES cierra la CONTABILIDAD   (nivel 'mes', clave (proyecto, ejercicio, mes))
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Cierra el periodo CON AJUSTES: el cierre del mes pide a plan-amortizacion la cuota del
 * periodo y la asienta; el cierre del dia resume la caja. IRREVERSIBLE salvo ajuste — por eso
 * `reabrir` es una operacion explicita y se registra en la historia (append-only).
 *
 * Invariantes:
 *  - UN SOLO ESCRITOR por parcela (guard rol CIERRE_EJERCICIO; otro rol → 403).
 *  - IDEMPOTENTE por nivel+clave: un periodo ya cerrado NO se vuelve a cerrar (se declara).
 *  - APPEND-ONLY de la historia: cada cierre/reabrir se apila; NADA se borra.
 *  - Dato ausente = desconocido: sin cifras declaradas el periodo se cierra como VACIO (0)
 *    y se declara `abierto` — NO se inventa el resultado.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R2 · ESCRIBE → ANUNCIA: al cambiar el estado de cierre publica `contabilidad.ejercicio_cerrado`
 *   ({estado:'cerrado'|'reabierto'}) — el hecho que escucha apertura-ejercicio (C5) y demas.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + single-writer + append-only.
 * Ver hoja C4 del plan-construccion y diseno-oop.md (CLASE CierreEjercicio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor del cierre.
const ROL_ESCRITOR = 'CIERRE_EJERCICIO';
const NIVELES = new Set(['dia', 'mes']);

class CierreEjercicio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cierre-ejercicio';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, estados: Map<clave, estado>, historia: [cerrar/reabrir] }
    this._cierres = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cierre-ejercicio.json',
      dir: '/contabilidad/cierre-ejercicio',
      snapshot: (pid) => {
        const c = this._cierres.get(pid);
        if (!c) return null;
        return {
          project_id: pid,
          esquema: c.esquema,
          estados: [...c.estados.entries()].map(([clave, estado]) => ({ clave, ...estado })),
          historia: c.historia
        };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const estados = new Map();
        for (const e of (data.estados || [])) {
          if (e && e.clave) {
            const { clave, ...resto } = e;
            estados.set(String(clave), resto);
          }
        }
        this._cierres.set(pid, {
          esquema: data.esquema || 'contabilidad-cierre-ejercicio-v1',
          estados,
          historia: Array.isArray(data.historia) ? data.historia : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los cierres del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC de escritura (ORDEN → ui_handler) ──
  onCerrarRequest(e) {
    return this._atender(e, 'cerrar', 'cierre-ejercicio.cerrar.response', async (d) => {
      const res = await this._cerrar(d);
      if (res.status === 200 && res.data && res.data.cerrado) {
        // R2 · si CIERRA, anuncia el HECHO del cambio de estado (lo escucha apertura-ejercicio C5).
        this.eventBus?.publish('contabilidad.ejercicio_cerrado', {
          project_id: res.data.project_id,
          nivel: res.data.nivel,
          clave: res.data.clave,
          ejercicio: res.data.ejercicio,
          mes: res.data.mes,
          dia: res.data.dia,
          estado: 'cerrado',
          resultado: res.data.resultado != null ? res.data.resultado : null,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        this.eventBus?.publish('cierre-ejercicio.cerrar.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC de escritura (ORDEN → ui_handler): reapertura explicita (irreversible salvo ajuste) ──
  onReabrirRequest(e) {
    return this._atender(e, 'reabrir', 'cierre-ejercicio.reabrir.response', (d) => {
      const res = this._reabrir(d);
      if (res.status === 200 && res.data && res.data.reabierto) {
        // R2 · si REABRE (cambia estado), anuncia el HECHO con estado 'reabierto'.
        this.eventBus?.publish('contabilidad.ejercicio_cerrado', {
          project_id: res.data.project_id,
          nivel: res.data.nivel,
          clave: res.data.clave,
          ejercicio: res.data.ejercicio,
          mes: res.data.mes,
          dia: res.data.dia,
          estado: 'reabierto',
          motivo: res.data.motivo,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        this.eventBus?.publish('cierre-ejercicio.reabrir.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _cerrar(input) → { status, data }  ·  cierra el periodo (dia o mes)
  // ══════════════════════════════════════════════════════════════════════
  async _cerrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // UN SOLO ESCRITOR: si OTRO rol intenta cerrar, se rechaza.
    if (input.rol != null && input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor del cierre (CIERRE_EJERCICIO) puede cerrar el periodo',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol });
    }

    const { nivel, clave, ejercicio, mes, dia } = this._claves(input);
    if (!nivel) {
      return this._errorResponse(400, 'INVALID_INPUT',
        "nivel debe ser 'dia' o 'mes' (el DIA cierra la caja; el MES cierra la contabilidad)", { nivel: input.nivel ?? null });
    }
    if (nivel === 'mes' && mes == null) return this._invalid('mes');
    if (nivel === 'dia' && dia == null) return this._invalid('dia');

    const store = this._obtenerOCrear(pid);

    // IDEMPOTENTE por nivel+clave: un periodo ya cerrado NO se vuelve a cerrar.
    const previo = store.estados.get(clave);
    if (previo && previo.estado === 'cerrado') {
      return {
        status: 200,
        data: {
          project_id: pid, nivel, clave, ejercicio, mes, dia,
          cerrado: false, ya_cerrado: true,
          resultado: previo.resultado != null ? previo.resultado : null,
          motivo: 'el periodo ya estaba cerrado (misma clave): no se vuelve a cerrar',
          abierto: null
        }
      };
    }

    // Ajustes del MES: cuota de amortizacion del periodo (plan-amortizacion, best-effort).
    let amortizaciones = null;
    if (nivel === 'mes') {
      amortizaciones = await this._amortizacionesDe(pid, ejercicio, mes, input);
    }

    // Cifras del cierre: DECLARADAS. Sin cifras el periodo se cierra VACIO (0), no se inventa.
    const cifras = this._cifras(input, nivel, amortizaciones);
    const resultado = cifras.resultado;

    const ahora = new Date().toISOString();
    const registro = {
      nivel, ejercicio, mes: mes ?? null, dia: dia ?? null,
      cifras,
      // El cierre del MES escribe su asiento (resultado → patrimonio) por el diario (B2).
      asiento_solicitado: null
    };

    // El asiento de cierre se pide a escritor-diario (deps por EVENTO; no se escribe aqui).
    if (cifras.hay_cifras || Array.isArray(input.lineas)) {
      registro.asiento_solicitado = await this._asentarCierre(pid, input, cifras, ejercicio, mes, dia, nivel);
    }

    const estado = {
      nivel, ejercicio, mes: mes ?? null, dia: dia ?? null,
      estado: 'cerrado',
      resultado: resultado != null ? resultado : null,
      cifras,
      cerrado_en: ahora
    };
    store.estados.set(clave, estado);
    // APPEND-ONLY de la historia: se apila; NADA se borra.
    store.historia.push({ op: 'cerrar', clave, en: ahora, rol: input.rol ?? null, resultado: estado.resultado });
    store.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid, nivel, clave, ejercicio, mes: mes ?? null, dia: dia ?? null,
        cerrado: true, ya_cerrado: false,
        resultado: resultado != null ? resultado : null,
        amortizaciones,
        asiento: registro.asiento_solicitado,
        estado,
        append_only: true,
        niveles: {
          dia: nivel === 'dia' ? 'cerro la CAJA de este dia' : null,
          mes: nivel === 'mes' ? 'cerro la CONTABILIDAD de este mes' : null
        },
        abierto: {
          cifras: cifras.hay_cifras ? null : 'no llegaron cifras declaradas: el periodo se cierra VACIO (0), no se inventa el resultado',
          asiento: registro.asiento_solicitado ? null : 'no se pidio asiento de cierre (sin cifras ni lineas declaradas)'
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // _reabrir(input) → { status, data }  ·  reapertura explicita (irreversible salvo ajuste)
  // ══════════════════════════════════════════════════════════════════════
  _reabrir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    if (input.rol != null && input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor del cierre (CIERRE_EJERCICIO) puede reabrir el periodo',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol });
    }

    const { nivel, clave, ejercicio, mes, dia } = this._claves(input);
    if (!nivel) {
      return this._errorResponse(400, 'INVALID_INPUT',
        "nivel debe ser 'dia' o 'mes'", { nivel: input.nivel ?? null });
    }

    const store = this._colasGet(pid);
    const previo = store ? store.estados.get(clave) : null;
    if (!previo || previo.estado !== 'cerrado') {
      return { status: 200, data: { project_id: pid, nivel, clave, ejercicio, mes: mes ?? null, dia: dia ?? null, reabierto: false, motivo: 'el periodo no estaba cerrado: nada que reabrir' } };
    }

    const ahora = new Date().toISOString();
    previo.estado = 'reabierto';
    previo.reabierto_en = ahora;
    store.historia.push({ op: 'reabrir', clave, en: ahora, rol: input.rol ?? null, motivo: input.motivo != null ? String(input.motivo) : null });
    store.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid, nivel, clave, ejercicio, mes: mes ?? null, dia: dia ?? null,
        reabierto: true,
        motivo: input.motivo != null ? String(input.motivo) : null,
        // IRREVERSIBLE salvo ajuste: la reapertura queda en la historia (append-only).
        aviso: 'reapertura registrada en la historia; el cierre previo NO se borra (append-only)',
        append_only: true,
        abierto: { motivo: input.motivo != null ? null : 'no se declaro motivo de la reapertura (se anota el hueco, no se inventa)' }
      }
    };
  }

  // Deriva nivel/clave/ejercicio/mes/dia del input (clave en DOS niveles).
  _claves(input) {
    const nivel = input.nivel != null ? String(input.nivel).toLowerCase().trim() : null;
    if (!NIVELES.has(nivel)) return { nivel: null };
    const fecha = input.fecha != null ? String(input.fecha) : null;
    const ejercicio = input.ejercicio != null ? String(input.ejercicio)
      : (fecha && /^\d{4}/.test(fecha) ? fecha.slice(0, 4) : new Date().toISOString().slice(0, 4));
    const mes = input.mes != null ? String(input.mes).padStart(2, '0')
      : (fecha && /^\d{4}-\d{2}/.test(fecha) ? fecha.slice(5, 7) : null);
    const dia = input.dia != null ? String(input.dia).padStart(2, '0')
      : (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha.slice(8, 10) : null);
    const clave = nivel === 'dia'
      ? `${ejercicio}-${mes ?? '??'}-${dia ?? '??'}`
      : `${ejercicio}-${mes ?? '??'}`;
    return { nivel, clave, ejercicio, mes, dia };
  }

  // Cifras del cierre: declaradas. 'dia' usa saldo_caja; 'mes' usa resultado (o ingresos-gastos).
  _cifras(input, nivel, amortizaciones) {
    if (nivel === 'dia') {
      const saldo = this._num(input.saldo_caja ?? input.saldo ?? input.importe);
      return {
        tipo: 'caja',
        saldo_caja: saldo,
        resultado: saldo,
        movimientos: input.movimientos != null ? Number(input.movimientos) : null,
        amortizaciones: null,
        hay_cifras: saldo != null || input.movimientos != null
      };
    }
    let resultado = this._num(input.resultado);
    const ingresos = this._num(input.ingresos);
    const gastos = this._num(input.gastos);
    if (resultado == null && ingresos != null && gastos != null) {
      resultado = this._round(ingresos - gastos, 2);
    }
    const cuota = amortizaciones && amortizaciones.total != null ? this._num(amortizaciones.total) : null;
    return {
      tipo: 'mes',
      resultado,
      resultado_antes_ajustes: resultado,
      cuota_amortizacion: cuota,
      ingresos: ingresos != null ? ingresos : null,
      gastos: gastos != null ? gastos : null,
      amortizaciones: amortizaciones || null,
      hay_cifras: resultado != null || cuota != null || ingresos != null || gastos != null
    };
  }

  // Pide la cuota de amortizacion del periodo a plan-amortizacion (deps por EVENTO).
  async _amortizacionesDe(pid, ejercicio, mes, input) {
    if (Array.isArray(input.amortizaciones)) {
      const total = this._round(input.amortizaciones.reduce((a, x) => a + (this._num(x && x.cuota) || 0), 0), 2);
      return { fuente: 'declarado', cuotas: input.amortizaciones, total };
    }
    const r = await this._rpc('plan-amortizacion.cuota_del_periodo.request', {
      project_id: pid, ejercicio, mes, fecha: `${ejercicio}-${mes}`
    }, { timeout_ms: 800 });
    if (r && (r.cuota != null || Array.isArray(r.cuotas))) {
      const cuotas = Array.isArray(r.cuotas) ? r.cuotas : null;
      const total = r.total != null ? this._num(r.total)
        : (cuotas ? this._round(cuotas.reduce((a, x) => a + (this._num(x && x.cuota) || 0), 0), 2) : this._num(r.cuota));
      return { fuente: 'plan-amortizacion', cuotas, total };
    }
    return null;
  }

  // Asienta el cierre por EVENTO (escritor-diario B2). No se escribe el diario aqui.
  async _asentarCierre(pid, input, cifras, ejercicio, mes, dia, nivel) {
    const lineas = Array.isArray(input.lineas) ? input.lineas : this._lineasCierre(input, cifras, nivel);
    if (!lineas || lineas.length === 0) return null;
    const r = await this._rpc('escritor-diario.asentar.request', {
      project_id: pid,
      asiento: {
        fecha: nivel === 'dia' && dia ? `${ejercicio}-${mes}-${dia}` : `${ejercicio}-${mes ?? '01'}-01`,
        concepto: nivel === 'dia' ? `Cierre de caja ${ejercicio}-${mes}-${dia}` : `Cierre contable ${ejercicio}-${mes}`,
        clave: `cierre:${nivel}:${ejercicio}${mes ? '-' + mes : ''}${dia ? '-' + dia : ''}`,
        lineas
      },
      origen: 'cierre-ejercicio'
    }, { timeout_ms: 1500 });
    if (!r) return { solicitado: true, asentado: null, nota: 'no llego respuesta del diario (best-effort)' };
    return { solicitado: true, asentado: r.asentado === true, status: r.status ?? null, numero: r.asiento ? r.asiento.numero : null };
  }

  // Lineas del asiento de cierre con CUENTAS DECLARABLES (sin reglas PGC ocultas).
  _lineasCierre(input, cifras, nivel) {
    const cuenta_origen = input.cuenta_origen != null ? String(input.cuenta_origen) : (nivel === 'dia' ? '570' : '129');
    const cuenta_destino = input.cuenta_destino != null ? String(input.cuenta_destino) : (nivel === 'dia' ? '555' : '120');
    const importe = cifras.resultado;
    if (importe == null || importe === 0) return [];
    const abs = Math.abs(importe);
    // Cierre: se traspasa el saldo (origen ↔ destino). Si es negativo, se invierte.
    if (importe >= 0) {
      return [{ cuenta: cuenta_destino, debe: 0, haber: abs }, { cuenta: cuenta_origen, debe: abs, haber: 0 }];
    }
    return [{ cuenta: cuenta_destino, debe: abs, haber: 0 }, { cuenta: cuenta_origen, debe: 0, haber: abs }];
  }

  _colasGet(pid) { return this._cierres.get(pid) || null; }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _obtenerOCrear(pid) {
    let c = this._cierres.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-cierre-ejercicio-v1', estados: new Map(), historia: [] };
      this._cierres.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // ── Tools ──
  toolCerrar(params) { return this._cerrar(params); }
  toolReabrir(params) { return this._reabrir(params); }
}

module.exports = CierreEjercicio;
