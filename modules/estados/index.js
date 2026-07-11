/**
 * estados — LA CÚPULA DE ESTADOS (reflejo custodio único).
 *
 * Gemelo del cuenco de lentes, otra sustancia: el cuenco sirve CONOCIMIENTO
 * (lentes); esta cúpula sirve ESTADO (listas ordenadas). Un solo primitivo con
 * muchas caras — notas · chef's list · tareas · compras · orden 1º 2º 3º — todas
 * = una ListaOrdenada { pasos:[{ texto, pos, estado }] } con `orden: libre|estricto`.
 *
 * El RAIL VIVO: fichas entrando (pendiente) y saliendo (hecho), el estado ES el timón.
 * Single-writer de /estados/listas.json por proyecto → el timón no tiembla (nadie más
 * escribe; sin carrera, sin lock — la atomicidad la da fs.write tmp+rename).
 *
 * FRENO entre pasos (orden estricto): avanzar valida el paso actual contra su
 * `freno.requiere` (el VALIDAR de blueprint-agentico subido al paso). Valida → el
 * siguiente recoge; no valida → se atasca, no arrastra basura al siguiente.
 *
 * HERENCIA universal (patrón cuenco, sin cablear a nadie):
 *   - por bus:   cualquier módulo/skill llama estados.* por RPC.
 *   - por nervio: ai-gateway inyecta la lista ACTIVA en el turno (como propiocepción).
 *   - por plantilla: PRISMA (u otro) suelta plantillas de proceso → instanciar las sirve.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { plantillaDe } = require('../_shared/procesos-semilla');
const { descomponer, circuloCerrado } = require('../_shared/prisma-del-caso');

const STORE = '/estados/listas.json';
// Blockers TIPADOS del juez del rail (inspirado en el evaluador de goal de DeerFlow):
// un objetivo NO cumplido nombra POR QUÉ, no un "no" mudo. 'none' solo si satisfecho.
const BLOCKERS = ['none', 'missing_evidence', 'needs_user_input', 'run_failed', 'external_wait', 'goal_not_met_yet'];
const nowISO = () => new Date().toISOString();
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

class EstadosReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estados';
    this.version = 'reflejo-0.4.0';
  }

  onCrearRequest(e)         { return this._atender(e, 'crear', 'estados.crear.response', d => this._crear(d)); }
  onInstanciarRequest(e)    { return this._atender(e, 'instanciar', 'estados.instanciar.response', d => this._instanciar(d)); }
  onAnadirRequest(e)        { return this._atender(e, 'anadir', 'estados.anadir.response', d => this._anadir(d)); }
  onAvanzarRequest(e)       { return this._atender(e, 'avanzar', 'estados.avanzar.response', d => this._avanzar(d)); }
  onMarcarRequest(e)        { return this._atender(e, 'marcar', 'estados.marcar.response', d => this._marcar(d)); }
  onEstadoRequest(e)        { return this._atender(e, 'estado', 'estados.estado.response', d => this._estado(d)); }
  onListarRequest(e)        { return this._atender(e, 'listar', 'estados.listar.response', d => this._listar(d)); }
  onActivarRequest(e)       { return this._atender(e, 'activar', 'estados.activar.response', d => this._activar(d)); }
  onBorrarRequest(e)        { return this._atender(e, 'borrar', 'estados.borrar.response', d => this._borrar(d)); }
  onFijarObjetivoRequest(e) { return this._atender(e, 'fijar_objetivo', 'estados.fijar_objetivo.response', d => this._fijarObjetivo(d)); }
  onEvaluarRequest(e)       { return this._atender(e, 'evaluar', 'estados.evaluar.response', d => this._evaluar(d)); }

  // =============================================================
  // TOOLS del chat — el LLM PROPONE, el reflejo SOSTIENE. El nervio ya LEE la lista
  // activa cada turno; estas cuatro le dan al LLM con qué ESCRIBIRLA. Lazo cerrado.
  // Los args llegan enriquecidos con project_id del contexto de la conversación
  // (ai-gateway._executeToolCall), así que el LLM no maneja UUIDs — trabaja sobre la ACTIVA.
  // =============================================================
  async handleCrearListaTool(args) {
    const a = args || {};
    // crear una lista SIEMPRE la activa (es el rumbo que se está llevando).
    return this._crear({ project_id: a.project_id, nombre: a.nombre, tipo: a.tipo || 'tareas', orden: a.orden, pasos: a.pasos, activar: true });
  }

  async handleAnadirPasoTool(args) {
    const a = args || {};
    const est = await this._estado({ project_id: a.project_id });
    if (!est.data || !est.data.lista) return this._errorResponse(409, 'CONFLICT_STATE', 'no hay lista activa; crea una con crear_lista primero');
    return this._anadir({ project_id: a.project_id, lista_id: est.data.lista.id, texto: a.texto, freno: a.freno });
  }

  // completar el paso de la lista activa: en orden estricto AVANZA (freno incluido);
  // en libre marca el paso número `numero` (1-based, tal como lo pinta el nervio) como hecho.
  async handleCompletarPasoTool(args) {
    const a = args || {};
    const est = await this._estado({ project_id: a.project_id });
    if (!est.data || !est.data.lista) return this._errorResponse(409, 'CONFLICT_STATE', 'no hay lista activa');
    const lista = est.data.lista;
    if (lista.orden === 'estricto') return this._avanzar({ project_id: a.project_id, lista_id: lista.id, entrega: a.entrega });
    const idx = (parseInt(a.numero, 10) || 0) - 1;
    const paso = lista.pasos[idx];
    if (!paso) return this._errorResponse(400, 'INVALID_INPUT', 'numero de paso fuera de rango', { numero: a.numero });
    return this._marcar({ project_id: a.project_id, lista_id: lista.id, paso_id: paso.id, estado: ['hecho', 'descartado'].includes(a.estado) ? a.estado : 'hecho' });
  }

  async handleVerListasTool(args) {
    const a = args || {};
    // lista todas + activa; si piden activar una por id, la activa de paso.
    if (a.activar) { const r = await this._activar({ project_id: a.project_id, lista_id: a.activar }); if (r.status !== 200) return r; }
    return this._listar({ project_id: a.project_id });
  }

  // borrar una lista: por id (de ver_listas) o la ACTIVA si no se da id. Cierra el ciclo
  // de gestión del LLM (crear · añadir · completar · ver · BORRAR) — el rumbo terminado se retira.
  async handleBorrarListaTool(args) {
    const a = args || {};
    let id = a.lista_id;
    if (!id) { const est = await this._estado({ project_id: a.project_id }); id = est.data && est.data.lista && est.data.lista.id; }
    if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'no hay lista que borrar (ni id ni activa)');
    return this._borrar({ project_id: a.project_id, lista_id: id });
  }

  // ── EL JUEZ DEL RAIL (perspectiva-c: juicio puro) — el nervio ya inyecta el rail
  // (objetivo + pasos) cada turno; el LLM que VE la conversación juzga y llama estas dos.
  // El reflejo SOSTIENE lo determinista: fija el objetivo, y valida+aplica el veredicto. ──
  async handleFijarObjetivoTool(args) {
    const a = args || {};
    const est = await this._estado({ project_id: a.project_id });
    if (!est.data || !est.data.lista) return this._errorResponse(409, 'CONFLICT_STATE', 'no hay lista activa; crea una con crear_lista primero');
    return this._fijarObjetivo({ project_id: a.project_id, lista_id: est.data.lista.id, objetivo: a.objetivo });
  }

  async handleEvaluarRailTool(args) {
    const a = args || {};
    const est = await this._estado({ project_id: a.project_id });
    if (!est.data || !est.data.lista) return this._errorResponse(409, 'CONFLICT_STATE', 'no hay lista activa');
    return this._evaluar({ project_id: a.project_id, lista_id: est.data.lista.id, veredicto: a.veredicto });
  }

  // ── store (single-writer) ──
  async _cargar(project_id) {
    const obj = await this._leerJson(project_id, STORE);
    if (obj && obj.listas && typeof obj.listas === 'object') return { activa: obj.activa || null, listas: obj.listas };
    return { activa: null, listas: {} };
  }
  async _guardar(project_id, doc) {
    return this._rpc('fs.write.request', { project_id, path: STORE, content: JSON.stringify({ _version: 1, _updated: nowISO(), activa: doc.activa || null, listas: doc.listas }, null, 2), encoding: 'utf-8', atomic: true });
  }

  _paso(clave, texto, pos, freno) {
    return { id: `p${pos}_${slug(clave || texto).slice(0, 24) || pos}`, texto: String(texto || clave || `paso ${pos}`), pos, estado: 'pendiente', ...(freno ? { freno } : {}) };
  }

  _lite(lista) {
    const pendientes = lista.pasos.filter(p => p.estado === 'pendiente').length;
    return { id: lista.id, nombre: lista.nombre, tipo: lista.tipo, orden: lista.orden, estado: lista.estado, actual: lista.actual, total_pasos: lista.pasos.length, pendientes };
  }

  // ── crear una lista (cualquier cara: notas/tareas/compras/chef/proceso) ──
  async _crear(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.nombre) return this._invalid('nombre');
    const id = input.lista_id ? slug(input.lista_id) : slug(input.nombre);
    if (!id) return this._invalid('nombre');
    const doc = await this._cargar(input.project_id);
    if (doc.listas[id]) return this._errorResponse(409, 'CONFLICT_STATE', 'ya existe una lista con ese id', { id });
    const orden = input.orden === 'estricto' ? 'estricto' : 'libre';
    const pasos = (Array.isArray(input.pasos) ? input.pasos : []).map((p, i) =>
      typeof p === 'string' ? this._paso(null, p, i) : this._paso(p.clave, p.texto, i, p.freno));
    const lista = { id, nombre: String(input.nombre), tipo: input.tipo || 'tareas', orden, pasos, actual: 0, estado: 'abierta', creada: nowISO(), actualizada: nowISO(), ...(input.objetivo ? { objetivo: String(input.objetivo) } : {}) };
    doc.listas[id] = lista;
    if (input.activar) doc.activa = id;
    const w = await this._guardar(input.project_id, doc);
    if (w && w.error) return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'no se pudo guardar la lista');
    this.eventBus.publish('estados.lista.creada', { project_id: input.project_id, lista_id: id, tipo: lista.tipo, timestamp: nowISO() });
    return { status: 201, data: { lista_id: id, orden, total_pasos: pasos.length } };
  }

  // ── instanciar una lista desde la PLANTILLA de proceso de un arquetipo (PRISMA hereda) ──
  async _instanciar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.arquetipo) return this._invalid('arquetipo');
    const plantilla = plantillaDe(input.arquetipo, input.plantillas || {});
    if (!plantilla) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no hay plantilla de proceso para ese arquetipo', { arquetipo: input.arquetipo });
    const nombre = input.nombre || plantilla.nombre || `Proceso ${input.arquetipo}`;
    const id = input.lista_id ? slug(input.lista_id) : slug(nombre);
    const doc = await this._cargar(input.project_id);
    if (doc.listas[id]) return this._errorResponse(409, 'CONFLICT_STATE', 'ya existe una lista con ese id', { id });
    const pasos = (plantilla.pasos || []).map((p, i) => this._paso(p.clave, p.texto, i, p.freno));
    const lista = { id, nombre, tipo: 'proceso', orden: plantilla.orden === 'libre' ? 'libre' : 'estricto', arquetipo: input.arquetipo, plantilla: input.arquetipo, pasos, actual: 0, estado: 'abierta', creada: nowISO(), actualizada: nowISO() };
    doc.listas[id] = lista;
    if (input.activar) doc.activa = id;
    const w = await this._guardar(input.project_id, doc);
    if (w && w.error) return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'no se pudo guardar la lista');
    this.eventBus.publish('estados.lista.creada', { project_id: input.project_id, lista_id: id, tipo: 'proceso', arquetipo: input.arquetipo, timestamp: nowISO() });
    return { status: 201, data: { lista_id: id, arquetipo: input.arquetipo, orden: lista.orden, total_pasos: pasos.length, primer_paso: pasos[0] ? pasos[0].id : null } };
  }

  // ── añadir un ítem/paso pendiente al final ──
  async _anadir(input) {
    if (!input.project_id || !input.lista_id) return this._invalid('lista_id');
    if (!input.texto) return this._invalid('texto');
    const doc = await this._cargar(input.project_id);
    const lista = doc.listas[slug(input.lista_id)];
    if (!lista) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'lista no existe', { lista_id: input.lista_id });
    const pos = lista.pasos.length;
    const paso = this._paso(input.clave, input.texto, pos, input.freno);
    lista.pasos.push(paso);
    lista.actualizada = nowISO();
    if (lista.estado === 'completa') lista.estado = 'abierta';
    await this._guardar(input.project_id, doc);
    return { status: 200, data: { lista_id: lista.id, paso: paso.id, total_pasos: lista.pasos.length } };
  }

  // ── FRENO validador: el paso actual solo suelta si su entrega trae freno.requiere ──
  _validarPaso(paso, entrega) {
    const freno = paso && paso.freno;
    if (!freno || !Array.isArray(freno.requiere) || freno.requiere.length === 0) return { ok: true, faltan: [] };
    const vacio = (v) => v === undefined || v === null || v === '' || v === false;
    const faltan = freno.requiere.filter(c => vacio(entrega[c]));
    return { ok: faltan.length === 0, faltan };
  }

  // ── avanzar (orden ESTRICTO): valida el paso actual → hecho + siguiente recoge, o atasco ──
  async _avanzar(input) {
    if (!input.project_id || !input.lista_id) return this._invalid('lista_id');
    const doc = await this._cargar(input.project_id);
    const lista = doc.listas[slug(input.lista_id)];
    if (!lista) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'lista no existe', { lista_id: input.lista_id });
    if (lista.orden !== 'estricto') return this._errorResponse(409, 'CONFLICT_STATE', 'avanzar es de orden estricto; en libre usa marcar', { lista_id: lista.id, orden: lista.orden });
    if (lista.actual >= lista.pasos.length) return { status: 200, data: { avanzado: false, completa: true } };
    const paso = lista.pasos[lista.actual];
    const freno = this._validarPaso(paso, input.entrega || {});
    if (!freno.ok) {
      paso.estado = 'atascado';
      lista.actualizada = nowISO();
      await this._guardar(input.project_id, doc);
      this.eventBus.publish('estados.paso.atascado', { project_id: input.project_id, lista_id: lista.id, paso: paso.id, faltan: freno.faltan, timestamp: nowISO() });
      return { status: 200, data: { avanzado: false, atascado: true, paso: paso.id, faltan: freno.faltan } };
    }
    paso.estado = 'hecho';
    if (input.entrega) paso.entrega = input.entrega;
    lista.actual += 1;
    const completa = lista.actual >= lista.pasos.length;
    lista.estado = completa ? 'completa' : 'abierta';
    lista.actualizada = nowISO();
    await this._guardar(input.project_id, doc);
    const siguiente = completa ? null : lista.pasos[lista.actual].id;
    this.eventBus.publish('estados.paso.avanzado', { project_id: input.project_id, lista_id: lista.id, paso: paso.id, siguiente, completa, timestamp: nowISO() });
    return { status: 200, data: { avanzado: true, paso: paso.id, siguiente, completa } };
  }

  // ── marcar (orden LIBRE): tachar/descartar un paso por id ──
  async _marcar(input) {
    if (!input.project_id || !input.lista_id || !input.paso_id) return this._invalid('paso_id');
    const estado = ['hecho', 'descartado', 'pendiente'].includes(input.estado) ? input.estado : 'hecho';
    const doc = await this._cargar(input.project_id);
    const lista = doc.listas[slug(input.lista_id)];
    if (!lista) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'lista no existe', { lista_id: input.lista_id });
    const paso = lista.pasos.find(p => p.id === input.paso_id);
    if (!paso) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'paso no existe', { paso_id: input.paso_id });
    paso.estado = estado;
    const cerrados = lista.pasos.every(p => p.estado === 'hecho' || p.estado === 'descartado');
    lista.estado = cerrados && lista.pasos.length > 0 ? 'completa' : 'abierta';
    lista.actualizada = nowISO();
    await this._guardar(input.project_id, doc);
    return { status: 200, data: { lista_id: lista.id, paso: paso.id, estado } };
  }

  // ── fijar el OBJETIVO de una lista (la condición de completitud que juzga el rail) ──
  async _fijarObjetivo(input) {
    if (!input.project_id || !input.lista_id) return this._invalid('lista_id');
    if (!input.objetivo) return this._invalid('objetivo');
    const doc = await this._cargar(input.project_id);
    const lista = doc.listas[slug(input.lista_id)];
    if (!lista) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'lista no existe', { lista_id: input.lista_id });
    lista.objetivo = String(input.objetivo);
    // PRISMA cuando PROCEDE (gate): si quien fija el objetivo DECLARA rasgos del dato
    // (afirma_sobre_el_mundo? · derivable_de_internos?), el objetivo deja de ser solo
    // prosa → se le adjunta el círculo TIPADO (naturaleza + contrato + preguntas +
    // no_objetivos). Sin rasgos declarados, el rail sigue igual (texto). NO adivina.
    if (input.rasgos && typeof input.rasgos === 'object') {
      lista.prisma = descomponer({
        necesidad: input.objetivo, entidad: input.entidad || null,
        dominio: input.dominio || null, rasgos: input.rasgos,
        herramientas: Array.isArray(input.herramientas) ? input.herramientas : []
      });
    }
    lista.actualizada = nowISO();
    await this._guardar(input.project_id, doc);
    this.eventBus.publish('estados.objetivo.fijado', { project_id: input.project_id, lista_id: lista.id, objetivo: lista.objetivo, prisma: lista.prisma || null, timestamp: nowISO() });
    return { status: 200, data: { lista_id: lista.id, objetivo: lista.objetivo, prisma: lista.prisma || null } };
  }

  // ── EL FRENO del juez: un veredicto satisfecho:false EXIGE un blocker TIPADO (no 'none').
  // Deja el rail siempre con un diagnóstico fértil (qué falta, por qué). PURO. ──
  _aplicarVeredicto(lista, veredicto) {
    if (!veredicto || typeof veredicto !== 'object') return { ok: false, err: this._errorResponse(400, 'INVALID_INPUT', 'veredicto requerido', { field: 'veredicto' }) };
    const satisfecho = veredicto.satisfecho === true;
    let blocker;
    if (satisfecho) { blocker = 'none'; }
    else {
      blocker = veredicto.blocker;
      if (!BLOCKERS.includes(blocker) || blocker === 'none') {
        return { ok: false, err: this._errorResponse(422, 'UPSTREAM_INVALID_RESPONSE', 'un veredicto no satisfecho exige un blocker tipado', { blockers: BLOCKERS.filter(b => b !== 'none') }) };
      }
    }
    lista.ultima_evaluacion = { satisfecho, blocker, razon: String(veredicto.razon || ''), evidencia: String(veredicto.evidencia || ''), ts: nowISO() };
    if (satisfecho) lista.estado = 'completa';
    return { ok: true, satisfecho, blocker };
  }

  // ── EL ESPEJO: ensambla el estado-de-HECHOS que come circuloCerrado.
  // COSTURA de fuente de verdad: hoy lee los hechos que reporta el caller (estado);
  // el `persistido` DEBE venir del hecho de que el evento de cierre se OBSERVÓ en el bus
  // (cúpula de eventos) — aquí es donde se enchufa. Mientras, exige que los hechos
  // VENGAN NOMBRADOS (no un 'satisfecho' pelado del LLM): la mentira, si la hay, es
  // sobre un hecho concreto y re-comprobable, no sobre el juicio entero. ──
  _ensamblarEstado(lista, input) {
    const e = (input && input.estado && typeof input.estado === 'object') ? input.estado : {};
    return {
      naturaleza: lista.prisma.identidad.naturaleza,
      valor: e.valor !== undefined ? e.valor : null,
      evidencia: e.evidencia !== undefined ? e.evidencia : null,
      freno_verde: e.freno_verde === true,
      persistido: e.persistido === true        // ← futura fuente: cúpula de eventos (evento de cierre visto)
    };
  }
  _blockerDeFaltan(faltan) {
    if (faltan.some(f => /evidencia/i.test(f))) return 'missing_evidence';
    if (faltan.some(f => /freno_verde/i.test(f))) return 'run_failed';
    return 'goal_not_met_yet';                  // valor / persistido aún sin cerrar
  }

  // ── evaluar el rail contra su objetivo. DOS caminos:
  //   · lista CON prisma  → el juez es circuloCerrado sobre HECHOS (tipado, naturaleza-aware);
  //     el LLM ya NO declara 'satisfecho' — reporta los hechos y el círculo decide.
  //   · lista SIN prisma  → el VEREDICTO del LLM de página (camino histórico, intacto). ──
  async _evaluar(input) {
    if (!input.project_id || !input.lista_id) return this._invalid('lista_id');
    const doc = await this._cargar(input.project_id);
    const lista = doc.listas[slug(input.lista_id)];
    if (!lista) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'lista no existe', { lista_id: input.lista_id });
    if (!lista.objetivo) return this._errorResponse(409, 'CONFLICT_STATE', 'la lista no tiene objetivo; fija uno con fijar_objetivo', { lista_id: lista.id });

    let satisfecho, blocker, faltan = null;
    if (lista.prisma) {
      const estado = this._ensamblarEstado(lista, input);
      const j = circuloCerrado(estado);
      satisfecho = j.cerrado;
      faltan = j.faltan;
      blocker = satisfecho ? 'none' : this._blockerDeFaltan(j.faltan);
      lista.ultima_evaluacion = { satisfecho, blocker, faltan, estado, ts: nowISO() };
      if (satisfecho) lista.estado = 'completa';
    } else {
      const ap = this._aplicarVeredicto(lista, input.veredicto);
      if (!ap.ok) return ap.err;
      satisfecho = ap.satisfecho; blocker = ap.blocker;
    }
    lista.actualizada = nowISO();
    await this._guardar(input.project_id, doc);
    this.eventBus.publish('estados.goal.evaluado', { project_id: input.project_id, lista_id: lista.id, satisfecho, blocker, faltan, timestamp: nowISO() });
    if (satisfecho) this.eventBus.publish('estados.goal.cumplido', { project_id: input.project_id, lista_id: lista.id, objetivo: lista.objetivo, timestamp: nowISO() });
    return { status: 200, data: { lista_id: lista.id, satisfecho, blocker, faltan, estado: lista.estado } };
  }

  // ── estado: una lista concreta, o la ACTIVA (lo que lee el nervio) ──
  async _estado(input) {
    if (!input.project_id) return this._invalid('project_id');
    const doc = await this._cargar(input.project_id);
    const id = input.lista_id ? slug(input.lista_id) : doc.activa;
    if (!id) return { status: 200, data: { activa: null, lista: null } };
    const lista = doc.listas[id];
    if (!lista) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'lista no existe', { lista_id: id });
    return { status: 200, data: { lista, activa: doc.activa === id } };
  }

  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const doc = await this._cargar(input.project_id);
    const listas = Object.values(doc.listas).map(l => this._lite(l));
    return { status: 200, data: { listas, activa: doc.activa, total: listas.length } };
  }

  async _activar(input) {
    if (!input.project_id || !input.lista_id) return this._invalid('lista_id');
    const doc = await this._cargar(input.project_id);
    const id = slug(input.lista_id);
    if (!doc.listas[id]) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'lista no existe', { lista_id: id });
    doc.activa = id;
    await this._guardar(input.project_id, doc);
    this.eventBus.publish('estados.lista.activada', { project_id: input.project_id, lista_id: id, timestamp: nowISO() });
    return { status: 200, data: { activa: id } };
  }

  async _borrar(input) {
    if (!input.project_id || !input.lista_id) return this._invalid('lista_id');
    const doc = await this._cargar(input.project_id);
    const id = slug(input.lista_id);
    if (!doc.listas[id]) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'lista no existe', { lista_id: id });
    delete doc.listas[id];
    if (doc.activa === id) doc.activa = null;
    await this._guardar(input.project_id, doc);
    return { status: 200, data: { borrada: id } };
  }
}

module.exports = EstadosReflejo;
