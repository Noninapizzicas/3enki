/**
 * contabilidad-fiscal/obligacion-seguridad-social — REFLEJO STATELESS (G2, hoja del plan).
 *
 * El GASTO DE EMPRESA + la OBLIGACION con la TGSS, derivados del recibo de nomina.
 * Mecanico y determinista: NO decide tipos ni bases — los TIPOS son DATO declarable y
 * las BASES vienen declaradas en el recibo. Este modulo solo APLICA lo declarado:
 *   aportacion_empresa = suma(base_i * tipo_i)  para cada par (base, tipo) DECLARADO.
 *
 * La invariante que lo define (13): dato ausente = desconocido. Si falta una base o su
 * tipo, esa contingencia queda `abierto` y NO se estima con un tipo por defecto — un tipo
 * inventado produce una obligacion falsa ante la TGSS. Lo que no se puede sumar se declara.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.nomina_recibida`; su emisor
 * `puerto-nomina` (G7) SI existe en el repo → SI se declara.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G2 del plan-construccion y diseno-oop.md (CLASE ObligacionSeguridadSocial).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Las CONTINGENCIAS de la cotizacion. La lista es ESTRUCTURA (nombre los conceptos);
// sus BASES y sus TIPOS son DATO declarable (no constantes de negocio ocultas).
const CONTINGENCIAS = ['contingencias_comunes', 'desempleo', 'fogasa', 'formacion_profesional', 'at_ep'];

class ObligacionSeguridadSocial extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'obligacion-seguridad-social';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'obligacion-seguridad-social.calcular.response', async (d) => {
      const res = await this._calcular(d);
      // Reflejo: calcula la obligacion; no escribe estado → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('obligacion-seguridad-social.calcular.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): llego una nomina → se DERIVA su obligacion ──
  // Una PREGUNTA no muta estado: solo se recalcula en memoria para quien lo pida. El
  // resultado NO se publica como hecho (este modulo no escribe). Si el recibo declara
  // plazo y se pide explicitamente, se sube best-effort al calendario (ver _subirCalendario).
  async onNominaRecibida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return;
    try {
      const res = await this._calcular({ ...d, nomina: d.nomina || d.recibo || null });
      await this._subirCalendario(d, res);
    } catch (err) {
      this.logger?.error(`${this.name}.nomina.error`, { error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // _calcular(input) → { status, data }  ·  gasto de empresa + obligacion TGSS
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El recibo/nomina: declarado, o pedido por EVENTO a recibo-nomina (PREGUNTA→PREGUNTA).
    const { nomina, fuente } = await this._reciboDe(input);

    // Las BASES y los TIPOS declarados: en la nomina, o en el propio input (el asesor
    // puede declararlos aparte). Ausente → null (no se rellena).
    const bases = this._declarado(input.bases, nomina && nomina.bases);
    const tipos = this._declarado(input.tipos, nomina && nomina.tipos);

    let aportacion_empresa = 0;
    let algua_empresa = false;
    const contingencias = CONTINGENCIAS.map((k) => {
      const base = this._num(bases[k]);
      const tipo = this._num(tipos[k]);
      const aplicable = base !== null && tipo !== null;
      const importe = aplicable ? this._round(base * tipo, 2) : null;
      if (aplicable) { aportacion_empresa += importe; algua_empresa = true; }
      return {
        contingencia: k,
        base,                       // declarada; ausente → null
        tipo,                       // DATO declarable; ausente → null
        importe,                    // null si falta base o tipo (no se estima)
        aplicable,
        abierto: aplicable ? null : `falta ${base === null ? 'la base' : ''}${base === null && tipo === null ? ' y ' : ''}${tipo === null ? 'el tipo' : ''} de ${k} (no se estima)`
      };
    });

    // La aportacion del TRABAJADOR: declarada en el recibo (no se recalcula aqui).
    const aportacion_trabajador = this._num(nomina && (nomina.aportacion_trabajador != null ? nomina.aportacion_trabajador : nomina.ss_trabajador));
    // El bruto declarado, para el gasto de empresa (bruto + aportacion patronal).
    const bruto = this._num(nomina && (nomina.bruto != null ? nomina.bruto : nomina.total_devengado));

    const empresa_final = algua_empresa ? this._round(aportacion_empresa, 2) : null;
    const obligacion_tgss = (empresa_final !== null && aportacion_trabajador !== null)
      ? this._round(empresa_final + aportacion_trabajador, 2) : null;
    const gasto_empresa = (bruto !== null && empresa_final !== null)
      ? this._round(bruto + empresa_final, 2) : null;

    const periodo = input.periodo != null ? String(input.periodo)
      : (nomina && nomina.periodo != null ? String(nomina.periodo) : null);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'obligacion-seguridad-social',
        fuente: fuente || null,
        periodo,
        contingencias,
        // El GASTO de empresa y la OBLIGACION con la TGSS (null si faltan datos → declarado).
        aportacion_empresa: empresa_final,
        aportacion_trabajador,
        obligacion_tgss,
        gasto_empresa,
        // Determinista: mismas bases+tipos → misma obligacion.
        determinista: true,
        // El TIPO es DATO: no se asume ningun tipo por defecto.
        tipos_declarados: Object.keys(tipos).filter((k) => this._num(tipos[k]) !== null),
        abierto: {
          recibo: nomina ? null : 'no se recibio el recibo de nomina (ni declarado ni de recibo-nomina): la obligacion no se inventa',
          tipos: algua_empresa ? null : 'ninguna contingencia tiene base Y tipo declarados: la obligacion queda abierta (no se estiman tipos por defecto)',
          trabajador: aportacion_trabajador !== null ? null : 'la aportacion del trabajador no viene declarada en el recibo',
          bruto: bruto !== null ? null : 'el bruto no viene declarado: el gasto de empresa queda abierto'
        }
      }
    };
  }

  // Trae el recibo: declarado en el input, o pedido por EVENTO a recibo-nomina (PREGUNTA).
  async _reciboDe(input) {
    const directo = (input.nomina && typeof input.nomina === 'object') ? input.nomina
      : ((input.recibo && typeof input.recibo === 'object') ? input.recibo
        : ((input.hecho && typeof input.hecho === 'object') ? input.hecho : null));
    if (directo) return { nomina: directo, fuente: 'declarado' };

    const resp = await this._rpc('recibo-nomina.dar_forma.request', {
      project_id: input.project_id || this.project_id,
      empleado: input.empleado, periodo: input.periodo
    }, { timeout_ms: 800 });
    const forma = (resp && (resp.data || resp)) || null;
    if (forma && (forma.forma || forma.cabeza || forma.conceptos)) {
      return { nomina: { ...(forma.forma || {}), periodo: (forma.cabeza && forma.cabeza.periodo) || input.periodo }, fuente: 'recibo-nomina' };
    }
    return { nomina: null, fuente: null };
  }

  // Sube la obligacion al calendario SOLO si el input lo pide explicitamente.
  // Una PREGUNTA no muta estado por defecto: por eso es condicional y declarado.
  async _subirCalendario(input, res) {
    if (input.subir_calendario !== true) return;
    if (!res || res.status !== 200 || !res.data || !res.data.periodo) return;
    this.eventBus?.publish('calendario-fiscal.declarar.request', {
      project_id: res.data.project_id,
      obligacion: 'seguridad_social',
      periodo: res.data.periodo,
      importe: res.data.obligacion_tgss,
      correlation_id: input.correlation_id
    });
  }

  // Los valores declarados: preferencia al input explicito; si no, los de la nomina.
  _declarado(a, b) {
    const o = (a && typeof a === 'object') ? a : ((b && typeof b === 'object') ? b : {});
    return o || {};
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = ObligacionSeguridadSocial;
