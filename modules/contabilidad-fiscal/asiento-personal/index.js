/**
 * contabilidad-fiscal/asiento-personal — REFLEJO STATELESS (G3, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * GASTO DE PERSONAL, RETENCION Y PAGO -> ASIENTO **EQUILIBRADO**. Determinista.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Toma el recibo de nomina (G1, via `recibo-nomina.dar_forma.request` por EVENTO best-effort)
 * y la cotizacion (G2, via `obligacion-seguridad-social.calcular.request`) y CONSTRUYE el
 * asiento del coste de personal: sueldo bruto y SS de empresa al DEBE; retencion de IRPF, SS
 * (trabajador+empresa) y neto pendiente de pago al HABER.
 *
 * EL CERROJO: el asiento se construye para CUADRAR POR CONSTRUCCION (neto = bruto − retencion
 * − cotizacion_trabajador). Si las cifras declaradas no sostienen el cuadre, NO se inventa un
 * ajuste para tapar la diferencia: se declara ABIERTO y no se sube a asentar.
 *
 * Invariante (13): dato ausente = desconocido. Sin el sueldo bruto NO hay asiento que construir.
 * Lo que no venga declarado NO se rellena con ceros: se declara en `abierto` (los huecos viajan).
 *
 * R2 · no aplica: el asiento lo ASIENTA escritor-diario (B2), no esta hoja. SUBE best-effort
 * `escritor-diario.asentar.request` con el asiento cuadrado; el custodio aplica su guarda de
 * partida doble.
 *
 * ESCUCHA (R3): contabilidad.nomina_recibida, emitido por puerto-nomina (G4) → emisor vivo.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. RPC construir es CLASE PREGUNTA → SIN ui_handler.
 * Ver hoja G3 del plan-construccion y diseno-oop.md (CLASE AsientoPersonal).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const EPSILON = 0.005;

class AsientoPersonal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'asiento-personal';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'asiento-personal.construir.response', async (d) => {
      const res = await this._construir(d);
      if (res.status !== 200) {
        this.eventBus?.publish('asiento-personal.construir.failed', res);
      } else if (res.data && res.data.asiento && res.data.equilibrado === true) {
        // Asiento cuadrado → SUBE best-effort a escritor-diario (B2), que es quien asienta.
        this.eventBus?.publish('escritor-diario.asentar.request', {
          project_id: res.data.project_id,
          asiento: res.data.asiento,
          origen: 'asiento-personal',
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): llego una nomina → se toma constancia ──
  onNominaRecibida(e) {
    const d = (e && (e.data || e)) || {};
    try {
      this.logger?.info(`${this.name}.contexto.nomina`, { project_id: d.project_id || null, periodo: d.periodo || null });
    } catch (err) {
      this.logger?.error(`${this.name}.nomina_recibida.error`, { error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // _construir(input) → { status, data }  ·  asiento de personal EQUILIBRADO
  // ══════════════════════════════════════════════════════════════════════
  async _construir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cifras = await this._cifrasDe(input, pid);

    // Sin el sueldo bruto NO hay asiento que construir (dato ausente = desconocido).
    if (cifras.bruto === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'asiento-personal',
          asiento: null,
          lineas: [],
          cuadra: null,
          equilibrado: false,
          fuente: cifras.fuente,
          abierto: { bruto: 'no llego el sueldo bruto (ni declarado ni del recibo): el asiento de personal no se inventa' }
        }
      };
    }

    const bruto = cifras.bruto;
    const retencion = cifras.retencion || 0;
    const cot_trabajador = cifras.cot_trabajador || 0;
    const cot_empresa = cifras.cot_empresa || 0;
    // El NETO se DERIVA: bruto − retencion − cotizacion del trabajador. No se declara a ojo.
    const neto = this._round(bruto - retencion - cot_trabajador, 2);

    const lineas = [];
    // DEBE: el gasto (sueldos + SS a cargo de la empresa).
    lineas.push({ cuenta: cifras.cuenta_sueldos || '640', debe: bruto, haber: 0, concepto: 'sueldos y salarios' });
    if (cot_empresa) lineas.push({ cuenta: cifras.cuenta_ss_empresa || '642', debe: this._round(cot_empresa, 2), haber: 0, concepto: 'seguridad social a cargo de la empresa' });
    // HABER: las obligaciones (retencion, SS) y el neto pendiente de pago.
    if (retencion) lineas.push({ cuenta: cifras.cuenta_hp_retenciones || '4751', debe: 0, haber: this._round(retencion, 2), concepto: 'HP acreedora por retenciones practicadas' });
    if (cot_trabajador || cot_empresa) lineas.push({ cuenta: cifras.cuenta_ss_acreedora || '476', debe: 0, haber: this._round(cot_trabajador + cot_empresa, 2), concepto: 'organismos de la seguridad social acreedores' });
    lineas.push({ cuenta: cifras.cuenta_neto || '465', debe: 0, haber: neto, concepto: 'remuneraciones pendientes de pago (neto)' });

    const suma_debe = this._round(lineas.reduce((a, l) => a + l.debe, 0), 2);
    const suma_haber = this._round(lineas.reduce((a, l) => a + l.haber, 0), 2);
    const diferencia = this._round(suma_debe - suma_haber, 2);
    const equilibrado = Math.abs(diferencia) <= EPSILON;

    const asiento = {
      fecha: input.fecha != null ? String(input.fecha) : (cifras.fecha || new Date().toISOString().slice(0, 10)),
      concepto: input.concepto != null ? String(input.concepto) : 'nomina',
      clave: input.clave != null ? String(input.clave) : (cifras.clave || null),
      lineas
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'asiento-personal',
        fuente: cifras.fuente,
        asiento,
        lineas,
        desglose: { bruto, retencion: this._round(retencion, 2), cotizacion_trabajador: this._round(cot_trabajador, 2), cotizacion_empresa: this._round(cot_empresa, 2), neto },
        suma_debe,
        suma_haber,
        diferencia,
        cuadra: equilibrado,
        equilibrado,
        determinista: true,
        formula: 'neto = bruto − retencion − cotizacion_trabajador;  DEBE(bruto + SS_empresa) == HABER(retencion + SS + neto)',
        abierto: {
          retencion: (cifras.retencion === null) ? 'el recibo no declaro retencion de IRPF (se anota el hueco, no se inventa)' : null,
          cotizacion_trabajador: (cifras.cot_trabajador === null) ? 'no se declaro la cotizacion del trabajador' : null,
          cotizacion_empresa: (cifras.cot_empresa === null) ? 'no se declaro la cotizacion de empresa (obligacion-seguridad-social no respondio)' : null
        }
      }
    };
  }

  // Trae las cifras: declaradas en el input, o del recibo (G1) y de la SS (G2) por EVENTO.
  async _cifrasDe(input, pid) {
    const directo = input.nomina && typeof input.nomina === 'object' ? input.nomina
      : (input.recibo && typeof input.recibo === 'object' ? input.recibo : input);

    let bruto = this._num(directo.bruto ?? directo.salario_bruto ?? directo.importe_bruto ?? directo.devengos);
    let retencion = this._num(directo.retencion ?? directo.retencion_irpf ?? directo.irpf);
    let cot_trabajador = this._num(directo.cotizacion_trabajador ?? directo.ss_trabajador ?? directo.cotiza_trabajador);
    let cot_empresa = this._num(directo.cotizacion_empresa ?? directo.ss_empresa ?? directo.cotiza_empresa);
    let fuente = 'declarado';

    // Sin bruto declarado, se pide el recibo a G1 (best-effort por EVENTO).
    if (bruto === null) {
      const recibo = await this._rpc('recibo-nomina.dar_forma.request', {
        project_id: pid, nomina: input.nomina || null, periodo: input.periodo
      }, { timeout_ms: 800 });
      const r = (recibo && (recibo.data || recibo)) || null;
      const rb = r && (r.recibo || r);
      if (rb) {
        const b = this._num(rb.bruto ?? rb.salario_bruto ?? rb.importe_bruto ?? rb.devengos);
        if (b !== null) {
          bruto = b; fuente = 'recibo-nomina';
          if (retencion === null) retencion = this._num(rb.retencion ?? rb.retencion_irpf ?? rb.irpf);
          if (cot_trabajador === null) cot_trabajador = this._num(rb.cotizacion_trabajador ?? rb.ss_trabajador);
        }
      }
    }

    // La SS de empresa se pide a G2 (best-effort por EVENTO) si no vino declarada.
    if (cot_empresa === null) {
      const ss = await this._rpc('obligacion-seguridad-social.calcular.request', {
        project_id: pid, nomina: input.nomina || null, periodo: input.periodo
      }, { timeout_ms: 800 });
      const s = (ss && (ss.data || ss)) || null;
      const ce = s && this._num(s.cotizacion_empresa ?? s.gasto_empresa ?? s.cotizacion);
      if (ce !== null) { cot_empresa = ce; if (fuente === 'declarado') fuente = 'recibo-nomina+ss'; }
    }

    return {
      bruto,
      retencion: retencion === null ? null : retencion,
      cot_trabajador: cot_trabajador === null ? null : cot_trabajador,
      cot_empresa: cot_empresa === null ? null : cot_empresa,
      cuenta_sueldos: directo.cuenta_sueldos,
      cuenta_ss_empresa: directo.cuenta_ss_empresa,
      cuenta_hp_retenciones: directo.cuenta_hp_retenciones,
      cuenta_ss_acreedora: directo.cuenta_ss_acreedora,
      cuenta_neto: directo.cuenta_neto,
      fecha: directo.fecha,
      clave: directo.clave,
      fuente: bruto === null ? null : fuente
    };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolConstruir(params) { return this._construir(params); }
}

module.exports = AsientoPersonal;
