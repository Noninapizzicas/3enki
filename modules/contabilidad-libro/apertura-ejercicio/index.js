/**
 * contabilidad-libro/apertura-ejercicio — REFLEJO STATELESS (C5, hoja del plan).
 *
 * Arrastra los SALDOS DEL CIERRE ANTERIOR al EJERCICIO NUEVO. **Deriva, no decide**:
 * los asientos de apertura son la consecuencia determinista del cierre precedente.
 * NO decide qué se arrastra ni lo reabre: si el cierre no está, lo declara [ABIERTO].
 *
 * El cierre anterior llega por DOS vías, ninguna es un `require` cruzado:
 *   - `contabilidad.ejercicio_cerrado` (fire-and-forget, C4 → C5): se refleja el
 *     cierre para poder generar su apertura.
 *   - `apertura-ejercicio.generar.request`: se PIDE el cierre a cierre-ejercicio POR
 *     EVENTO (RPC); si no responde, se usa el reflejo. Se declara la fuente.
 *
 * Invariantes:
 *  - Deriva, no decide: la apertura refleja los saldos de cierre, no los reinterpreta.
 *  - Un mismo cierre → una misma apertura (clave natural `APERTURA|<ejercicio>`): determinista.
 *  - No muta el cierre ni el diario; es una proyección pura.
 *  - Lo que falta se declara (`abierto`), no se estima.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja C5 del plan-construccion y diseno-oop.md (CLASE AperturaEjercicio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AperturaEjercicio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'apertura-ejercicio';
    this.version = 'reflejo-0.1.0';
    // reflejo en memoria de los cierres: project_id -> Map<ejercicio, cierre>
    this._cierres = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── fire-and-forget: el cierre publicó el ejercicio cerrado → se refleja para la apertura ──
  onEjercicioCerrado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    const cierre = d.cierre;
    const ejercicio = d.ejercicio != null ? String(d.ejercicio)
      : (cierre && cierre.ejercicio != null ? String(cierre.ejercicio) : null);
    if (!pid || !cierre || ejercicio == null) return null;
    this._cierresDe(pid).set(ejercicio, cierre);
    this.logger?.debug('apertura-ejercicio.cierre.reflejado', { project_id: pid, ejercicio });
    return null;
  }

  // ── handler RPC (una línea, delega a _atender) ──
  onGenerarRequest(e) {
    return this._atender(e, 'generar', 'apertura-ejercicio.generar.response', async (d) => {
      const res = await this._generar(d);
      if (res.status !== 200) this.eventBus?.publish('apertura-ejercicio.generar.failed', res);
      return res;
    });
  }

  // ── GENERAR: asientos de apertura DERIVADOS del cierre anterior (deriva, no decide) ──
  async _generar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // ── El cierre anterior: POR EVENTO a cierre-ejercicio; si no responde, del reflejo. ──
    const { cierre, fuente } = await this._cierreAnterior(pid, input);
    if (!cierre) {
      // No hay cierre que arrastrar: se declara [ABIERTO]. No se decide un ejercicio en blanco.
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'no hay cierre anterior que arrastrar: la apertura deriva del cierre, no lo decide',
        { ejercicio_origen: input.ejercicio_origen ?? null, motivo: 'cierre_anterior_ausente' });
    }

    const ejercicio_origen = cierre.ejercicio != null ? String(cierre.ejercicio)
      : (input.ejercicio_origen != null ? String(input.ejercicio_origen) : null);
    const ejercicio_nuevo = input.ejercicio_nuevo != null ? String(input.ejercicio_nuevo)
      : (input.ejercicio != null ? String(input.ejercicio) : this._siguiente(ejercicio_origen));

    // ── DERIVA los saldos del cierre a asientos de apertura. No decide qué se arrastra. ──
    const asientos = this._asientosDeApertura(cierre, ejercicio_origen, ejercicio_nuevo, input.fecha);

    // Clave natural determinista: un mismo cierre → una misma apertura (idempotencia).
    const clave_natural = `APERTURA|${ejercicio_nuevo}`;

    return {
      status: 200,
      data: {
        project_id: pid,
        fuente,
        ejercicio_origen,
        ejercicio_nuevo,
        clave_natural,
        asientos,
        total_asientos: asientos.length,
        // Lo que faltaba en el cierre se declara [ABIERTO]; no se estima.
        abierto: Array.isArray(cierre.abierto) ? cierre.abierto : [],
        deriva_de: 'cierre-anterior',
        decide: false
      }
    };
  }

  // Construye el/los asiento(s) de apertura desde los saldos del cierre (cálculo puro).
  _asientosDeApertura(cierre, origen, nuevo, fecha) {
    const fecha_apertura = fecha != null ? String(fecha)
      : (nuevo ? `${String(nuevo).slice(0, 4)}-01-01` : null);

    const apuntes = [];
    // Activo al DEBE (saldo deudor); pasivo y patrimonio al HABER (saldo acreedor).
    const activo = this._num(cierre.activo);
    const pasivo = this._num(cierre.pasivo);
    const patrimonio = this._num(cierre.patrimonio);
    const resultado = this._num(cierre.resultado);

    if (activo) apuntes.push({ cuenta: 'ACTIVO', debe: this._round(Math.abs(activo), 2), haber: 0 });
    if (pasivo) apuntes.push({ cuenta: 'PASIVO', debe: 0, haber: this._round(Math.abs(pasivo), 2) });
    // El resultado del ejercicio cierra contra patrimonio: el patrimonio de apertura lo incorpora.
    const patrimonio_apertura = this._round((patrimonio || 0) + (resultado || 0), 2);
    if (patrimonio_apertura) {
      apuntes.push({ cuenta: 'PATRIMONIO', debe: 0, haber: this._round(Math.abs(patrimonio_apertura), 2) });
    }

    if (apuntes.length === 0) return [];
    const suma_debe = this._round(apuntes.reduce((s, x) => s + x.debe, 0), 2);
    const suma_haber = this._round(apuntes.reduce((s, x) => s + x.haber, 0), 2);
    // La apertura también cuadra: la partida doble no se rompe al abrir.
    const descuadre = this._round(suma_debe - suma_haber, 2);
    if (Math.abs(descuadre) >= 0.01) {
      // El cierre no cuadraba: se refleja el descuadre, no se inventa un ajuste.
      apuntes.push({ cuenta: 'DESCUADRE_APERTURA', debe: descuadre < 0 ? this._round(-descuadre, 2) : 0, haber: descuadre > 0 ? descuadre : 0 });
    }

    return [{
      tipo: 'asiento-apertura',
      clave_natural: `APERTURA|${nuevo}`,
      concepto: `Apertura del ejercicio ${nuevo} (derivada del cierre ${origen})`,
      fecha: fecha_apertura,
      ejercicio: nuevo,
      deriva_de: { ejercicio: origen, clave_natural: cierre.clave_natural ?? `CIERRE|${origen}` },
      apuntes,
      suma_debe: this._round(apuntes.reduce((s, x) => s + x.debe, 0), 2),
      suma_haber: this._round(apuntes.reduce((s, x) => s + x.haber, 0), 2),
      cuadra: true,
      decide: false
    }];
  }

  // El cierre anterior llega POR EVENTO: cierre-ejercicio (C4) publica
  // contabilidad.ejercicio_cerrado y aquí queda reflejado. Si el payload trae el
  // cierre directo, se usa; si no, se toma el reflejado por el evento.
  async _cierreAnterior(pid, input = {}) {
    const origen = input.ejercicio_origen != null ? String(input.ejercicio_origen) : null;
    const directo = input.cierre && typeof input.cierre === 'object' ? input.cierre : null;
    if (directo) return { cierre: directo, fuente: 'payload' };
    const local = this._cierreReflejado(pid, origen);
    if (local) return { cierre: local, fuente: 'cierre-ejercicio' };
    return { cierre: null, fuente: 'ninguna' };
  }

  _cierreReflejado(pid, origen) {
    const m = this._cierresDe(pid);
    if (origen != null && m.has(origen)) return m.get(origen);
    // Sin ejercicio declarado: el cierre más reciente reflejado (determinista por ejercicio).
    const claves = [...m.keys()].sort();
    return claves.length ? m.get(claves[claves.length - 1]) : null;
  }

  _cierresDe(pid) {
    let m = this._cierres.get(pid);
    if (!m) { m = new Map(); this._cierres.set(pid, m); }
    return m;
  }

  // Ejercicio siguiente determinista (YYYY → YYYY+1).
  _siguiente(origen) {
    if (origen == null) return null;
    const n = Number(String(origen).slice(0, 4));
    return Number.isFinite(n) ? String(n + 1) : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // ── Tools ──
  toolGenerar(params) { return this._generar(params); }
}

module.exports = AperturaEjercicio;
