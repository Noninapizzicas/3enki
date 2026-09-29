/**
 * contabilidad-analitica/consulta-cuentas-bajo-demanda — PUENTE STATELESS (Q1, hoja del plan).
 *
 * LA PUERTA *PULL*: la pregunta del dueno, cuando el quiera. Conecta su pregunta con el calculo
 * POR PETICION — NO impone cadencia (distinto del cuadro del jefe J8, que si la impone).
 *
 * ATRIBUTOS del diseno: `fuente:ParametroDeclarable`.
 *   METODOS: preguntar(q:Consulta):Respuesta.
 *   REGLA: puerta *pull*: conecta la pregunta del dueno con el calculo por peticion. NO impone cadencia.
 *
 * Invariantes:
 *  - CONSULTA, NO DECIDE: enruta la pregunta a la pieza que ya calcula ese dato POR EVENTO y
 *    devuelve su respuesta. No interpreta, no juzga, no decide nada por el dueno.
 *  - LA FUENTE ES DECLARABLE: el mapa pregunta→fuente es `ParametroDeclarable`; sin fuente
 *    declarada para esa pregunta NO se inventa el calculo — se declara `[ABIERTO]`.
 *  - NO RECALCULA: no duplica la aritmetica de las piezas; su oficio es ENRUTAR, no computar.
 *  - Dato ausente = desconocido: si la fuente no responde, la respuesta es `null` con lo que falta.
 *  - Sin estado: un puente. No recuerda preguntas ni respuestas.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja Q1 del plan-construccion y diseno-oop.md (CLASE ConsultaCuentasBajoDemanda).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Mapa pregunta → FUENTE que la calcula (por EVENTO). `fuente` es ParametroDeclarable: esto solo
// fija la IDENTIDAD de cada pregunta conocida, no criterio de negocio.
const FUENTES = {
  saldo: { evento: 'mayor-balanza.saldos.request', dueno: 'mayor-balanza', campo: 'saldos' },
  balanza: { evento: 'mayor-balanza.balanza.request', dueno: 'mayor-balanza', campo: 'balanza' },
  resultado: { evento: 'cuenta-resultados.calcular.request', dueno: 'cuenta-resultados', campo: 'resultado' },
  caja: { evento: 'saldo-tesoreria.calcular.request', dueno: 'saldo-tesoreria', campo: 'saldo_total' },
  margen: { evento: 'margen-analitico.calcular.request', dueno: 'margen-analitico', campo: 'margen_total' },
  proveedor: { evento: 'estado-cuenta-proveedor.calcular.request', dueno: 'estado-cuenta-proveedor', campo: 'saldo' }
};

class ConsultaCuentasBajoDemanda extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'consulta-cuentas-bajo-demanda';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onPreguntarRequest(e) {
    return this._atender(e, 'preguntar', 'consulta-cuentas-bajo-demanda.preguntar.response', async (d) => {
      const res = await this._preguntar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: hay respuesta a la pregunta del dueno (puerta pull).
        this.eventBus?.publish('contabilidad.respuesta_consulta', {
          project_id: res.data.project_id,
          pregunta: res.data.pregunta,
          fuente: res.data.fuente,
          respuesta: res.data.respuesta,
          disponible: res.data.disponible,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('consulta-cuentas-bajo-demanda.preguntar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion: preguntar(q:Consulta) → Respuesta (enruta; no decide, no recalcula) ──
  async _preguntar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La PREGUNTA: su TEMA declarado (o el texto). Sin tema NO se elige una fuente.
    const pregunta = input.pregunta && typeof input.pregunta === 'object' ? input.pregunta : { tema: input.tema, texto: input.texto };
    const tema = this._tema(input, pregunta);

    if (!tema) {
      return {
        status: 200,
        data: {
          project_id: pid,
          pregunta,
          tema: null,
          fuente: null,
          respuesta: null,
          disponible: false,
          abierto: true,
          faltan: ['tema'],
          motivo: 'no se enruta la pregunta: falta declarar su tema (saldo|balanza|resultado|caja|margen|proveedor) — el puente no adivina que se pregunta'
        }
      };
    }

    const f = this._fuente(tema, input);
    if (!f) {
      return {
        status: 200,
        data: {
          project_id: pid,
          pregunta,
          tema,
          fuente: null,
          respuesta: null,
          disponible: false,
          abierto: true,
          faltan: ['fuente'],
          motivo: `no hay fuente declarada para la pregunta '${tema}': la fuente es ParametroDeclarable y no se inventa el calculo`
        }
      };
    }

    // LA PUERTA *PULL*: se consulta la pieza que ya calcula ese dato POR EVENTO. Aqui nada se computa.
    const r = await this._rpc(f.evento, {
      project_id: pid,
      cuenta: input.cuenta,
      periodo: input.periodo,
      ejercicio: input.ejercicio != null ? input.ejercicio : input.periodo,
      desde: input.desde,
      hasta: input.hasta,
      dimension: input.dimension,
      eje: input.eje
    }, { timeout_ms: 5000 }).catch(() => null);

    const data = r && r.data ? r.data : null;
    if (!data) {
      return {
        status: 200,
        data: {
          project_id: pid,
          pregunta,
          tema,
          fuente: f.dueno,
          evento_fuente: f.evento,
          respuesta: null,
          disponible: false,
          // La puerta es PULL y CONSULTA: no decide nada por el dueno.
          impone_cadencia: false,
          decide: false,
          abierto: true,
          faltan: [f.dueno],
          motivo: `la fuente ${f.dueno} no respondio a la pregunta (el puente NO recalcula: se declara el hueco)`
        }
      };
    }

    // La respuesta es la de la FUENTE, con su dato. No se interpreta ni se re-formula aqui
    // (el lenguaje llano lo hace puente-lenguaje-dueno Q2); la puerta solo CONECTA.
    return {
      status: 200,
      data: {
        project_id: pid,
        pregunta,
        tema,
        fuente: f.dueno,
        evento_fuente: f.evento,
        campo: f.campo,
        respuesta: data,
        valor: data[f.campo] !== undefined ? data[f.campo] : null,
        disponible: true,
        // La puerta es PULL: la pide el dueno cuando quiere. Cero cadencia impuesta.
        cadencia: null,
        impone_cadencia: false,
        decide: false,
        abierto: { respuesta: null }
      }
    };
  }

  _tema(input, pregunta = {}) {
    const raw = input.tema != null ? input.tema
      : (pregunta.tema != null ? pregunta.tema : null);
    if (raw === undefined || raw === null || raw === '') return null;
    return String(raw).toLowerCase().trim();
  }

  // La fuente: declarada en la peticion (ParametroDeclarable) o la del mapa de temas conocidos.
  _fuente(tema, input = {}) {
    if (input.fuente && typeof input.fuente === 'object' && input.fuente.evento) {
      return { evento: String(input.fuente.evento), dueno: input.fuente.dueno != null ? String(input.fuente.dueno) : null, campo: input.fuente.campo != null ? String(input.fuente.campo) : null };
    }
    const f = FUENTES[tema];
    return f ? { evento: f.evento, dueno: f.dueno, campo: f.campo } : null;
  }

  // ── Tools ──
  toolPreguntar(params) { return this._preguntar(params); }
}

module.exports = ConsultaCuentasBajoDemanda;
