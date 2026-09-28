/**
 * contabilidad/consulta-dueno — PUENTE STATELESS (Q1 + Q3 + Q4, hoja del plan).
 *
 * LA PUERTA *PULL*: el dueno pregunta cuando quiere y el sistema contesta. Sin
 * cadencia impuesta (≠ el cuadro del jefe J8, que SI impone cadencia y
 * agregacion). Desde donde consulta es DECLARABLE (canal = puerto).
 *
 * Tres clases en una parcela:
 *   Q1 ConsultaCuentasBajoDemanda  _responder(pregunta)->ResultadoCalculo;
 *                                  _sinCadencia()->Bool (el dueno pregunta cuando quiere).
 *   Q3 SelloCobertura              _sellarCobertura(resultado)->con sello: marca de
 *                                  completitud de lo consultado, FUERA de ciclo, para
 *                                  que el dueno sepa si falta cobertura ANTES de decidir.
 *   Q4 MarcaBorradorValidado       _derivarEstado(periodo)->EN_CURSO|REVISADO|FIRMADO:
 *                                  sello del punto en que esta lo que el dueno ve, para
 *                                  no decidir sobre un borrador vivo como si fuera definitivo.
 *
 * LA METRICA UNICA SIGUE SIENDO UNA: el sello (Q3) LEE completitud-cobertura (A12)
 * por EVENTO `contabilidad.cobertura.calcular.request` — NO recalcula "lo que
 * falta". La marca (Q4) deriva de la traza (B4, `contabilidad.traza.consultar.request`)
 * y de la firma (L3, `contabilidad.firma.delta.request`) por EVENTO.
 *
 * EL PUENTE NO JUZGA: la traduccion de la pregunta en lenguaje natural es del
 * micro-agente puente-lenguaje-dueno (Q2). Aqui `responder` acepta la consulta ya
 * estructurada (`consulta:{operacion,...}`) o un `resultado_calculo` ya calculado;
 * si solo llega texto sin traducir, se DECLARA 422 PREGUNTA_NO_TRADUCIDA y NUNCA
 * se interpreta a ciegas.
 *
 * PUENTE (patron real, stateless): SIN PosPersistencia y SIN project.activated en
 * el CODIGO — no guarda estado; reacciona a una pregunta y contesta. La
 * composicion rica se delega en informe-rico (K3) por EVENTO. Dependencia entre
 * modulos por EVENTO, NUNCA por require cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.consulta_respondida; error su par
 * determinista. Las salidas son revisables (vista-revisable, L2). NO REUTILIZA: la
 * cara pull del dueno sobre la contabilidad no existe en el inventario.
 *
 * Ver hojas Q1/Q3/Q4 del diseno-oop y bloque `consulta-dueno` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Operaciones consultables -> modulo que las calcula POR EVENTO (jamas require cruzado).
const OPERACIONES = {
  margen: { evento: 'contabilidad.margen.calcular.request', calculador: 'margen-analitico' },
  tablero: { evento: 'contabilidad.tablero.cruzar.request', calculador: 'margen-analitico' },
  resultado: { evento: 'contabilidad.estado.resultado.request', calculador: 'estados-contables' },
  balance: { evento: 'contabilidad.estado.balance.request', calculador: 'estados-contables' },
  caja: { evento: 'contabilidad.tesoreria.saldo.request', calculador: 'saldo-tesoreria' },
  prevision: { evento: 'contabilidad.tesoreria.prevision.request', calculador: 'saldo-tesoreria' },
  cobertura: { evento: 'contabilidad.cobertura.calcular.request', calculador: 'completitud-cobertura' },
  cuadro: { evento: 'contabilidad.cuadro_mando.agregar.request', calculador: 'cuadro-mando-contable' },
  desviacion: { evento: 'contabilidad.desviacion.calcular.request', calculador: 'presupuesto' }
};

// Estados posibles de la marca (Q4).
const ESTADOS = new Set(['EN_CURSO', 'REVISADO', 'FIRMADO']);

class ConsultaDueno extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'consulta-dueno';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: sin store que persistir. La consulta es pull y sin cadencia.
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onResponderRequest(e) {
    return this._atender(e, 'responder', 'contabilidad.consulta.responder.response', async (d) => {
      const res = await this._responder(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.consulta_respondida', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.consulta.responder.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (puente) ──

  // responder(pregunta) -> ResultadoCalculo (Q1). El dueno pregunta cuando quiere.
  async _responder(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const noDisponibles = [];

    // El ResultadoCalculo: ya calculado, o derivado de una consulta ESTRUCTURADA.
    let resultado = (input && (input.resultado_calculo || input.cifra || input.resultado)) || null;
    let operacion = (input && (input.operacion || (input.consulta && input.consulta.operacion))) || null;
    let calculador = null;

    if (!resultado) {
      const consulta = (input && input.consulta) || null;
      if (!consulta || !consulta.operacion) {
        // El texto en lenguaje natural NO se interpreta aqui: eso es Q2.
        return this._errorResponse(422, 'PREGUNTA_NO_TRADUCIDA',
          'la consulta no llega estructurada: la traduccion de la pregunta es de puente-lenguaje-dueno (Q2)', {
            recibe: ['consulta:{operacion,...}', 'resultado_calculo'],
            traductor: 'puente-lenguaje-dueno (Q2)',
            operaciones_posibles: Object.keys(OPERACIONES)
          });
      }
      operacion = String(consulta.operacion).toLowerCase();
      const op = OPERACIONES[operacion];
      if (!op) {
        return this._errorResponse(422, 'OPERACION_NO_CONSULTABLE',
          `operacion ${operacion} fuera del catalogo consultable`, { operaciones_posibles: Object.keys(OPERACIONES) });
      }
      calculador = op.calculador;
      const r = await this._rpc(op.evento, {
        project_id: pid,
        periodo: (input && input.periodo) || (consulta.periodo) || null,
        dimension: (input && input.dimension) || (consulta.dimension) || null,
        ...(consulta.parametros || {})
      }, { timeout_ms: 5000 });
      if (r && r.status === 200 && r.data) resultado = r.data;
      else {
        noDisponibles.push(op.calculador);
        return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
          `${op.calculador} no respondio: el dueno pregunta pero el sistema no inventa la cifra`, {
            dependencia: op.calculador, operacion, accion: 'NO_RESPONDER_INVENTANDO'
          });
      }
    }

    // Q3 — sello de cobertura: LEE la metrica unica (A12), no la recalcula.
    const selloCobertura = await this._sellarCobertura(pid, input, noDisponibles);

    // Q4 — marca del punto en que esta lo consultado (borrador/revisado/firmado).
    const marca = await this._derivarEstado(pid, input, noDisponibles);

    // Composicion rica (K3) por EVENTO si el dueno quiere el informe, no el numero pelado.
    let informe = null;
    if (input && input.con_informe === true) {
      const r = await this._rpc('contabilidad.informe.componer.request', {
        project_id: pid,
        cifra: resultado,
        periodo: (input && input.periodo) || null,
        origen: 'consulta-dueno (Q1)',
        cobertura: selloCobertura.cobertura || undefined,
        con_estado: false
      }, { timeout_ms: 5000 });
      if (r && r.status === 200 && r.data) informe = r.data.informe || null;
      else noDisponibles.push('informe-rico');
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        operacion: operacion || null,
        calculador,
        resultado_calculo: resultado,
        sello_cobertura: selloCobertura,
        marca,
        informe,
        sin_cadencia: this._sinCadencia().data.sin_cadencia,
        canal_declarable: true,
        revisable: true,
        vista_revisable_en: 'vista-revisable (L2)',
        dependencias_no_disponibles: noDisponibles,
        determinista: true,
        nota: 'puerta PULL: el dueno pregunta cuando quiere; la respuesta lleva sello de cobertura y marca borrador/revisado/firmado'
      }
    };
  }

  // sinCadencia() -> Bool (Q1). El dueno pregunta cuando quiere: ≠ cuadro del jefe J8.
  _sinCadencia() {
    return {
      status: 200,
      data: {
        sin_cadencia: true,
        impone_cadencia: false,
        distinto_de: 'cuadro-mando-contable (J8), que SI impone cadencia y agregacion',
        canal_consulta_declarable: true
      }
    };
  }

  // sellarCobertura(resultadoCalculo) -> con sello (Q3). Vista de la metrica unica.
  async _sellarCobertura(pid, input, noDisponibles) {
    let cobertura = (input && input.cobertura) || null;
    if (!cobertura) {
      const r = await this._rpc('contabilidad.cobertura.calcular.request', {
        project_id: pid, periodo: (input && input.periodo) || null
      }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) cobertura = r.data;
      else if (noDisponibles) noDisponibles.push('completitud-cobertura');
    }
    if (!cobertura) {
      return { sellado: false, sello: 'COBERTURA_NO_DISPONIBLE', cobertura: null, fuera_de_ciclo: true, es_metrica_unica: true };
    }
    const completa = (cobertura.huecos === 0) || cobertura.senal === 'COMPLETA';
    return {
      sellado: true,
      sello: completa ? 'COMPLETO' : 'INCOMPLETO',
      aviso: completa ? null : 'falta cobertura: el resultado puede estar incompleto',
      cobertura,
      fuera_de_ciclo: true,
      es_metrica_unica: true,
      recalculada_aqui: false,
      nota: 'vista de la metrica unica (A12): dice si falta cobertura ANTES de que el dueno decida'
    };
  }

  // derivarEstado(periodo) -> EN_CURSO | REVISADO | FIRMADO (Q4). Deriva de B4 + L3.
  async _derivarEstado(pid, input, noDisponibles) {
    const periodo = (input && input.periodo) || null;
    const alcance = (input && input.alcance) || periodo || (input && input.ejercicio) || null;

    // Declarado en el payload: se respeta.
    const declarado = String((input && input.estado) || '').toUpperCase();
    if (ESTADOS.has(declarado)) {
      return this._marca(declarado, periodo, 'PAYLOAD', true, false);
    }

    // L3 (flujo-firma) por EVENTO: si hay firma del asesor, el alcance esta FIRMADO.
    let firma = null;
    if (alcance) {
      const r = await this._rpc('contabilidad.firma.delta.request', { project_id: pid, alcance }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) firma = r.data;
      else if (noDisponibles) noDisponibles.push('flujo-firma');
    }
    if (firma && firma.ultima_firma) {
      return this._marca('FIRMADO', periodo, 'L3_flujo-firma', true, false);
    }
    if (firma && firma.delta && firma.delta.total_cambios === 0 && firma.desde_ultima_firma) {
      // Hubo un visto bueno previo y nada cambio desde entonces: revisado.
      return this._marca('REVISADO', periodo, 'L3_flujo-firma', true, false);
    }

    // B4 (traza-asiento) por EVENTO: la existencia de traza dice que hay algo asentado
    // (borrador vivo) — se declara como EN_CURSO salvo marca.
    if (alcance) {
      const r = await this._rpc('contabilidad.traza.consultar.request', { project_id: pid, clave_natural: alcance }, { timeout_ms: 4000 });
      if (!r || (r.status !== 200)) {
        if (noDisponibles) noDisponibles.push('traza-asiento');
      }
    }

    return this._marca('EN_CURSO', periodo, 'DERIVADO', true, false);
  }

  _marca(estado, periodo, fuente, determinista, sobreBorrador) {
    return {
      estado: ESTADOS.has(estado) ? estado : 'EN_CURSO',
      periodo: periodo || null,
      fuente,
      borrador_vivo: estado === 'EN_CURSO',
      decidir_sobre_borrador: sobreBorrador === true,
      el_sistema_no_firma: true,
      determinista,
      nota: 'marca del punto en que esta lo que el dueno ve: no decidir sobre un borrador vivo como si fuera definitivo'
    };
  }

  // ── Tools ──
  toolResponder(params) { return this._responder(params); }
  toolSinCadencia() { return this._sinCadencia(); }
}

module.exports = ConsultaDueno;
