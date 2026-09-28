/**
 * contabilidad/informe-accionable — MICRO-AGENTE (R2 + R3, hoja del plan).
 *
 * EL "QUE HACER" Y LA NARRACION. Todo informe que recibe el cliente lleva QUE
 * HACER con el (R2) y los estados van NARRADOS a su lenguaje (R3). Es la otra
 * mitad de la composicion: informe-rico (K3) COMPONE la cifra + el contexto, aqui
 * se le anade el JUICIO — la recomendacion y la narracion.
 *
 *   R2 InformeAccionable   recomendar(informe) -> InformeAccionable   ("que hacer" con el)
 *   R3 NarradorEstados     narrar(estados)     -> Narracion           ("esto es lo que te
 *                                                                      ha pasado y lo que viene")
 *
 * INVARIANTE DURA: EL SISTEMA NO DECIDE POR EL DUENO. Aqui se PROPONE que hacer;
 * decidir es del dueno. Cada recomendacion viaja con `propone_no_decide:true` y
 * `el_dueno_decide:true` — nunca se ejecuta nada ni se cierra nada por cuenta
 * propia. Lo que el informe-accionable PROPONE se puede, ademas, ENTREGAR al
 * negocio por el puente aviso-al-negocio (R1) — proponer y hacer llegar, sin
 * decidir.
 *
 * EL JUICIO ES FUZZY: que recomendar ante una desviacion, una cobertura incompleta
 * o un periodo en borrador es interpretacion, no un lookup — por eso vive en el
 * cajon de blueprint del modulo (el LLM), sobre las SEÑALES DURAS que el informe ya
 * trae. La mitad determinista deriva las señales (desviacion excedida, huecos de
 * cobertura, marca de borrador); la fuzzy las convierte en "que hacer".
 *
 * LA METRICA UNICA SIGUE SIENDO UNA: si la recomendacion depende de la cobertura,
 * la LEE del informe (que a su vez la leyo de A12) — no la recalcula. La narracion
 * (R3) toma balance (C1) y resultado (C2) de estados-contables por EVENTO, o de
 * `estados` en el payload; NUNCA recompone los estados.
 *
 * SI PERSISTE (justificado): su memoria es la de las RECOMENDACIONES PROPUESTAS y
 * las NARRACIONES emitidas — evita repetir la misma recomendacion sin novedad y es
 * la EVIDENCIA revisable de que se le propuso al dueno (requisito "que el asesor lo
 * acepte y pueda presentarlo"). Por eso lleva PosPersistencia + onProjectActivated.
 * NO escribe el juicio como regla: solo registra lo propuesto; el dueno decide.
 *
 * MICRO-AGENTE (patron hibrido real): mitad REFLEJO determinista (derivar señales
 * duras del informe y componer la narracion base) + mitad FUZZY (la recomendacion y
 * el fraseo) en el cajon de blueprint. Dependencia entre modulos por EVENTO, NUNCA
 * por require cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.informe_accionable ·
 * contabilidad.estados_narrados; error su par determinista. NO REUTILIZA: la
 * recomendacion accionable y la narracion de estados son juicio (fuzzy) propio de la
 * vertical.
 *
 * Ver hojas R2/R3 del diseno-oop y bloque `informe-accionable` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Señales DURAS que el informe ya trae y de las que sale el "que hacer" (declarables).
const SENALES = ['DESVIACION_EXCEDIDA', 'COBERTURA_INCOMPLETA', 'PERIODO_EN_BORRADOR', 'RESULTADO_NEGATIVO', 'SIN_OBJETIVO_DECLARADO'];

// Umbral de cobertura por debajo del cual se declara incompleta (declarable).
const UMBRAL_COBERTURA = 1;

class InformeAccionable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'informe-accionable';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, recomendaciones: [], narraciones: [] }
    // Es la memoria de lo PROPuesto (evita repetir sin novedad) y la EVIDENCIA
    // revisable de que se le propuso al dueno — no una regla que decida por el.
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'informe-accionable.json',
      dir: '/contabilidad/informe-accionable',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && (data.recomendaciones || data.narraciones)) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la memoria de lo propuesto del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC: el "que hacer" (R2) ──
  onInforme_accionableRequest(e) {
    return this._atender(e, 'informe_accionable', 'contabilidad.informe.accionable.response', async (d) => {
      const res = await this._recomendar(d);
      if (res.status === 200) {
        this._memorizarRecomendacion(d.project_id, res.data);
        this.eventBus?.publish('contabilidad.informe_accionable', {
          ...res.data,
          correlation_id: d.correlation_id
        });
        // Entregar al negocio (R1) por EVENTO si se pide: proponer y hacer llegar, sin decidir.
        if (d && d.entregar === true) await this._entregarAlNegocio(d, res.data);
      } else {
        this.eventBus?.publish('contabilidad.informe.accionable.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC: la narracion de estados (R3) ──
  onEstados_narrarRequest(e) {
    return this._atender(e, 'estados_narrar', 'contabilidad.estados.narrar.response', async (d) => {
      const res = await this._narrar(d);
      if (res.status === 200) {
        this._memorizarNarracion(d.project_id, res.data);
        this.eventBus?.publish('contabilidad.estados_narrados', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.estados.narrar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones ──

  // recomendar(informe) -> InformeAccionable (R2, FUZZY). PROPONE, NO DECIDE.
  async _recomendar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // El informe (K3): en payload o COMPUESTO por EVENTO (no se recalcula la cifra).
    let informe = (input && (input.informe || input.informe_rico)) || null;
    if (!informe) {
      const r = await this._rpc('contabilidad.informe.componer.request', {
        project_id: pid,
        cifra: (input && (input.cifra || input.resultado_calculo)) || null,
        periodo: (input && input.periodo) || null,
        origen: 'informe-accionable (R2)'
      }, { timeout_ms: 5000 });
      if (r && r.status === 200 && r.data) informe = r.data.informe || r.data;
    }
    if (!informe || typeof informe !== 'object') {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'no hay informe rico (K3) ni cifra: no se propone que hacer sobre la nada', {
          dependencia: 'informe-rico', accion: 'NO_RECOMENDAR_INVENTANDO'
        });
    }

    // Señales DURAS derivadas del informe (mitad determinista).
    const senales = this._derivarSenales(informe);

    // El "que hacer" (mitad fuzzy): una accion PROPUESTA por señal.
    const acciones = this._accionesDe(senales, informe);

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: (informe.contexto && informe.contexto.periodo) || (input && input.periodo) || null,
        informe,
        senales,
        acciones,
        n_acciones: acciones.length,
        // EL SISTEMA NO DECIDE POR EL DUENO: propone.
        propone_no_decide: true,
        el_dueno_decide: true,
        el_sistema_no_decide: true,
        fuzzy: true,
        // La cobertura NO se recalcula: se LEE del informe (que la leyo de A12).
        cobertura_recalculada_aqui: false,
        nota: 'el sistema PROPONE que hacer; decidir es del dueno'
      }
    };
  }

  // narrar(estados) -> Narracion "esto es lo que te ha pasado y lo que viene" (R3, FUZZY).
  async _narrar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const noDisponibles = [];

    // Los estados (C1/C2) en payload o LEIDOS de estados-contables por EVENTO.
    let balance = (input && input.balance) || null;
    let resultado = (input && (input.resultado || input.cuenta_resultados)) || null;

    if (!balance && input && input.con_balance !== false) {
      const r = await this._rpc('contabilidad.estado.balance.request', { project_id: pid, periodo: (input && input.periodo) || null }, { timeout_ms: 5000 });
      if (r && r.status === 200 && r.data) balance = r.data;
      else noDisponibles.push('estados-contables (C1)');
    }
    if (!resultado && input && input.con_resultado !== false) {
      const r = await this._rpc('contabilidad.estado.resultado.request', { project_id: pid, periodo: (input && input.periodo) || null }, { timeout_ms: 5000 });
      if (r && r.status === 200 && r.data) resultado = r.data;
      else noDisponibles.push('estados-contables (C2)');
    }

    if (!balance && !resultado) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'no hay estados (C1/C2) ni en el payload: no se narra lo que no se ha derivado', {
          dependencia: 'estados-contables', accion: 'NO_NARRAR_INVENTANDO'
        });
    }

    // Mitad determinista: los hechos narrables de los estados.
    const hechos = this._hechosDeEstados(balance, resultado);

    // Mitad fuzzy: el fraseo "esto es lo que te ha pasado y lo que viene".
    const pasado = this._pasado(hechos);
    const viene = this._viene(hechos, input);

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: (input && input.periodo) || null,
        narracion: {
          pasado,
          viene,
          hechos,
          en_su_lenguaje: true
        },
        texto: `${pasado} ${viene}`.trim(),
        compartes_nucleo_k3: true,
        traduccion_fuzzy: true,
        no_jerga: true,
        estados_recalculados_aqui: false,
        dependencias_no_disponibles: noDisponibles,
        nota: 'narra balance/resultado al lenguaje del negocio: comparte el nucleo de informe (K3) con Q2, no el traductor'
      }
    };
  }

  // ── señales duras (deterministas) → acciones propuestas (fuzzy) ──

  _derivarSenales(informe) {
    const c = informe.contexto || {};
    const senales = [];

    const dev = (informe.cifra && informe.cifra.detalle && informe.cifra.detalle.desviacion) || null;
    if (dev && (dev.excede === true)) senales.push({ senal: 'DESVIACION_EXCEDIDA', detalle: { desviacion: dev.desviacion, umbral: dev.umbral } });
    if (dev && dev.umbral_declarado === false) senales.push({ senal: 'SIN_OBJETIVO_DECLARADO', detalle: { motivo: 'no hay umbral declarado' } });

    const cob = c.cobertura || null;
    if (cob && ((cob.tasa !== null && cob.tasa < UMBRAL_COBERTURA) || (cob.huecos !== null && cob.huecos > 0))) {
      senales.push({ senal: 'COBERTURA_INCOMPLETA', detalle: { tasa: cob.tasa, huecos: cob.huecos, senal: cob.senal } });
    }

    const ep = c.estado_periodo || null;
    if (ep && (ep.estado === 'EN_CURSO' || ep.estado === 'ABIERTO')) {
      senales.push({ senal: 'PERIODO_EN_BORRADOR', detalle: { estado: ep.estado } });
    }

    const res = (informe.cifra && informe.cifra.detalle && informe.cifra.detalle.resultado);
    const nRes = Number(typeof res === 'object' ? (res && res.resultado) : res);
    if (Number.isFinite(nRes) && nRes < 0) senales.push({ senal: 'RESULTADO_NEGATIVO', detalle: { resultado: nRes } });

    return senales;
  }

  _accionesDe(senales, informe) {
    const acciones = [];
    for (const s of senales) {
      const base = { senal: s.senal, detalle: s.detalle, propone_no_decide: true, el_dueno_decide: true };
      switch (s.senal) {
        case 'DESVIACION_EXCEDIDA':
          acciones.push({ ...base, hacer: 'Revisa la desviacion: se ha salido del umbral que fijaste', prioridad: 'ALTA' });
          break;
        case 'COBERTURA_INCOMPLETA':
          acciones.push({ ...base, hacer: 'Hay hechos que no han entrado: pide a la fuente que los publique (el hueco queda declarado)', prioridad: 'ALTA' });
          break;
        case 'PERIODO_EN_BORRADOR':
          acciones.push({ ...base, hacer: 'El periodo esta en borrador: pide al asesor que lo revise y firme antes de decidir sobre el', prioridad: 'NORMAL' });
          break;
        case 'RESULTADO_NEGATIVO':
          acciones.push({ ...base, hacer: 'El resultado es negativo: mira que linea pierde margen antes de tomar decisiones', prioridad: 'NORMAL' });
          break;
        case 'SIN_OBJETIVO_DECLARADO':
          acciones.push({ ...base, hacer: 'No has fijado objetivo/umbral para este periodo: declara uno para poder medir la desviacion', prioridad: 'BAJA' });
          break;
        default:
          acciones.push({ ...base, hacer: 'Revisa la senal detectada', prioridad: 'BAJA' });
      }
    }
    if (acciones.length === 0) {
      acciones.push({
        senal: null, hacer: 'Sin senales que exijan accion: la cifra esta dentro de lo esperado', prioridad: 'BAJA',
        propone_no_decide: true, el_dueno_decide: true, sin_novedad: true
      });
    }
    return acciones;
  }

  _hechosDeEstados(balance, resultado) {
    const hechos = {};
    if (balance) {
      const b = balance.balance || balance;
      hechos.activo = b && b.activo ? b.activo.total : null;
      hechos.pasivo = b && b.pasivo ? b.pasivo.total : null;
      hechos.patrimonio = b && b.patrimonio ? b.patrimonio.total : null;
      hechos.cuadra = balance.cuadra !== undefined ? balance.cuadra : null;
    }
    if (resultado) {
      const r = resultado.resultado || resultado;
      hechos.ingresos = r && r.ingresos ? r.ingresos.total : null;
      hechos.gastos = r && r.gastos ? r.gastos.total : null;
      hechos.resultado = r && r.resultado !== undefined ? r.resultado : null;
    }
    return hechos;
  }

  _pasado(hechos) {
    const partes = [];
    if (hechos.ingresos !== null && hechos.ingresos !== undefined) partes.push(`has ingresado ${this._euros(hechos.ingresos)}`);
    if (hechos.gastos !== null && hechos.gastos !== undefined) partes.push(`has gastado ${this._euros(hechos.gastos)}`);
    if (hechos.resultado !== null && hechos.resultado !== undefined) {
      const verbo = Number(hechos.resultado) >= 0 ? 'has ganado' : 'has perdido';
      partes.push(`${verbo} ${this._euros(Math.abs(Number(hechos.resultado)))}`);
    }
    if (partes.length === 0) return 'En este periodo no hay cifras de actividad que contarte.';
    return `Esto es lo que te ha pasado: ${partes.join(', ')}.`;
  }

  _viene(hechos, input) {
    const partes = [];
    if (hechos.cuadra === false) partes.push('el balance no cuadra todavia: hay que revisarlo antes de presentar nada');
    const marcaPendiente = !!(input && input.marca && (input.marca.estado === 'EN_CURSO'));
    if (marcaPendiente) partes.push('el periodo sigue en borrador: lo que viene es que el asesor lo revise y lo firme');
    if (partes.length === 0) partes.push('lo que viene es el cierre del periodo cuando toque');
    return `Y lo que viene: ${partes.join(', ')}.`;
  }

  _euros(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }

  // Entregar la recomendacion al negocio (R1) por EVENTO: proponer y hacer llegar.
  async _entregarAlNegocio(d, data) {
    const aviso = await this._rpc('contabilidad.aviso.enrutar.request', {
      project_id: d.project_id,
      aviso: {
        id: `${d.project_id}-R2-${Date.now()}`,
        project_id: d.project_id,
        tipo: 'AVISO_ACCIONABLE',
        texto: (data.acciones[0] && data.acciones[0].hacer) || 'hay algo que revisar',
        motivo: 'informe accionable',
        familia: 'ANALITICA',
        destinatario: 'DUENO',
        cola_destino: 'DUENO',
        prioridad: (data.acciones[0] && data.acciones[0].prioridad) || 'NORMAL',
        canal: 'PANEL'
      },
      destinatario: 'DUENO',
      correlation_id: d.correlation_id
    }, { timeout_ms: 4000 });

    if (!aviso || aviso.status !== 200) {
      this.eventBus?.publish('contabilidad.aviso.enrutar.failed', {
        status: (aviso && aviso.status) || 503,
        error: { code: 'DEPENDENCIA_NO_DISPONIBLE', message: 'aviso-al-negocio (R1) no confirmo la entrega de la recomendacion' },
        correlation_id: d.correlation_id
      });
      return null;
    }
    return aviso;
  }

  // ── memoria (evita repetir sin novedad; evidencia revisable) ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-informe-accionable-v1', recomendaciones: [], narraciones: [] };
      this._store.set(pid, d);
    }
    return d;
  }

  _memorizarRecomendacion(pid, data) {
    if (!pid || !data) return;
    const d = this._obtenerOCrear(pid);
    d.recomendaciones.push({
      periodo: data.periodo || null,
      senales: (data.senales || []).map((s) => s.senal),
      acciones: (data.acciones || []).map((a) => a.hacer),
      propone_no_decide: true,
      en: new Date().toISOString()
    });
    this._persist.marcarDirty(pid);
  }

  _memorizarNarracion(pid, data) {
    if (!pid || !data) return;
    const d = this._obtenerOCrear(pid);
    d.narraciones.push({ periodo: data.periodo || null, texto: data.texto || null, en: new Date().toISOString() });
    this._persist.marcarDirty(pid);
  }

  // ── Tools ──
  toolRecomendar(params) { return this._recomendar(params); }
  toolNarrar(params) { return this._narrar(params); }
}

module.exports = InformeAccionable;
