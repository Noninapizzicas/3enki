/**
 * contabilidad/puente-lenguaje-dueno — MICRO-AGENTE (Q2, hoja del plan).
 *
 * EL REQUISITO "EN LENGUAJE LLANO" MATERIALIZADO. Traductor BIDIRECCIONAL:
 *   · traducirPregunta(preguntaNatural) -> ConsultaContable   (su pregunta → consulta contable)
 *   · traducirCifra(resultado)          -> CifraEnSuIdioma    (calculo → cifra en su idioma:
 *                                                              caja, deuda, resultado, "¿puedo pagar X?")
 *
 * EL LENGUAJE ES FUZZY: mapear "¿me da la vida?" o "¿puedo pagar la nómina?" a la
 * operacion contable correcta es JUICIO, no un lookup. La mitad determinista
 * (matching contra el VOCABULARIO DECLARADO) resuelve los casos cubiertos; el resto
 * es la mitad FUZZY del cajon de blueprint del modulo (el LLM que PROPONE la
 * traduccion cuando el vocabulario no cubre). Cuando ni el vocabulario ni el juicio
 * alcanzan confianza, NO se inventa la traduccion: se devuelve 422
 * PREGUNTA_NO_TRADUCIDA y el dueno puede precisar — jamas se contesta a ciegas.
 *
 * EL VOCABULARIO ES DECLARABLE (K8/K7 son [ABIERTO]): que "caja" signifique la
 * posicion de tesoreria y "deuda" los vencimientos por pagar lo declara el dueno;
 * hay un vocabulario BASE declarable y el declarante lo sobreescribe.
 *
 * NO CALCULA: traduce pregunta en consulta y la ENVIA a consulta-dueno (Q1) por
 * EVENTO `contabilidad.consulta.responder.request`; y traduce la cifra que le
 * devuelven. El nucleo de informe (K3) lo comparte con R3, pero el TRADUCTOR es
 * propio. Dependencia entre modulos por EVENTO, NUNCA por require cruzado.
 *
 * SI PERSISTE (justificado): su memoria es el VOCABULARIO APRENDIDO — los mapeos
 * "su palabra → operacion contable" que se han resuelto bien, para no re-traducir
 * lo ya aprendido y como EVIDENCIA revisable de como se le esta hablando al dueno
 * (requisito "que el asesor lo acepte"). Por eso lleva PosPersistencia +
 * onProjectActivated; la parcela es APRENDIZAJE del traductor, no un dato de
 * dominio. NO escribe el vocabulario declarado (K8): solo lo LEE y lo memoriza.
 *
 * Emisor/par de fallo: exito publica contabilidad.consulta.responder.request y
 * contabilidad.cifra_presentada; error su par determinista. NO REUTILIZA: el
 * puente de lenguaje del dueno no existe; comparte el nucleo de informe (K3) con
 * R3, no el traductor.
 *
 * Ver hoja Q2 del diseno-oop y bloque `puente-lenguaje-dueno` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Vocabulario BASE declarable (NO ley): palabra del dueno -> operacion contable.
// El declarante (dueno) lo sobreescribe/anade; sin vocabulario declarado esto rige.
const VOCABULARIO_BASE = {
  caja: { operacion: 'caja', etiqueta: 'dinero disponible', unidad: 'EUR' },
  'dinero': { operacion: 'caja', etiqueta: 'dinero disponible', unidad: 'EUR' },
  banco: { operacion: 'caja', etiqueta: 'dinero disponible', unidad: 'EUR' },
  resultado: { operacion: 'resultado', etiqueta: 'lo que ganas o pierdes', unidad: 'EUR' },
  ganancia: { operacion: 'resultado', etiqueta: 'lo que ganas o pierdes', unidad: 'EUR' },
  beneficio: { operacion: 'resultado', etiqueta: 'lo que ganas o pierdes', unidad: 'EUR' },
  perdida: { operacion: 'resultado', etiqueta: 'lo que ganas o pierdes', unidad: 'EUR' },
  deuda: { operacion: 'prevision', etiqueta: 'lo que tienes que pagar', unidad: 'EUR' },
  deudas: { operacion: 'prevision', etiqueta: 'lo que tienes que pagar', unidad: 'EUR' },
  pagar: { operacion: 'prevision', etiqueta: 'lo que tienes que pagar', unidad: 'EUR' },
  cobrar: { operacion: 'prevision', etiqueta: 'lo que te tienen que pagar', unidad: 'EUR' },
  margen: { operacion: 'margen', etiqueta: 'lo que te queda de cada venta', unidad: 'EUR' },
  'cuadro': { operacion: 'cuadro', etiqueta: 'el resumen de tu negocio', unidad: null },
  resumen: { operacion: 'cuadro', etiqueta: 'el resumen de tu negocio', unidad: null },
  desviacion: { operacion: 'desviacion', etiqueta: 'tu desvio sobre el objetivo', unidad: 'EUR' },
  objetivo: { operacion: 'desviacion', etiqueta: 'tu desvio sobre el objetivo', unidad: 'EUR' },
  cobertura: { operacion: 'cobertura', etiqueta: 'si falta algo por entrar', unidad: null }
};

// Umbral DECLARABLE del juicio: por debajo, la traduccion va a precision (nunca a ciegas).
const UMBRAL_JUICIO = 0.6;

class PuenteLenguajeDueno extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puente-lenguaje-dueno';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, vocabulario:{}, traducciones:[] }
    // Es APRENDIZAJE del traductor (su palabra -> operacion), no una parcela de dominio.
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'puente-lenguaje-dueno.json',
      dir: '/contabilidad/puente-lenguaje-dueno',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && (data.vocabulario || data.traducciones)) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el vocabulario aprendido del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC: pregunta natural -> consulta contable -> respuesta en su idioma ──
  onPreguntarRequest(e) {
    return this._atender(e, 'preguntar', 'contabilidad.dueno.preguntar.response', async (d) => {
      // 1. Traduce su pregunta a una consulta contable (fuzzy).
      const traduccion = this._traducirPregunta(d);
      if (traduccion.status !== 200) {
        this.eventBus?.publish('contabilidad.dueno.preguntar.failed', traduccion);
        return traduccion;
      }

      // 2. La ENVIA a consulta-dueno (Q1) por EVENTO — aqui no se calcula nada.
      const respuesta = await this._rpc('contabilidad.consulta.responder.request', {
        project_id: traduccion.data.project_id,
        consulta: traduccion.data.consulta,
        periodo: traduccion.data.consulta.periodo,
        dimension: traduccion.data.consulta.dimension,
        correlation_id: d.correlation_id
      }, { timeout_ms: 6000 });

      if (!respuesta || respuesta.status !== 200) {
        const fallo = this._errorResponse((respuesta && respuesta.status) || 503, 'DEPENDENCIA_NO_DISPONIBLE',
          'consulta-dueno (Q1) no respondio: no se traduce una cifra que no se ha calculado', {
            dependencia: 'consulta-dueno', accion: 'NO_RESPONDER_INVENTANDO'
          });
        this.eventBus?.publish('contabilidad.consulta.responder.failed', {
          ...fallo, correlation_id: d.correlation_id
        });
        return fallo;
      }

      // 3. Traduce la cifra devuelta al idioma del dueno (fuzzy).
      const enSuIdioma = this.traducirCifra({
        project_id: traduccion.data.project_id,
        resultado: respuesta.data.resultado_calculo,
        operacion: traduccion.data.consulta.operacion,
        marca: respuesta.data.marca,
        sello_cobertura: respuesta.data.sello_cobertura
      });
      if (enSuIdioma.status !== 200) {
        this.eventBus?.publish('contabilidad.dueno.preguntar.failed', enSuIdioma);
        return enSuIdioma;
      }

      this._memorizar(traduccion.data.project_id, traduccion.data, respuesta.data);

      return {
        status: 200,
        data: {
          project_id: traduccion.data.project_id,
          pregunta: traduccion.data.pregunta,
          consulta: traduccion.data.consulta,
          traduccion: traduccion.data.traduccion,
          respuesta_cruda: respuesta.data.resultado_calculo,
          cifra_en_su_idioma: enSuIdioma.data,
          sello_cobertura: respuesta.data.sello_cobertura,
          marca: respuesta.data.marca,
          lenguaje_llano: true,
          traduccion_fuzzy: true,
          propone_no_decide: true,
          determinista_en_lo_cubierto: true,
          nota: 'el puente traduce pregunta ↔ cifra; NO calcula (eso es Q1) ni juzga el dato'
        }
      };
    });
  }

  // ── handler RPC: cifra ya calculada -> cifra en su idioma ──
  onCifra_presentarRequest(e) {
    return this._atender(e, 'cifra_presentar', 'contabilidad.dueno.cifra.presentar.response', async (d) => {
      const res = this.traducirCifra(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.cifra_presentada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.dueno.cifra.presentar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas donde el vocabulario cubre; fuzzy si no) ──

  // traducirPregunta(preguntaNatural) -> ConsultaContable (Q2, FUZZY).
  _traducirPregunta(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const pregunta = input && (input.pregunta || input.texto);
    const preguntaStr = typeof pregunta === 'string' ? pregunta : null;

    // Consulta ya estructurada: se respeta (el vocabulario no hace falta).
    const estructurada = input && input.consulta;
    if (estructurada && estructurada.operacion) {
      return {
        status: 200,
        data: {
          project_id: pid, pregunta: preguntaStr, traduccion: { origen: 'DECLARADA', confianza: 1 },
          consulta: {
            operacion: estructurada.operacion, periodo: estructurada.periodo || null,
            dimension: estructurada.dimension || null, parametros: estructurada.parametros || null
          }
        }
      };
    }

    if (!preguntaStr) return this._invalid('pregunta');

    const vocab = this._vocabularioDe(pid, input);
    const normalizada = this._normalizar(preguntaStr);

    // 1. Matching contra el vocabulario (DECLARADO o aprendido): determinista.
    let mejor = null;
    let confianza = 0;
    for (const clave of Object.keys(vocab)) {
      const k = this._normalizar(clave);
      if (!k || !normalizada.includes(k)) continue;
      // La coincidencia mas larga gana (mas especifica).
      const c = Math.min(1, k.length / Math.max(1, normalizada.length) + 0.5);
      if (c > confianza || (c === confianza && mejor && k.length > mejor.clave.length)) {
        confianza = this._round(c, 2);
        mejor = { clave, entrada: vocab[clave] };
      }
    }

    // Aprendizaje previo: si ya se tradujo una pregunta identica, se reusa.
    const aprendida = this._recuerdoDe(pid, normalizada);

    if (aprendida) {
      mejor = { clave: aprendida.clave, entrada: aprendida.entrada };
      confianza = 1;
    }

    if (!mejor || confianza < UMBRAL_JUICIO) {
      // Ni el vocabulario ni el juicio alcanzan confianza: NUNCA a ciegas.
      return this._errorResponse(422, 'PREGUNTA_NO_TRADUCIDA',
        'no se pudo traducir la pregunta a una consulta contable con confianza: el dueno puede precisar', {
          pregunta: preguntaStr,
          vocabulario_declarado: Object.keys(vocab),
          umbral: UMBRAL_JUICIO,
          confianza,
          propuesta: mejor ? mejor.clave : null,
          no_a_ciegas: true,
          declarable: 'el vocabulario (Q2/K8) lo declara el dueno'
        });
    }

    const entrada = mejor.entrada || {};
    // El periodo/dimension declarados en el vocabulario o en la pregunta (payload).
    return {
      status: 200,
      data: {
        project_id: pid,
        pregunta: preguntaStr,
        traduccion: {
          origen: aprendida ? 'APRENDIZAJE' : 'VOCABULARIO',
          clave: mejor.clave,
          confianza,
          fuzzy: true,
          propone_no_decide: true
        },
        consulta: {
          operacion: entrada.operacion,
          etiqueta: entrada.etiqueta || null,
          unidad: entrada.unidad || 'EUR',
          periodo: (input && input.periodo) || (entrada.periodo) || null,
          dimension: (input && input.dimension) || (entrada.dimension) || null,
          parametros: entrada.parametros || null
        }
      }
    };
  }

  // traducirCifra(resultado) -> CifraEnSuIdioma (Q2, FUZZY). Su idioma, no jerga contable.
  traducirCifra(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const resultado = (input && (input.resultado || input.resultado_calculo || input.cifra)) || null;
    if (!resultado || typeof resultado !== 'object') return this._invalid('resultado');

    const operacion = String((input && input.operacion) || this._operacionDeResultado(resultado) || '').toLowerCase();
    const vocab = this._vocabularioDe(pid, input);
    // La etiqueta en su idioma: la del vocabulario que apunta a esa operacion, o un mapa base.
    const entrada = this._entradaPorOperacion(vocab, operacion);

    const valor = this._valorPlano(resultado);
    const etiqueta = (entrada && entrada.etiqueta) || this._ETIQUETA_IDIOMA[operacion] || 'la cifra';
    const unidad = (entrada && entrada.unidad) || resultado.unidad || 'EUR';

    return {
      status: 200,
      data: {
        project_id: pid,
        operacion: operacion || null,
        cifra_en_su_idioma: {
          que_es: etiqueta,
          cuanto: valor,
          como_se_dice: this._frase(etiqueta, valor, unidad),
          unidad,
          detalle_tecnico_disponible: true
        },
        sello_cobertura: (input && input.sello_cobertura) || null,
        marca: (input && input.marca) || null,
        lenguaje_llano: true,
        fuzzy: true,
        no_jerga: true,
        determinista_en_lo_cubierto: !!entrada,
        nota: 'la cifra se dice en su idioma (caja, deuda, resultado, "puedo pagar"); el detalle contable queda disponible'
      }
    };
  }

  // ── helpers internos ──

  _vocabularioDe(pid, input) {
    // 1. Payload (declarado en la peticion).
    const declarado = input && (input.vocabulario || input.vocabulario_dueno);
    const base = { ...VOCABULARIO_BASE };
    // 2. Vocabulario aprendido del proyecto.
    const d = this._store.get(pid);
    const aprendido = (d && d.vocabulario) ? d.vocabulario : {};
    return { ...base, ...aprendido, ...(declarado && typeof declarado === 'object' ? declarado : {}) };
  }

  _entradaPorOperacion(vocab, operacion) {
    if (!operacion) return null;
    for (const clave of Object.keys(vocab)) {
      const e = vocab[clave];
      if (e && String(e.operacion).toLowerCase() === operacion) return e;
    }
    return null;
  }

  _operacionDeResultado(resultado) {
    if (!resultado || typeof resultado !== 'object') return null;
    if (resultado.operacion) return resultado.operacion;
    if (resultado.cuadro) return 'cuadro';
    if (resultado.margen) return 'margen';
    if (resultado.posicion_real || resultado.total !== undefined && resultado.n_cuentas !== undefined) return 'caja';
    if (resultado.resultado) return 'resultado';
    if (resultado.caja_proyectada || resultado.caja_final !== undefined) return 'prevision';
    if (resultado.tasa !== undefined && resultado.huecos !== undefined) return 'cobertura';
    if (resultado.desviacion !== undefined) return 'desviacion';
    return null;
  }

  _valorPlano(resultado) {
    if (!resultado || typeof resultado !== 'object') return resultado;
    if (resultado.total !== undefined) return resultado.total;
    if (resultado.caja_final !== undefined) return resultado.caja_final;
    if (resultado.resultado && typeof resultado.resultado === 'object') return resultado.resultado.resultado;
    if (resultado.resultado !== undefined) return resultado.resultado;
    if (resultado.margen && typeof resultado.margen === 'object') return resultado.margen.margen;
    if (resultado.margen !== undefined) return resultado.margen;
    if (resultado.desviacion !== undefined) return resultado.desviacion;
    if (resultado.tasa !== undefined) return resultado.tasa;
    return null;
  }

  _frase(etiqueta, valor, unidad) {
    if (valor === null || valor === undefined) return `No hay cifra disponible para ${etiqueta}.`;
    const n = Number(valor);
    const num = Number.isFinite(n) ? n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(valor);
    const u = unidad && unidad !== null ? ` ${unidad}` : '';
    return `${etiqueta.charAt(0).toUpperCase()}${etiqueta.slice(1)}: ${num}${u}.`;
  }

  _normalizar(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // sin tildes
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _recuerdoDe(pid, normalizada) {
    const d = this._store.get(pid);
    if (!d || !Array.isArray(d.traducciones)) return null;
    const hit = d.traducciones.find((t) => t && t.pregunta_norm === normalizada);
    return hit ? { clave: hit.clave, entrada: hit.entrada } : null;
  }

  _memorizar(pid, traduccion, respuesta) {
    if (!pid) return;
    const d = this._store.get(pid) || { esquema: 'puente-lenguaje-dueno-v1', vocabulario: {}, traducciones: [] };
    const clave = traduccion.traduccion && traduccion.traduccion.clave;
    const preguntaNorm = this._normalizar(traduccion.pregunta || '');
    if (clave && preguntaNorm) {
      d.vocabulario[clave] = d.vocabulario[clave] || (traduccion.consulta && {
        operacion: traduccion.consulta.operacion,
        etiqueta: traduccion.consulta.etiqueta,
        unidad: traduccion.consulta.unidad
      }) || null;
      d.traducciones.push({
        pregunta_norm: preguntaNorm,
        clave,
        entrada: d.vocabulario[clave],
        operacion: traduccion.consulta && traduccion.consulta.operacion,
        resuelta: !!(respuesta && respuesta.resultado_calculo),
        en: new Date().toISOString()
      });
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
  }

  // ── Tools ──
  toolTraducirPregunta(params) { return this._traducirPregunta(params); }
  toolTraducirCifra(params) { return this.traducirCifra(params); }
}

// Mapa base de etiquetas en lenguaje llano (declarable: el vocabulario lo sobreescribe).
PuenteLenguajeDueno.prototype._ETIQUETA_IDIOMA = {
  caja: 'el dinero que tienes',
  prevision: 'lo que puedes pagar o te tienen que pagar',
  resultado: 'lo que ganas o pierdes',
  margen: 'lo que te queda de cada venta',
  cuadro: 'el resumen de tu negocio',
  desviacion: 'tu desvio sobre el objetivo',
  cobertura: 'si falta algo por entrar'
};

module.exports = PuenteLenguajeDueno;
