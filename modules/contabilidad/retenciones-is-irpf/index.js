/**
 * contabilidad/retenciones-is-irpf — REFLEJO STATELESS (D4 + D5, hoja del plan).
 *
 * RETENCIONES practicadas/soportadas (D4) y ESTIMACION IS/IRPF (D5). LA LEY
 * ENTRA COMO DATO (invariante del dominio): los tipos de retencion (profesionales,
 * alquileres, trabajo) y el regimen del sujeto fiscal (IS sociedad | IRPF persona
 * fisica) son PARAMETROS DECLARABLES por sociedad — ninguna constante legal
 * cableada en la logica. El sistema no asume el sujeto fiscal: si no esta
 * declarado, se responde [ABIERTO] / PRECONDITION_FAILED, jamas un tipo de memoria.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated EN
 * EL CODIGO. Cada op entra objeto, sale objeto. Las bases se DERIVAN del mayor
 * (B3) o del resultado (C2, para el IS/IRPF) por EVENTO/payload; contrato
 * TOLERANTE: si la dependencia no responde, se DECLARA y NUNCA se emite una cuota
 * inventada. Dependencia por EVENTO, NUNCA require cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.retenciones_calculadas y
 * contabilidad.cuota_estimada; error su par determinista. NO REUTILIZA: IRPF/IS y
 * retenciones no existen en el inventario.
 *
 * Ver hojas D4/D5 del diseno-oop y bloque `retenciones-is-irpf` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Regimenes del sujeto fiscal: DECLARABLE por sociedad (nunca asumido).
const REGIMENES = ['IS', 'IRPF'];
// Conceptos de retencion habituales (la LISTA es convencion; el TIPO es dato).
const CONCEPTOS = ['PROFESIONALES', 'ALQUILERES', 'TRABAJO', 'MOBILIARIO', 'ACTIVIDADES'];

class RetencionesIsIrpf extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'retenciones-is-irpf';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'contabilidad.retenciones.calcular.response', async (d) => {
      const res = this._retencionesDe(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.retenciones_calculadas', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.retenciones.calcular.failed', res);
      }
      return res;
    });
  }

  onEstimarRequest(e) {
    return this._atender(e, 'estimar', 'contabilidad.estimacion.calcular.response', async (d) => {
      const res = await this._estimar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.cuota_estimada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.estimacion.calcular.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // practicadas(periodo) -> Importe (D4: profesionales, alquileres, trabajo — todos parametros).
  _practicadas(input) {
    const r = this._retencionesDe(input);
    return r.status === 200 ? { status: 200, data: { ...r.data, sentido: 'PRACTICADAS', importe: r.data.total_practicadas } } : r;
  }

  // soportadas(periodo) -> Importe (D4).
  _soportadas(input) {
    const r = this._retencionesDe(input);
    return r.status === 200 ? { status: 200, data: { ...r.data, sentido: 'SOPORTADAS', importe: r.data.total_soportadas } } : r;
  }

  // Retenciones D4: calculo con los porcentajes DECLARADOS por concepto. Nunca de memoria.
  _retencionesDe(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const tipos = this._tiposDe(input);
    if (tipos.error) return tipos.error;

    const bases = this._basesDe(input);
    if (bases === null) return this._invalid('bases');

    const detalle = [];
    let totalPracticadas = 0;
    let totalSoportadas = 0;

    for (const b of bases) {
      const concepto = String(b.concepto || b.clase || 'ACTIVIDADES').toUpperCase();
      const tipo = Number(b.tipo ?? tipos.tipos[concepto]);
      if (!Number.isFinite(tipo)) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          `el tipo de retencion del concepto ${concepto} no esta declarado: la ley entra como DATO`, {
            concepto, conceptos: CONCEPTOS, no_declarado: true
          });
      }
      const base = Number(b.base ?? b.importe) || 0;
      const cuota = this._round(base * (tipo / 100), 2);
      const sentido = String(b.sentido || 'PRACTICADA').toUpperCase();
      if (sentido === 'SOPORTADA') totalSoportadas = this._round(totalSoportadas + cuota, 2);
      else totalPracticadas = this._round(totalPracticadas + cuota, 2);
      detalle.push({ concepto, base: this._round(base, 2), tipo, cuota, sentido });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: (input && input.periodo) || null,
        detalle,
        total_practicadas: totalPracticadas,
        total_soportadas: totalSoportadas,
        neto: this._round(totalPracticadas - totalSoportadas, 2),
        tipos_declarados: true,
        determinista: true
      }
    };
  }

  // estimar(periodo) -> CuotaEstimada (D5: IS sociedad | IRPF persona fisica, declarable).
  async _estimar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const regimen = String((input && (input.regimen || input.sujeto_fiscal)) || '').toUpperCase();
    if (!regimen) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el sujeto fiscal (IS sociedad | IRPF persona fisica) es un parametro POR SOCIEDAD: no se asume', {
          regimenes: REGIMENES, abierto: '[ABIERTO]', no_asumido: true
        });
    }
    if (!REGIMENES.includes(regimen)) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        `regimen ${regimen} no declarado en el catalogo`, { regimenes: REGIMENES });
    }

    // Base = resultado (C2) declarado o derivado por EVENTO. Tramos/tipos = datos.
    const base = await this._baseFiscalDe(pid, input);
    if (base === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'no hay base fiscal (resultado C2) ni tramos declarados: no se estima una cuota inventada', {
          dependencia: 'estados-contables', accion: 'NO_CALCULAR_PUBLICAR_FALLO'
        });
    }

    const escalado = this._aplicarEscala(base.base_fiscal, input && input.escala);
    if (escalado.error) return escalado.error;

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: (input && input.periodo) || null,
        sociedad: (input && (input.sociedad || input.id_sociedad)) || null,
        regimen,
        base_fiscal: this._round(base.base_fiscal, 2),
        fuente_base: base.fuente,
        tramos: escalado.tramos,
        cuota_estimada: escalado.cuota,
        tipo_efectivo: base.base_fiscal > 0 ? this._round((escalado.cuota / base.base_fiscal) * 100, 4) : 0,
        estimacion: true,
        no_presenta: true,
        nota: 'estimacion con base DECLARADA: el sistema PREPARA, no presenta (eso es del asesor)',
        determinista: true
      }
    };
  }

  // ── helpers internos ──

  // Tipos de retencion DECLARABLES: { PROFESIONALES: 15, ALQUILERES: 19, ... }.
  _tiposDe(input) {
    const t = input && (input.tipos || input.tipos_retencion);
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      return { error: this._errorResponse(422, 'PRECONDITION_FAILED',
        'los tipos de retencion no estan declarados: la ley entra como DATO (nunca de memoria)', {
          conceptos: CONCEPTOS, no_declarado: true
        }) };
    }
    return { tipos: t };
  }

  _basesDe(input) {
    const b = input && (input.bases || input.lineas);
    if (Array.isArray(b)) return b;
    if (b && Array.isArray(b.bases)) return b.bases;
    return null;
  }

  // Base fiscal (resultado C2) declarada o derivada; tipos/escala DECLARABLES.
  async _baseFiscalDe(pid, input) {
    const declarada = input && (input.base_fiscal ?? (input.resultado && input.resultado.resultado));
    if (Number.isFinite(Number(declarada))) {
      return { base_fiscal: Number(declarada), fuente: 'DECLARADA' };
    }
    const resp = await this._rpc('contabilidad.estado.resultado.request', {
      project_id: pid,
      periodo: (input && input.periodo) || null
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    const resultado = resp.data && (resp.data.resultado || resp.data);
    const valor = resultado && (resultado.resultado ?? resultado.total);
    if (!Number.isFinite(Number(valor))) return null;
    return { base_fiscal: Number(valor), fuente: 'DERIVADA_DEL_RESULTADO' };
  }

  // Escala/tramos DECLARABLES (ley como DATO). Sin escala -> [ABIERTO], nunca tipo de memoria.
  _aplicarEscala(baseFiscal, escala) {
    if (!Array.isArray(escala) || escala.length === 0) {
      return { error: this._errorResponse(422, 'PRECONDITION_FAILED',
        'la escala/tramos del impuesto no estan declarados: la ley entra como DATO', {
          tramos_declarables: true, no_declarado: true
        }) };
    }
    const tramos = [...escala].sort((a, b) => this._techoDe(a) - this._techoDe(b));
    let restante = baseFiscal;
    let anterior = 0;
    let cuota = 0;
    const aplicados = [];
    for (const t of tramos) {
      const techo = this._techoDe(t);
      const tipo = Number(t.tipo);
      if (!Number.isFinite(tipo)) return { error: this._invalid('escala.tipo') };
      const tramoBase = Math.max(0, Math.min(restante, techo - anterior));
      if (tramoBase <= 0) { if (Number.isFinite(techo)) anterior = techo; continue; }
      const importeTramo = this._round(tramoBase * (tipo / 100), 2);
      cuota = this._round(cuota + importeTramo, 2);
      aplicados.push({ desde: anterior, hasta: Number.isFinite(techo) ? techo : null, tipo, base: this._round(tramoBase, 2), cuota: importeTramo });
      restante = this._round(restante - tramoBase, 2);
      anterior = Number.isFinite(techo) ? techo : anterior;
      if (restante <= 0) break;
    }
    return { cuota, tramos: aplicados };
  }

  // Techo del tramo: hasta null/ausente = tramo ABIERTO (Infinity). Nunca 0 por null.
  _techoDe(t) {
    const hasta = t && t.hasta;
    const n = Number(hasta);
    return (hasta === null || hasta === undefined || hasta === '' || !Number.isFinite(n)) ? Infinity : n;
  }

  // ── Tools ──
  toolPracticadas(params) { return this._practicadas(params); }
  toolSoportadas(params) { return this._soportadas(params); }
  toolEstimar(params) { return this._estimar(params); }
}

module.exports = RetencionesIsIrpf;
