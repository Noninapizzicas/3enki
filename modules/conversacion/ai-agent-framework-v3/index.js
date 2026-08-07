'use strict';

/**
 * P1 · EJECUTOR DE PIPELINES — el tronco del MOTOR DE AGENTES.
 *
 * Un solo camino: agent.execute.request (invoke_agent.request es un ALIAS del
 * mismo pipeline). Recorre los pasos declarados en el REGISTRO (P2), uno a uno:
 *   · REFLEJO → ejecuta el determinista (_shared/motor) o no-op registrado
 *   · FUZZY   → puerto de generación (llm.complete.request al gateway) →
 *               conversor (P10) → validador (P3) → reintento QUIRÚRGICO
 * Cada paso queda ESCRITO en la BITÁCORA (P6). Al final, el JEFE (P4)
 * verifica el entregable contra el MUNDO REAL; verificado:false = veredicto.
 *
 * Event-driven: los custodios y el gateway se hablan por eventos (request →
 * response con request_id); el mundo es un puerto inyectable (smoke: /tmp).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const BaseModule = require('../../_shared/base-module');

const { verificar } = require('../../_shared/motor/verificador');
const { validar } = require('../../_shared/motor/validador');
const { convertir } = require('../../_shared/motor/conversor');

class EjecutorMotorModule extends BaseModule {
  constructor() {
    super();
    this.name = 'ai-agent-framework-v3';
    this.version = '0.1.0';
    // Puertos del mundo (inyectables en el smoke).
    this.dataDir = path.resolve(__dirname, '../../../data');
    this.modulesDir = path.resolve(__dirname, '../../..');
    this.repoDir = '/home/admin/3enki';
    this.eventBus = null;
    this.logger = null;
    this.moduleLoader = null;
    // Generaciones en curso (correlación por llm_request_id).
    this._generacionEsperas = new Map();
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.moduleLoader = context.moduleLoader || null;
    if (this.moduleLoader && this.moduleLoader.toolsRegistry) {
      this._registrarTools();
    }
  }

  // ── TOOLS DEL CHAT (la cúpula del MOTOR): invoke_agent + buscar_agente,
  //    servidas por el v3 — el catálogo SON los pipelines del registro. ──────
  _registrarTools() {
    // invoke_agent: la ejecuta el v3 (escucha invoke_agent.request — alias del
    // mismo pipeline). La descripción lista los pipelines declarados.
    const pipelines = ['construir-modulos', 'escribir-skills', 'esquematizador-negocio', 'planificar-construccion'];
    const tool = {
      name: 'invoke_agent',
      description: `Invoca un PIPELINE del motor de agentes para una tarea concreta (el pipeline corre casi todo determinista; el JEFE verifica el entregable antes del éxito).\n\nPipelines disponibles:\n${pipelines.map(p => `  - ${p}`).join('\n')}\n\nDevuelve cuando el pipeline termina con el veredicto.`,
      parameters: {
        type: 'object',
        properties: {
          agent_name: { type: 'string', description: 'Nombre exacto del pipeline', enum: pipelines },
          task:       { type: 'string', description: 'Tarea concreta en lenguaje natural' },
          context:    { type: 'object', description: 'Datos específicos (project_id, conversation_id…)' }
        },
        required: ['agent_name', 'task']
      },
      module: 'ai-agent-framework-v3',
      event_based: true,
      _pipelines: pipelines
    };
    this.moduleLoader.toolsRegistry.set('invoke_agent', tool);

    // buscar_agente: catálogo de pipelines del registro (consulta en vivo).
    const toolBuscar = {
      name: 'buscar_agente',
      description: 'Busca en el registro del MOTOR DE AGENTES los pipelines (trabajadores deterministas+verificados) que sirven para una tarea. Devuelve nombre y descripción. ÚSALA cuando una tarea pediría un especialista y no sabes si existe un pipeline.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 1, description: 'La tarea/capacidad a buscar (p.ej. "construir módulos", "escribir skills", "esquematizar negocio").' },
          dominio: { type: 'string', description: 'Opcional: ceñir a un dominio.' },
          limite: { type: 'number', description: 'Opcional: cuántos devolver (default 10).' }
        },
        required: ['query']
      },
      module: 'ai-agent-framework-v3',
      event_based: true
    };
    this.moduleLoader.toolsRegistry.set('buscar_agente', toolBuscar);
    this.logger?.info?.('ai-agent-framework-v3.tools.registered', { invoke_agent: true, buscar_agente: true, pipelines: pipelines.length });
  }

  // Handler de buscar_agente: consulta el registro (pipeline.listar) y filtra.
  async onBuscarAgente(event) {
    const d = event?.data || event || {};
    const request_id = d.request_id;
    const query = String(d.query || '').toLowerCase();
    try {
      const resp = await this._pedir('pipeline.listar.request', { request_id: crypto.randomUUID() }, 'pipeline.listar.response', 8000);
      const lista = (resp && resp.pipelines) || [];
      const result = lista
        .filter(p => !query || String(p.name).toLowerCase().includes(query) || String(p.description || '').toLowerCase().includes(query))
        .slice(0, d.limite || 10)
        .map(p => ({ name: p.name, description: p.description, dominio: 'proceso', activo: true }));
      if (this.eventBus) {
        this.eventBus.publish('buscar_agente.response', { request_id, result, total: result.length });
      }
    } catch (err) {
      this.logger?.warn?.('ai-agent-framework-v3.buscar_agente.error', { request_id, error: err.message });
      if (this.eventBus) {
        this.eventBus.publish('buscar_agente.response', { request_id, result: [], total: 0, error: err.message });
      }
    }
  }

  // ── Helpers de integración por EVENTOS ─────────────────────────────────────
  // _pedir: request → response. Escucha AMBOS pares del bus: el `.response` y
  // el `.failed` canónico (todo flujo de Enki cierra su círculo con su par
  // *.failed). Sin el failed, un error del custodio se convierte en TIMEOUT.
  _pedir(eventoRequest, payload, eventoResponse, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let unsub = null;
      let unsubFail = null;
      const limpiar = () => { if (unsub) unsub(); if (unsubFail) unsubFail(); };
      const to = setTimeout(() => {
        limpiar();
        reject(Object.assign(new Error(`timeout esperando ${eventoResponse}`), { code: 'TIMEOUT' }));
      }, timeoutMs);
      unsub = this.eventBus.subscribe(eventoResponse, (event) => {
        const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
        if (!data || data.request_id !== payload.request_id) return;
        clearTimeout(to);
        limpiar();
        if (data.error) {
          const e = new Error(data.error.message || String(data.error));
          e.code = data.error.code || 'UNKNOWN_ERROR';
          reject(e);
        } else {
          resolve(data);
        }
      });
      // El par canónico *.failed del bus: el error real del custodio (no timeout).
      const eventoFailed = eventoResponse.replace(/\.response$/, '.failed');
      if (eventoFailed !== eventoResponse) {
        unsubFail = this.eventBus.subscribe(eventoFailed, (event) => {
          const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
          if (!data || data.request_id !== payload.request_id) return;
          clearTimeout(to);
          limpiar();
          const e = new Error((data.error && data.error.message) || `fallo ${eventoFailed}`);
          e.code = (data.error && data.error.code) || 'FAILED';
          reject(e);
        });
      }
      this.eventBus.publish(eventoRequest, { ...payload });
    });
  }

  _publicar(topic, payload) {
    if (this.eventBus && typeof this.eventBus.publish === 'function') {
      this.eventBus.publish(topic, payload);
    }
  }

  _progress(project_id, request_id, agent_name, step, message, tool_invoked) {
    this._publicar('agent.execute.progress', {
      request_id, agent_name, project_id,
      step: step || 'thinking',
      message: message || null,
      tool_invoked: tool_invoked || null,
      timestamp: new Date().toISOString()
    });
  }

  // ── El MUNDO (puerto inyectable: storage del proyecto o modules/ del sistema) ──
  _resolver(rel, project_id) {
    if (rel.startsWith('storage/')) {
      return path.join(this.dataDir, 'projects', project_id || 'system', 'storage', rel.replace(/^storage\//, ''));
    }
    return path.join(this.modulesDir, rel);
  }

  _mundo(project_id) {
    const resolver = (rel) => this._resolver(rel, project_id);
    return {
      existe: (rel) => fs.existsSync(resolver(rel)),
      leer: (rel) => {
        try { return fs.readFileSync(resolver(rel), 'utf8'); } catch { return null; }
      },
      enRepo: (rel) => {
        if (rel.startsWith('storage/')) return undefined; // storage no se verifica en repo → no bloquea
        try {
          const out = execSync(`git -C ${this.repoDir} ls-files -- modules/${rel} 2>/dev/null`, { stdio: 'pipe' });
          return out.toString().trim().length > 0;
        } catch { return undefined; }
      }
    };
  }

  // REFLEJO 'escribir': el pipeline toca el mundo real con la salida del fuzzy.
  _escribir(rel, canónica, project_id) {
    const abs = this._resolver(rel, project_id);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const contenido = (canónica && typeof canónica === 'object' && 'content' in canónica && Object.keys(canónica).length === 1)
      ? String(canónica.content)
      : JSON.stringify(canónica, null, 2);
    fs.writeFileSync(abs, contenido, 'utf8');
    return abs;
  }

  _resolverSlug(task, pipelineName) {
    const stop = new Set(['construye', 'construir', 'construida', 'construido', 'escribe', 'escribir', 'escriba', 'genera', 'generar', 'proyecto', 'proyectos', 'modulo', 'modulos', 'fase', 'hoja', 'hojas', 'skill', 'skills', 'esquema', 'esquemas', 'esquematiza', 'plan', 'planes', 'del', 'de', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'que', 'con', 'y', 'a', 'su', 'en', 'al', 'se', 'por', 'como', 'mas', 'más', 'the', 'debe', 'debes', 'siguiente', 'siguientes', 'tanda', 'orden', 'primero', 'segundo', 'tercero', 'lee', 'leer', 'verifica', 'verificar', 'completa', 'completar', 'cierra', 'cerrar']);
    const tokens = String(task || '').toLowerCase().match(/[a-z][a-z0-9-]{2,40}/g) || [];
    // El nombre del módulo suele ser el token no-stopword MÁS LARGO (no el primero).
    const candidatos = tokens.filter(t => !stop.has(t) && t.length > 3 && !/^\d+$/.test(t));
    if (candidatos.length === 0) return pipelineName;
    return candidatos.sort((a, b) => b.length - a.length)[0];
  }

  _resolverEntregable(entregable, task, pipelineName) {
    const slug = this._resolverSlug(task, pipelineName);
    return {
      ...entregable,
      path: String(entregable.path).replace(/<slug>/g, slug)
    };
  }

  // ── PUERTO FUZZY (el único punto no determinista) ──────────────────────────
  _generar(paso, task, pipeline) {
    const llm_request_id = crypto.randomUUID();
    const max_tokens = (pipeline.presupuesto && pipeline.presupuesto.max_tokens) || 8000;
    const timeoutMs = (pipeline.presupuesto && pipeline.presupuesto.generacion_timeout_ms) || 120000;
    const system = paso.instruccion
      || `Eres el paso fuzzy '${paso.paso}' del pipeline '${pipeline.name}'. Genera SOLO lo pedido en el mensaje. No ejecutes nada, no inventes: produce la salida cruda.`;
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        this._generacionEsperas.delete(llm_request_id);
        reject(Object.assign(new Error(`generación timeout (${paso.paso})`), { code: 'TIMEOUT' }));
      }, timeoutMs);
      this._generacionEsperas.set(llm_request_id, { resolve, reject, to, paso: paso.paso });
      this._publicar('llm.complete.request', {
        llm_request_id,
        shape: 'canonical',
        provider: pipeline.provider || null,
        model: pipeline.model || null,
        max_tokens,
        system,
        messages: [{ role: 'user', content: task }],
        tools: []
      });
    });
  }

  async onLlmCompleteResponse(event) {
    const data = event?.data || event || {};
    const espera = this._generacionEsperas.get(data.llm_request_id);
    if (!espera) return;
    clearTimeout(espera.to);
    this._generacionEsperas.delete(data.llm_request_id);
    espera.resolve({ content: data.content || '', model: data.model, provider: data.provider });
  }

  async onLlmCompleteFailed(event) {
    const data = event?.data || event || {};
    const espera = this._generacionEsperas.get(data.llm_request_id);
    if (!espera) return;
    clearTimeout(espera.to);
    this._generacionEsperas.delete(data.llm_request_id);
    espera.reject(Object.assign(new Error((data.error && data.error.message) || 'generación falló'), { code: (data.error && data.error.code) || 'UNKNOWN_ERROR' }));
  }

  // ── EL PIPELINE ─────────────────────────────────────────────────────────────
  async _ejecutarPipeline({ request_id, agent_name, project_id, task, conversation_id, session_id, shape }) {
    const responseEvent = shape === 'legacy' ? 'invoke_agent.response' : 'agent.execute.response';
    const failEvent = shape === 'legacy' ? 'invoke_agent.response' : 'agent.execute.failed';
    const mundo = this._mundo(project_id);
    const pasosBitacora = [];

    try {
      // 1 · El pipeline, del REGISTRO (P2)
      const pipeResp = await this._pedir('pipeline.obtener.request', { request_id: crypto.randomUUID(), nombre: agent_name }, 'pipeline.obtener.response', 8000);
      const pipeline = pipeResp.pipeline;

      // 2 · Abrir la BITÁCORA (P6)
      await this._pedir('bitacora.abrir.request', { request_id, project_id, agent_name, task }, 'bitacora.abierta', 8000);

      // El entregable RESUELTO (el slug sale de la task) — lo usan 'escribir' y el JEFE.
      const entregableReal = this._resolverEntregable(pipeline.entregable, task, agent_name);

      // 3 · Recorrer los pasos, uno a uno
      const generacionesMax = (pipeline.presupuesto && pipeline.presupuesto.generaciones_por_paso) || 3;
      let salidaUltima = null;
      let pasoFallido = null;

      for (const paso of pipeline.pasos) {
        if (paso.tipo === 'fuzzy') {
          this._progress(project_id, request_id, agent_name, 'tool_call', `generando (${paso.paso})`, 'generar');
          let ok = false;
          for (let intento = 1; intento <= generacionesMax; intento++) {
            try {
              const resp = await this._generar(paso, task, pipeline);
              const conv = convertir(resp.content);
              if (!conv.ok) {
                await this._pedir('bitacora.paso.request', { request_id, project_id, paso: paso.paso, message: `intento ${intento}: ${conv.detalle}` }, 'bitacora.paso.registrado', 8000);
                continue;
              }
              const val = validar(conv.canónica, paso.valida || {});
              if (val.ok) {
                salidaUltima = conv.canónica;
                ok = true;
                await this._pedir('bitacora.paso.request', { request_id, project_id, paso: paso.paso, message: `intento ${intento}: válido` }, 'bitacora.paso.registrado', 8000);
                break;
              }
              await this._pedir('bitacora.paso.request', { request_id, project_id, paso: paso.paso, message: `intento ${intento} no valida: ${val.detalle}` }, 'bitacora.paso.registrado', 8000);
            } catch (err) {
              await this._pedir('bitacora.paso.request', { request_id, project_id, paso: paso.paso, message: `intento ${intento} error: ${err.message}` }, 'bitacora.paso.registrado', 8000).catch(() => {});
            }
          }
          if (!ok) {
            pasoFallido = paso.paso;
            throw Object.assign(new Error(`paso fuzzy '${paso.paso}' agotó ${generacionesMax} generaciones sin validar`), { code: 'PASO_FUZZY_NO_VALIDADO' });
          }
        } else {
          // REFLEJO: ejecuta el determinista si declara op conocida; si no, no-op registrado.
          if (paso.op === 'escribir' && salidaUltima !== null) {
            const abs = this._escribir(entregableReal ? entregableReal.path : pipeline.entregable.path, salidaUltima, project_id);
            await this._pedir('bitacora.paso.request', { request_id, project_id, paso: paso.paso, message: `escrito en ${abs}` }, 'bitacora.paso.registrado', 8000);
            this._progress(project_id, request_id, agent_name, 'tool_call', `escrito en ${abs}`, 'escribir');
          } else if (paso.op === 'validar' && salidaUltima !== null) {
            const val = validar(salidaUltima, paso.valida || {});
            salidaUltima = val.ok ? salidaUltima : null;
          }
          await this._pedir('bitacora.paso.request', { request_id, project_id, paso: paso.paso, message: paso.op ? `reflejo ${paso.op}` : 'reflejo (no-op)' }, 'bitacora.paso.registrado', 8000);
          this._progress(project_id, request_id, agent_name, 'thinking', `paso ${paso.paso}`, null);
        }
      }

      if (pasoFallido) {
        throw Object.assign(new Error(`paso fuzzy '${pasoFallido}' no validado`), { code: 'PASO_FUZZY_NO_VALIDADO' });
      }

      // 4 · El JEFE (P4) contra el MUNDO REAL
      this._progress(project_id, request_id, agent_name, 'finalizing', 'JEFE: verificando entregable…', null);
      const veredicto = verificar(entregableReal, mundo);

      // 5 · Sellar la bitácora con el veredicto
      await this._pedir('bitacora.sellar.request', { request_id, project_id, veredicto, duracion_ms: 0 }, 'bitacora.sellada', 8000);

      if (!veredicto.verificado) {
        // El humo se pilla: response con ERROR honesto (nunca success).
        const payloadFail = {
          request_id, agent_name, project_id,
          ...(conversation_id ? { conversation_id } : {}),
          ...(session_id ? { session_id } : {}),
          error: {
            code: 'ENTREGABLE_NO_VERIFICADO',
            message: `El agente ${agent_name} terminó pero el entregable NO se verificó: ${veredicto.motivo} — ${veredicto.reglas.map(r => r.detalle).join('; ')}`,
            veredicto
          },
          timestamp: new Date().toISOString()
        };
        this._publicar(failEvent, payloadFail);
        return payloadFail;
      }

      // 6 · ÉXITO verificado (el JEFE leyó el mundo)
      const payload = {
        request_id, agent_name, project_id,
        ...(conversation_id ? { conversation_id } : {}),
        ...(session_id ? { session_id } : {}),
        result: {
          agent: agent_name,
          content: salidaUltima ? JSON.stringify(salidaUltima) : `Entregable verificado: ${veredicto.path}`
        },
        verificado: true,
        veredicto,
        pasos: pasosBitacora,
        timestamp: new Date().toISOString()
      };
      this._publicar(responseEvent, payload);
      return payload;
    } catch (err) {
      // Cierre honesto: todo flujo responde su par *.failed
      try {
        await this._pedir('bitacora.sellar.request', {
          request_id, project_id,
          veredicto: { verificado: false, motivo: err.code || 'UNKNOWN_ERROR', reglas: [{ regla: 'ejecucion', ok: false, detalle: err.message || String(err) }] },
          duracion_ms: 0
        }, 'bitacora.sellada', 8000);
      } catch { /* la bitácora puede no existir si falló antes de abrir */ }
      const payloadFail = {
        request_id, agent_name, project_id,
        ...(conversation_id ? { conversation_id } : {}),
        ...(session_id ? { session_id } : {}),
        error: { code: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) },
        timestamp: new Date().toISOString()
      };
      this._publicar(failEvent, payloadFail);
      return payloadFail;
    }
  }

  // ── Handlers de entrada ─────────────────────────────────────────────────────
  async onAgentExecuteRequest(event) {
    const data = event?.data || event || {};
    const { request_id, agent_name, task, project_id } = data;
    if (!request_id || !agent_name || !task) {
      this._publicar('agent.execute.failed', {
        request_id: request_id || 'sin-request-id',
        agent_name: agent_name || '?',
        project_id: project_id || null,
        error: { code: 'INVALID_INPUT', message: 'request_id, agent_name y task son requeridos' },
        timestamp: new Date().toISOString()
      });
      return;
    }
    return this._ejecutarPipeline({
      request_id, agent_name, project_id: project_id || 'system',
      task, conversation_id: data.conversation_id || data.context?.conversation_id || null,
      session_id: data.session_id || null, shape: 'canonical'
    });
  }

  // ALIAS legacy: el chat invoca igual, mismo pipeline, misma verificación.
  async onInvokeAgentRequest(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id || crypto.randomUUID();
    const agent_name = data.agent_name || data.agentName;
    const task = data.task;
    const context = data.context || {};
    if (!agent_name || !task) {
      this._publicar('invoke_agent.response', {
        request_id, error: { code: 'INVALID_INPUT', message: 'agent_name y task son requeridos' }
      });
      return;
    }
    return this._ejecutarPipeline({
      request_id, agent_name,
      project_id: data.project_id || context.project_id || 'system',
      task, conversation_id: data.conversation_id || context.conversation_id || null,
      session_id: data.session_id || null, shape: 'legacy'
    });
  }

  // Reanudar desde la bitácora: mismo request_id + veredicto anterior como contexto.
  async onAgentExecuteResumeRequest(event) {
    const data = event?.data || event || {};
    const { request_id, project_id } = data;
    try {
      const leida = await this._pedir('bitacora.leer.request', { request_id: crypto.randomUUID(), project_id, request_id: data.request_id }, 'bitacora.leer.response', 8000);
      const bitacora = leida.bitacora;
      if (bitacora.estado === 'verificada') {
        this._publicar('agent.execute.failed', {
          request_id, agent_name: bitacora.agent_name, project_id,
          error: { code: 'NO_REANUDABLE', message: 'la ejecución ya está verificada' },
          timestamp: new Date().toISOString()
        });
        return;
      }
      const contextoCorregido = bitacora.veredicto
        ? `Reintento tras veredicto no verificado: ${JSON.stringify(bitacora.veredicto)}. Corrige lo que falle y completa la tarea: ${bitacora.task || ''}`
        : (bitacora.task || '');
      return this.onAgentExecuteRequest({
        data: {
          request_id,
          agent_name: bitacora.agent_name,
          project_id,
          task: contextoCorregido,
          context: { project_id }
        }
      });
    } catch (err) {
      this._publicar('agent.execute.failed', {
        request_id, agent_name: data.agent_name || '?', project_id,
        error: { code: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) },
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = EjecutorMotorModule;
