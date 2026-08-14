/**
 * reloj — micro-agente (reflejo, sin estado) del ciclo semanal del radar.
 *
 * Contrato (plan-construccion.md HOJA 7):
 *   entrada = reloj.ciclo.iniciar.request { project_id, para?, correlation_id? }
 *             (lo dispara scheduler — job cron semanal — o la interfaz del dueño)
 *   salida  = reloj.ciclo_iniciado · reloj.ciclo_completado
 *             reloj.ciclo_semana_vacia (M5: avisa y NO envía)
 *             reloj.ciclo_abortado (par de fallo; lo ya escrito —veredictos, borrador— se conserva)
 *   orquesta = sonda.recolectar → banco.anadir { señales } → evaluador.evaluar por
 *              candidato → _priorizar (M4, proyección interna) → _elegir 1 único (M1) →
 *              banco.seleccionar → redactor.redactar → cartero.verificar →
 *              cartero.enviar → banco.publicar → ciclo_completado
 *   no hace = NO guarda estado (vive en los custodios); NO requiere a ningún módulo
 *             (solo _rpc por el bus); NO redacta (eso es el redactor); NO decide el
 *             contenido (M11: el dueño confirma vía interfaz).
 *
 * FORMA: reflejo puro sin store ni persistencia. La regla M4 vive como proyección
 * interna _priorizar (jamás en _shared) — espejo de la _prioridadLocal del banco
 * (5 líneas, duplicación deliberada entre islas; cero lógica compartida).
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const ESTADO_DISPONIBLE = 'disponible';

class RelojReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'reloj';
    this.version = 'reflejo-0.1.0';
  }

  // ── Handler RPC ──
  onCicloIniciarRequest(e) {
    return this._atender(e, 'ciclo.iniciar', 'reloj.ciclo.iniciar.response', (d) => this._ciclo(d));
  }

  // ── Proyección principal: el ciclo (flujo 7.1 del plan) ──
  async _ciclo(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');
    const corr = input.correlation_id || null;

    // 1. Cosecha: si no hay fuentes registradas, nada que cosechar (determinista —
    //    no se delega al cajón LLM para el caso vacío). Con fuentes, sonda → señales.
    const fuentes = await this._rpc('sonda.fuentes.listar.request', { project_id: pid, correlation_id: corr }, { timeout_ms: 10000 });
    const sinFuentes = !fuentes || fuentes.status !== 200 || !(fuentes.data && fuentes.data.fuentes) || fuentes.data.fuentes.length === 0;
    let señales = [];
    if (!sinFuentes) {
      const sonda = await this._rpc('sonda.recolectar.request', { project_id: pid, correlation_id: corr }, { timeout_ms: 600000 });
      if (!sonda || sonda.status !== 200) return this._abortar(pid, corr, 'sonda.recolectar', 'sin_señales_o_sonda_no_disponible');
      señales = sonda.data && (sonda.data.senales || sonda.data.señales) || [];
    }
    this._publicarEvento('reloj.ciclo_iniciado', { project_id: pid, senales: señales.length, ts: new Date().toISOString() });

    // 2. Ingesta: banco.anadir { señales } (dedupe fuente+url, tope 100 → rotación M6).
    let añadidos = [];
    if (señales.length > 0) {
      const banco = await this._rpc('banco.anadir.request', { project_id: pid, señales, correlation_id: corr });
      if (!banco || (banco.status !== 200 && banco.status !== 201)) return this._abortar(pid, corr, 'banco.anadir', 'ingesta_fallida');
      añadidos = banco.data && banco.data.añadidos || [];
    }

    // 3. Dictamen: evaluador.evaluar por candidato NUEVO; el banco aplica el estado
    //    al consumir evaluador.veredicto_emitido (APROBADO / EN_OBSERVACION). Un
    //    veredicto FALTA_EVIDENCIA NO es fallo: el banco aparca (M10) y el ciclo sigue.
    for (const c of añadidos) {
      const ev = await this._rpc('evaluador.evaluar.request', { project_id: pid, candidatoId: c.id, correlation_id: corr });
      if (!ev || ev.status !== 200) return this._abortar(pid, corr, 'evaluador.evaluar', `candidato_${c.id}`);
    }

    // 4. Elegibles: releer el banco — solo APROBADO puede ser seleccionado (M1).
    const lista = await this._rpc('banco.listar.request', { project_id: pid, estado: 'APROBADO', correlation_id: corr });
    if (!lista || lista.status !== 200) return this._abortar(pid, corr, 'banco.listar', 'sin_respuesta');
    const aprobados = lista.data && lista.data.candidatos || [];

    // 5. Priorización interna (M4) + elección única (M1). Sin elegibles → semana vacía.
    const elegido = this._elegir(this._priorizar(aprobados));
    if (!elegido) {
      return this._manejarSemanaVacia(pid, corr, añadidos.length > 0 ? 'todas_sin_evidencia' : 'banco_sin_elegibles');
    }

    // 6. Selección formal en el banco (APROBADO → SELECCIONADO).
    const sel = await this._rpc('banco.seleccionar.request', { project_id: pid, id: elegido.id, correlation_id: corr });
    if (!sel || sel.status !== 200) {
      return this._abortar(pid, corr, 'banco.seleccionar', sel && sel.error ? sel.error.message : 'sin_respuesta');
    }

    // 7. Redacción: cajón del redactor → borrador persistido (redactor.borrador_listo).
    //    Si aborta aquí, el borrador ya quedó conservado → reintento el siguiente ciclo.
    const red = await this._rpc('redactor.redactar.request', { project_id: pid, candidatoId: elegido.id, correlation_id: corr }, { timeout_ms: 60000 });
    if (!red || red.status !== 200 || !red.data || !red.data.borrador) {
      return this._abortar(pid, corr, 'redactor.redactar', 'sin_borrador');
    }

    // 8. Canal: cartero.verificar — cualquier estado ≠ disponible aborta (canal caído);
    //    el borrador queda conservado para el siguiente ciclo.
    const ver = await this._rpc('cartero.verificar.request', { project_id: pid, correlation_id: corr }, { timeout_ms: 20000 });
    const estado = ver && ver.data && ver.data.estado;
    if (!ver || ver.status !== 200 || estado !== ESTADO_DISPONIBLE) {
      return this._abortar(pid, corr, 'cartero.verificar', { estado: estado || 'sin_respuesta' });
    }

    // 9. Entrega: cartero.enviar { borrador, para } → ok:true SOLO con ack del proveedor.
    const para = input.para || red.data.borrador.para || null;
    if (!para) return this._abortar(pid, corr, 'cartero.enviar', 'sin_destino_para');
    const env = await this._rpc('cartero.enviar.request', { project_id: pid, borrador: red.data.borrador, para, correlation_id: corr }, { timeout_ms: 40000 });
    if (!env || env.status !== 200 || !env.data || !env.data.ok) {
      const detalle = env && env.data && env.data.envio ? env.data.envio.detalle : 'sin_ack';
      return this._abortar(pid, corr, 'cartero.enviar', detalle || 'sin_ack');
    }

    // 10. Sello: banco.publicar (SELECCIONADO → PUBLICADO) + cierre del ciclo.
    const pub = await this._rpc('banco.publicar.request', { project_id: pid, id: elegido.id, correlation_id: corr });
    if (!pub || pub.status !== 200) {
      return this._abortar(pid, corr, 'banco.publicar', pub && pub.error ? pub.error.message : 'sin_respuesta');
    }

    this._publicarEvento('reloj.ciclo_completado', { project_id: pid, candidatoId: elegido.id, envio: env.data.envio, ts: new Date().toISOString() });
    return { status: 200, data: { ciclo: 'completado', candidatoId: elegido.id } };
  }

  // ── Proyecciones internas (dominio) ──

  // _priorizar (M4): la regla vive AQUÍ, jamás en _shared. Más criterios fuertes
  // (con evidencia) primero; desempate por disposición a pagar. Espejo de la
  // _prioridadLocal del banco (duplicación deliberada de 5 líneas entre islas).
  _priorizar(lista) {
    return [...lista].sort((a, b) => {
      const d = this._prioridad(b) - this._prioridad(a);
      return d !== 0 ? d : (a.id < b.id ? -1 : 1); // estable: mismo peso → id
    });
  }

  _prioridad(c) {
    const crit = (c.ficha && c.ficha.criterios) || {};
    const conEvidencia = Object.values(crit).filter((v) => v && v.evidencia && v.evidencia.length > 0).length;
    const pagar = (c.ficha && c.ficha.detalle && c.ficha.detalle.disposicionAPagar) ? 1 : 0;
    return conEvidencia + pagar;
  }

  // _elegir (M1): 1 único candidato por ciclo; null si no hay elegibles.
  _elegir(ranking) {
    return ranking && ranking.length > 0 ? ranking[0] : null;
  }

  // _manejarSemanaVacia (M5): aviso explícito, sin envío.
  _manejarSemanaVacia(pid, corr, motivo) {
    this._publicarEvento('reloj.ciclo_semana_vacia', { project_id: pid, motivo, ts: new Date().toISOString() });
    return { status: 200, data: { ciclo: 'semana_vacia', motivo } };
  }

  // _abortar (par de fallo del ciclo): etapa + detalle; los efectos ya escritos
  // (candidatos, veredictos, borrador) se conservan — reintento el siguiente ciclo.
  _abortar(pid, corr, etapa, detalle) {
    this._publicarEvento('reloj.ciclo_abortado', { project_id: pid, etapa, detalle, ts: new Date().toISOString() });
    return { status: 200, data: { ciclo: 'abortado', etapa, detalle } };
  }

  _publicarEvento(evento, payload) {
    this.eventBus && this.eventBus.publish(evento, payload);
  }
}

module.exports = RelojReflejo;