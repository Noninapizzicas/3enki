---
id: modulos/grupo-d
dominio: modulos
resumen: prompt-manager (plantillas versionadas), recetario-creativo (generación IA), scheduler (jobs cron).
fuentes:
  - modules/prompt-manager/**
  - modules/recetario-creativo/**
  - modules/scheduler/**
verificado: 2026-07-06
---

# GRUPO D — PROMPT-MANAGER, RECETARIO-CREATIVO, SCHEDULER

## PROMPT-MANAGER (v2.0.0) — Gestión Versionada de Plantillas

```
INTERFAZ PromptManagerContract {
  createPrompt(data: {name, template, variables, category?, description?}): Promise<{prompt_id, version}>
  getPrompt(prompt_id: String, version?: String): Promise<Prompt>
  listPrompts(filters?: {category?, search?}): Promise<Array<Prompt>>
  updatePrompt(prompt_id: String, updates: Object): Promise<Prompt>
  deletePrompt(prompt_id: String): Promise<Void>
  renderPrompt(prompt_id: String, variables: Object, version?: String): Promise<String>
  forkPrompt(prompt_id: String, name: String): Promise<{new_prompt_id}>
}

CLASE PromptManagerModule HEREDA BaseModule IMPLEMENTA PromptManagerContract {
  ATRIBUTOS {
    name: String = 'prompt-manager'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    prompts: Map<prompt_id, PromptVersion[]>
    promptMetadata: Map<prompt_id, PromptMetadata>
    promptsDir: String
    config: Object
    internalMetrics: {created_total, updated_total, deleted_total, rendered_total, errors}
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      promptsDir = join(cwd(), 'data/prompts')
      ENSURA_DIR(promptsDir)
      await _loadPrompts()
      LOG module.loaded CON prompts: prompts.size

    async onUnload(): Promise<Void>
      await _savePrompts()
      prompts.clear()
      promptMetadata.clear()
      LOG module.unloaded

    async handleCreatePrompt(data: {name, template, variables, category?, description?}): Promise<Response>
      VALIDA name, template, variables obligatorios
      SI promptMetadata.values().find(m => m.name == data.name): RETORNA 409 CONFLICT_STATE
      prompt_id = crypto.randomUUID()
      version = 1
      prompt = {prompt_id, version, template: data.template, variables: data.variables, created_at: now(), updated_at: now()}
      metadata = {prompt_id, name: data.name, description: data.description || '', category: data.category || 'general', versions: 1, last_rendered_at: null, created_at: now()}
      prompts.set(prompt_id, [prompt])
      promptMetadata.set(prompt_id, metadata)
      await _savePrompts()
      internalMetrics.created_total++
      metrics.increment('prompt-manager.created.total')
      EMITE prompt.creado {prompt_id, name: data.name, version}
      RETORNA {status: 201, data: {prompt_id, version}}

    async handleGetPrompt(data: {prompt_id, version?}): Promise<Response>
      VALIDA prompt_id obligatorio
      versions = prompts.get(data.prompt_id)
      SI !versions: RETORNA 404 RESOURCE_NOT_FOUND
      targetVersion = data.version ? parseInt(data.version) : versions.length
      SI targetVersion < 1 O targetVersion > versions.length: RETORNA 400 INVALID_INPUT
      prompt = versions[targetVersion - 1]
      metadata = promptMetadata.get(data.prompt_id)
      RETORNA {status: 200, data: {...prompt, ...{name: metadata.name, description: metadata.description}}}

    async handleListPrompts(data?: {category?, search?}): Promise<Response>
      list = []
      PARA CADA [id, metadata] EN promptMetadata:
        SI data?.category Y metadata.category != data.category: CONTINÚA
        SI data?.search Y !metadata.name.toLowerCase().includes(data.search.toLowerCase()): CONTINÚA
        versions = prompts.get(id)
        latest = versions[versions.length - 1]
        list.push({prompt_id: id, name: metadata.name, category: metadata.category, version: latest.version, description: metadata.description, created_at: metadata.created_at})
      ORDENA list POR created_at DESC
      RETORNA {status: 200, data: {prompts: list, total: list.length}}

    async handleUpdatePrompt(data: {prompt_id, updates}): Promise<Response>
      VALIDA prompt_id, updates obligatorios
      VALIDA prompts.has(prompt_id)
      versions = prompts.get(data.prompt_id)
      latest = versions[versions.length - 1]
      newVersion = {prompt_id: data.prompt_id, version: latest.version + 1, template: data.updates.template || latest.template, variables: data.updates.variables || latest.variables, created_at: now(), updated_at: now()}
      versions.push(newVersion)
      metadata = promptMetadata.get(data.prompt_id)
      SI data.updates.name: metadata.name = data.updates.name
      SI data.updates.description: metadata.description = data.updates.description
      SI data.updates.category: metadata.category = data.updates.category
      metadata.versions = versions.length
      metadata.updated_at = now()
      await _savePrompts()
      internalMetrics.updated_total++
      metrics.increment('prompt-manager.updated.total')
      EMITE prompt.actualizado {prompt_id: data.prompt_id, version: newVersion.version}
      RETORNA {status: 200, data: newVersion}

    async handleDeletePrompt(data: {prompt_id}): Promise<Response>
      VALIDA prompt_id obligatorio
      prompts.delete(data.prompt_id)
      promptMetadata.delete(data.prompt_id)
      await _savePrompts()
      internalMetrics.deleted_total++
      metrics.increment('prompt-manager.deleted.total')
      EMITE prompt.eliminado {prompt_id: data.prompt_id}
      RETORNA {status: 200, data: {deleted: true}}

    async handleRenderPrompt(data: {prompt_id, variables, version?}): Promise<Response>
      VALIDA prompt_id, variables obligatorios
      versions = prompts.get(data.prompt_id)
      SI !versions: RETORNA 404 RESOURCE_NOT_FOUND
      targetVersion = data.version ? parseInt(data.version) : versions.length
      SI targetVersion < 1 O targetVersion > versions.length: RETORNA 400 INVALID_INPUT
      prompt = versions[targetVersion - 1]
      TRY:
        rendered = _renderTemplate(prompt.template, data.variables)
        metadata = promptMetadata.get(data.prompt_id)
        metadata.last_rendered_at = now()
        internalMetrics.rendered_total++
        metrics.increment('prompt-manager.rendered.total')
        EMITE prompt.renderizado {prompt_id: data.prompt_id, version: prompt.version}
        RETORNA {status: 200, data: {rendered, prompt_id: data.prompt_id, version: prompt.version}}
      CATCH err:
        internalMetrics.errors++
        metrics.increment('prompt-manager.render.failed')
        RETORNA {status: 500, error: {code: 'RENDER_FAILED', message: err.message}}

    async handleForkPrompt(data: {prompt_id, name}): Promise<Response>
      VALIDA prompt_id, name obligatorios
      versions = prompts.get(data.prompt_id)
      SI !versions: RETORNA 404 RESOURCE_NOT_FOUND
      latest = versions[versions.length - 1]
      new_prompt_id = crypto.randomUUID()
      newPrompt = {prompt_id: new_prompt_id, version: 1, template: latest.template, variables: latest.variables, created_at: now(), updated_at: now()}
      newMetadata = {prompt_id: new_prompt_id, name: data.name, description: 'Forked from ' + promptMetadata.get(data.prompt_id).name, category: 'forked', versions: 1, created_at: now()}
      prompts.set(new_prompt_id, [newPrompt])
      promptMetadata.set(new_prompt_id, newMetadata)
      await _savePrompts()
      EMITE prompt.fork {prompt_id: data.prompt_id, new_prompt_id, name: data.name}
      RETORNA {status: 201, data: {new_prompt_id, version: 1}}

    _renderTemplate(template: String, variables: Object): String
      result = template
      PARA CADA [key, value] EN Object.entries(variables):
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
      SI result.includes('{{'):
        LANZA Error('Unresolved template variables')
      RETORNA result

    async _loadPrompts(): Promise<Void>
      SI NOT EXISTS(promptsDir): RETORNA
      entries = readdir(promptsDir)
      PARA CADA entry:
        filePath = join(promptsDir, entry, 'prompt.json')
        SI EXISTS(filePath):
          data = JSON.parse(readFile(filePath))
          prompts.set(data.prompt_id, data.versions)
          promptMetadata.set(data.prompt_id, data.metadata)

    async _savePrompts(): Promise<Void>
      PARA CADA [prompt_id, versions] EN prompts:
        metadata = promptMetadata.get(prompt_id)
        promptDir = join(promptsDir, prompt_id)
        MKDIR(promptDir, {recursive: true})
        writeFile(join(promptDir, 'prompt.json'), JSON.stringify({prompt_id, versions, metadata}, null, 2))

    EVENTOS_PUBLISHES {
      'prompt.creado': {prompt_id, name, version}
      'prompt.actualizado': {prompt_id, version}
      'prompt.eliminado': {prompt_id}
      'prompt.renderizado': {prompt_id, version}
      'prompt.fork': {prompt_id, new_prompt_id, name}
    }

    EVENTOS_SUBSCRIBES {
    }
  }
}

CLASE Prompt {
  ATRIBUTOS {
    prompt_id: String
    version: Integer
    template: String
    variables: Array<{name, type, required, default}>
    created_at: String (ISO)
    updated_at: String (ISO)
  }
}

CLASE PromptMetadata {
  ATRIBUTOS {
    prompt_id: String
    name: String
    description: String
    category: String
    versions: Integer
    last_rendered_at: String|Null (ISO)
    created_at: String (ISO)
    updated_at: String|Null (ISO)
  }
}

CLASE PromptVersion {
  ATRIBUTOS {
    version: Integer
    template: String
    variables: Array
    created_at: String (ISO)
  }
}
```

## RECETARIO-CREATIVO (v2.0.0) — Generación Creativa de Recetas con IA

```
INTERFAZ RecetarioCreativoContract {
  generateReceta(data: {ingredientes: Array, restricciones?, estilos?, preferencias?}): Promise<{receta_id, nombre, ingredientes, instrucciones}>
  listarRecetas(filters?: {estilo?, restriccion?}): Promise<Array<Receta>>
  obtenerReceta(receta_id: String): Promise<Receta>
  validarIngredientes(ingredientes: Array): Promise<{valido, sugerencias?}>
  calcularNutricion(receta_id: String, porciones?: Number): Promise<{calorias, proteinas, grasas, carbohidratos}>
  guardarReceta(receta_id: String, nombre: String): Promise<{saved}>
  buscarPorIngrediente(ingrediente: String): Promise<Array<Receta>>
}

CLASE RecetarioCreativoModule HEREDA BaseModule IMPLEMENTA RecetarioCreativoContract {
  ATRIBUTOS {
    name: String = 'recetario-creativo'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    aiGateway: AIGateway|Null
    recetas: Map<receta_id, Receta>
    ingredientesDB: Map<ingredient_id, Ingrediente>
    config: {
      ai_provider: String,
      temperature: Number,
      max_tokens: Number,
      restrict_allergens: Boolean
    }
    internalMetrics: {generated_total, saved_total, ai_calls, validation_errors}
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      CARGA config FROM context.config['recetario-creativo']
      SI eventBus?.moduleRegistry?.get('ai-gateway'):
        aiGateway = eventBus.moduleRegistry.get('ai-gateway')
      await _loadIngredientes()
      LOG module.loaded CON ai_available: !!aiGateway

    async onUnload(): Promise<Void>
      recetas.clear()
      ingredientesDB.clear()
      LOG module.unloaded

    async handleGenerateReceta(data: {ingredientes, restricciones?, estilos?, preferencias?}): Promise<Response>
      VALIDA ingredientes obligatorio Y array
      valResult = await handleValidarIngredientes({ingredientes: data.ingredientes})
      SI !valResult.data.valido: RETORNA 400 INVALID_INPUT
      SI !aiGateway: RETORNA 503 UPSTREAM_UNREACHABLE
      TRY:
        receta_id = crypto.randomUUID()
        prompt = _buildGenerationPrompt(data.ingredientes, data.restricciones, data.estilos, data.preferencias)
        response = await aiGateway.call(config.ai_provider, 'default', [{role: 'user', content: prompt}], {temperature: config.temperature, maxTokens: config.max_tokens})
        parsed = _parseRecetaResponse(response.content)
        receta = {receta_id, nombre: parsed.nombre, descripcion: parsed.descripcion, ingredientes: parsed.ingredientes, instrucciones: parsed.instrucciones, restricciones: data.restricciones || [], estilos: data.estilos || [], porciones: parsed.porciones || 4, tiempo_preparacion: parsed.tiempo || 30, dificultad: parsed.dificultad || 'media', generada_at: now(), generada_por: 'ai'}
        recetas.set(receta_id, receta)
        internalMetrics.generated_total++
        internalMetrics.ai_calls++
        metrics.increment('recetario.generated.total')
        EMITE receta.generada {receta_id, nombre: receta.nombre, ingredientes: receta.ingredientes.length}
        RETORNA {status: 201, data: {receta_id, nombre: receta.nombre, ingredientes: receta.ingredientes, instrucciones: receta.instrucciones}}
      CATCH err:
        internalMetrics.ai_calls++
        metrics.increment('recetario.generation.failed')
        RETORNA {status: 500, error: {code: 'GENERATION_FAILED', message: err.message}}

    async handleListarRecetas(data?: {estilo?, restriccion?}): Promise<Response>
      list = []
      PARA CADA [, receta] EN recetas:
        SI data?.estilo Y !receta.estilos.includes(data.estilo): CONTINÚA
        SI data?.restriccion Y !receta.restricciones.includes(data.restriccion): CONTINÚA
        list.push({receta_id: receta.receta_id, nombre: receta.nombre, dificultad: receta.dificultad, tiempo_preparacion: receta.tiempo_preparacion})
      ORDENA list POR receta.generada_at DESC
      RETORNA {status: 200, data: {recetas: list, total: list.length}}

    async handleObtenerReceta(data: {receta_id}): Promise<Response>
      VALIDA receta_id obligatorio
      receta = recetas.get(data.receta_id)
      SI !receta: RETORNA 404 RESOURCE_NOT_FOUND
      RETORNA {status: 200, data: receta}

    async handleValidarIngredientes(data: {ingredientes}): Promise<Response>
      VALIDA ingredientes obligatorio
      valido = true
      sugerencias = []
      PARA CADA ingrediente EN data.ingredientes:
        SI !ingredientesDB.has(ingrediente):
          valido = false
          similar = _findSimilarIngrediente(ingrediente)
          SI similar:
            sugerencias.push({ingrediente, sugerencia: similar})
      SI config.restrict_allergens:
        PARA CADA ingrediente EN data.ingredientes:
          allergens = ingredientesDB.get(ingrediente)?.allergens || []
          SI allergens.length > 0:
            sugerencias.push({ingrediente, advertencia: 'Contiene alérgenos'})
      internalMetrics.validation_errors += valido ? 0 : 1
      RETORNA {status: 200, data: {valido, sugerencias}}

    async handleCalcularNutricion(data: {receta_id, porciones?}): Promise<Response>
      VALIDA receta_id obligatorio
      receta = recetas.get(data.receta_id)
      SI !receta: RETORNA 404 RESOURCE_NOT_FOUND
      porciones = parseInt(data.porciones) || receta.porciones
      totales = {calorias: 0, proteinas: 0, grasas: 0, carbohidratos: 0}
      PARA CADA item EN receta.ingredientes:
        nutricion = ingredientesDB.get(item.ingrediente)?.nutricion || {}
        cantidad_factor = item.cantidad / 100
        totales.calorias += (nutricion.calorias || 0) * cantidad_factor
        totales.proteinas += (nutricion.proteinas || 0) * cantidad_factor
        totales.grasas += (nutricion.grasas || 0) * cantidad_factor
        totales.carbohidratos += (nutricion.carbohidratos || 0) * cantidad_factor
      SI porciones != receta.porciones:
        FACTOR = porciones / receta.porciones
        PARA CADA [key, value] EN Object.entries(totales):
          totales[key] = value * FACTOR
      RETORNA {status: 200, data: {receta_id: data.receta_id, porciones, ...totales}}

    async handleGuardarReceta(data: {receta_id, nombre}): Promise<Response>
      VALIDA receta_id, nombre obligatorios
      receta = recetas.get(data.receta_id)
      SI !receta: RETORNA 404 RESOURCE_NOT_FOUND
      receta.nombre = data.nombre
      receta.guardada_at = now()
      internalMetrics.saved_total++
      metrics.increment('recetario.saved.total')
      EMITE receta.guardada {receta_id: data.receta_id, nombre: data.nombre}
      RETORNA {status: 200, data: {saved: true}}

    async handleBuscarPorIngrediente(data: {ingrediente}): Promise<Response>
      VALIDA ingrediente obligatorio
      query = data.ingrediente.toLowerCase()
      resultados = []
      PARA CADA [, receta] EN recetas:
        PARA CADA item EN receta.ingredientes:
          SI item.ingrediente.toLowerCase().includes(query):
            resultados.push({receta_id: receta.receta_id, nombre: receta.nombre, ingrediente: item.ingrediente})
            BREAK
      RETORNA {status: 200, data: {ingrediente: data.ingrediente, resultados, total: resultados.length}}

    _buildGenerationPrompt(ingredientes: Array, restricciones?: Array, estilos?: Array, preferencias?: Object): String
      prompt = `Genera una receta creativa usando los siguientes ingredientes: ${ingredientes.join(', ')}.`
      SI restricciones?.length:
        prompt += ` Restricciones dietéticas: ${restricciones.join(', ')}.`
      SI estilos?.length:
        prompt += ` Estilos culinarios: ${estilos.join(', ')}.`
      SI preferencias:
        SI preferencias.tiempo_maximo:
          prompt += ` Tiempo máximo de preparación: ${preferencias.tiempo_maximo} minutos.`
        SI preferencias.dificultad:
          prompt += ` Nivel de dificultad deseado: ${preferencias.dificultad}.`
      prompt += ` Responde en JSON: {nombre, descripcion, ingredientes: [{ingrediente, cantidad, unidad}], instrucciones: [pasos], porciones, tiempo, dificultad}`
      RETORNA prompt

    _parseRecetaResponse(content: String): Object
      TRY:
        RETORNA JSON.parse(content)
      CATCH:
        jsonMatch = content.match(/\{[\s\S]*\}/)
        SI jsonMatch:
          RETORNA JSON.parse(jsonMatch[0])
        RETORNA {nombre: 'Receta sin nombre', ingredientes: [], instrucciones: ['Ver respuesta completa']}

    _findSimilarIngrediente(ingrediente: String): String|Null
      query = ingrediente.toLowerCase()
      PARA CADA [, ing] EN ingredientesDB:
        SI ing.nombre.toLowerCase().includes(query) O query.includes(ing.nombre.toLowerCase()):
          RETORNA ing.nombre
      RETORNA null

    async _loadIngredientes(): Promise<Void>
      (cargar desde base de datos o archivo hardcoded)
      ingredientesDB.set('tomate', {nombre: 'tomate', nutricion: {calorias: 18, proteinas: 0.9, grasas: 0.2, carbohidratos: 3.9}, allergens: []})

    EVENTOS_PUBLISHES {
      'receta.generada': {receta_id, nombre, ingredientes}
      'receta.guardada': {receta_id, nombre}
    }

    EVENTOS_SUBSCRIBES {
    }
  }
}

CLASE Receta {
  ATRIBUTOS {
    receta_id: String
    nombre: String
    descripcion: String
    ingredientes: Array<{ingrediente, cantidad, unidad}>
    instrucciones: Array<String>
    restricciones: Array<String>
    estilos: Array<String>
    porciones: Integer
    tiempo_preparacion: Integer (minutos)
    dificultad: String (facil|media|dificil)
    generada_at: String (ISO)
    generada_por: String (ai|manual)
    guardada_at: String|Null (ISO)
  }
}

CLASE Ingrediente {
  ATRIBUTOS {
    nombre: String
    nutricion: {calorias, proteinas, grasas, carbohidratos}
    allergens: Array<String>
  }
}
```

## SCHEDULER (v2.0.0) — Jobs y Tasks Periódicas

```
INTERFAZ SchedulerContract {
  scheduleJob(data: {name, cron, action, params?, description?}): Promise<{job_id, ...}>
  listJobs(filters?: {status?, next_run?}): Promise<Array<Job>>
  getJobStatus(job_id: String): Promise<{status, next_run, last_run, executions}>
  cancelJob(job_id: String): Promise<Void>
  executeJobNow(job_id: String): Promise<{execution_id}>
  getJobHistory(job_id: String, limit?: Integer): Promise<Array<Execution>>
}

CLASE SchedulerModule HEREDA BaseModule IMPLEMENTA SchedulerContract {
  ATRIBUTOS {
    name: String = 'scheduler'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    jobs: Map<job_id, ScheduledJob>
    executions: Map<execution_id, Execution>
    _cronJobs: Map<job_id, CronJob>
    config: {
      max_concurrent_jobs: Integer,
      job_timeout_ms: Integer,
      max_history_entries: Integer,
      cleanup_interval_ms: Integer
    }
    internalMetrics: {scheduled_total, executed_total, failed_total, cancelled_total}
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      CARGA config FROM context.config['scheduler']
      REQUIERE cron library
      await _loadJobs()
      _startCleanupTimer()
      LOG module.loaded CON jobs: jobs.size

    async onUnload(): Promise<Void>
      _cronJobs.forEach(job => job.stop())
      _cronJobs.clear()
      await _saveJobs()
      jobs.clear()
      LOG module.unloaded

    async handleScheduleJob(data: {name, cron, action, params?, description?}): Promise<Response>
      VALIDA name, cron, action obligatorios
      VALIDA_CRON_EXPRESSION(data.cron)
      job_id = crypto.randomUUID()
      job = {job_id, name: data.name, cron: data.cron, action: data.action, params: data.params || {}, description: data.description || '', status: 'scheduled', created_at: now(), executions: 0, last_run: null, last_error: null, next_run: null}
      jobs.set(job_id, job)
      cronJob = new CronJob(data.cron, () => _executeJob(job_id), null, true)
      _cronJobs.set(job_id, cronJob)
      job.next_run = cronJob.nextDate().toISOString()
      await _saveJobs()
      internalMetrics.scheduled_total++
      metrics.increment('scheduler.scheduled.total')
      EMITE job.programado {job_id, name: data.name, cron: data.cron, next_run: job.next_run}
      RETORNA {status: 201, data: {job_id, name: data.name, cron: data.cron, next_run: job.next_run}}

    async handleListJobs(data?: {status?, next_run?}): Promise<Response>
      list = []
      PARA CADA [, job] EN jobs:
        SI data?.status Y job.status != data.status: CONTINÚA
        list.push({job_id: job.job_id, name: job.name, cron: job.cron, status: job.status, next_run: job.next_run, last_run: job.last_run})
      ORDENA list POR next_run ASC
      RETORNA {status: 200, data: {jobs: list, total: list.length}}

    async handleGetJobStatus(data: {job_id}): Promise<Response>
      VALIDA job_id obligatorio
      job = jobs.get(data.job_id)
      SI !job: RETORNA 404 RESOURCE_NOT_FOUND
      recentExecutions = Array.from(executions.values()).filter(e => e.job_id == data.job_id).slice(0, 5)
      RETORNA {status: 200, data: {job_id: data.job_id, status: job.status, next_run: job.next_run, last_run: job.last_run, executions: job.executions, recent: recentExecutions}}

    async handleCancelJob(data: {job_id}): Promise<Response>
      VALIDA job_id obligatorio
      job = jobs.get(data.job_id)
      SI !job: RETORNA 404 RESOURCE_NOT_FOUND
      cronJob = _cronJobs.get(data.job_id)
      SI cronJob: cronJob.stop()
      _cronJobs.delete(data.job_id)
      job.status = 'cancelled'
      internalMetrics.cancelled_total++
      metrics.increment('scheduler.cancelled.total')
      EMITE job.cancelado {job_id: data.job_id}
      RETORNA {status: 200, data: {cancelled: true}}

    async handleExecuteJobNow(data: {job_id}): Promise<Response>
      VALIDA job_id obligatorio
      job = jobs.get(data.job_id)
      SI !job: RETORNA 404 RESOURCE_NOT_FOUND
      execution_id = await _executeJob(data.job_id)
      RETORNA {status: 202, data: {execution_id, job_id: data.job_id}}

    async handleGetJobHistory(data: {job_id, limit?}): Promise<Response>
      VALIDA job_id obligatorio
      limit = parseInt(data.limit) || 50
      jobExecutions = Array.from(executions.values()).filter(e => e.job_id == data.job_id).sort((a, b) => b.started_at - a.started_at).slice(0, limit)
      RETORNA {status: 200, data: {job_id: data.job_id, executions: jobExecutions, total: jobExecutions.length}}

    async _executeJob(job_id: String): Promise<String>
      job = jobs.get(job_id)
      SI !job: RETORNA null
      execution_id = crypto.randomUUID()
      execution = {execution_id, job_id, status: 'running', started_at: now(), completed_at: null, result: null, error: null}
      executions.set(execution_id, execution)
      EMITE job.ejecutando {job_id, execution_id}
      TRY:
        timeout = setTimeout(() => {
          SI execution.status == 'running':
            execution.status = 'timeout'
            execution.error = 'Execution timeout'
            internalMetrics.failed_total++
            EMITE job.timeout {job_id, execution_id}
        }, config.job_timeout_ms)
        result = await _performAction(job.action, job.params)
        clearTimeout(timeout)
        execution.status = 'completed'
        execution.result = result
        execution.completed_at = now()
        job.executions++
        job.last_run = execution.started_at
        job.last_error = null
        job.next_run = _cronJobs.get(job_id)?.nextDate().toISOString()
        internalMetrics.executed_total++
        metrics.increment('scheduler.executed.total')
        EMITE job.ejecutado {job_id, execution_id, result}
      CATCH err:
        execution.status = 'failed'
        execution.error = err.message
        execution.completed_at = now()
        job.last_error = err.message
        internalMetrics.failed_total++
        metrics.increment('scheduler.execution.failed')
        EMITE job.error {job_id, execution_id, error: err.message}
      SI executions.size > config.max_history_entries:
        oldest = Array.from(executions.entries()).sort((a, b) => a[1].started_at - b[1].started_at)[0][0]
        executions.delete(oldest)
      RETORNA execution_id

    async _performAction(action: String, params: Object): Promise<Any>
      SI action == 'emit_event':
        await eventBus.publish(params.event_name, params.event_data || {})
        RETORNA {success: true}
      SI action == 'call_handler':
        handler = eventBus.moduleRegistry?.get(params.module)?.getHandler(params.handler_name)
        SI handler:
          RETORNA await handler(params.args || {})
      SI action == 'http_request':
        response = await fetch(params.url, {method: params.method || 'GET', body: params.body ? JSON.stringify(params.body) : null})
        RETORNA await response.json()
      LANZA Error(`Unknown action: ${action}`)

    _validateCronExpression(expr: String): Boolean
      TRY:
        new CronJob(expr, () => {})
        RETORNA true
      CATCH:
        RETORNA false

    async _loadJobs(): Promise<Void>
      (cargar jobs desde persistencia)

    async _saveJobs(): Promise<Void>
      (guardar jobs a persistencia)

    _startCleanupTimer(): Void
      timer = setInterval(() => {
        cutoff = now() - (30 * 24 * 60 * 60 * 1000)
        toDelete = []
        PARA CADA [id, exec] EN executions:
          SI exec.completed_at < cutoff:
            toDelete.push(id)
        toDelete.forEach(id => executions.delete(id))
      }, config.cleanup_interval_ms)

    EVENTOS_PUBLISHES {
      'job.programado': {job_id, name, cron, next_run}
      'job.ejecutando': {job_id, execution_id}
      'job.ejecutado': {job_id, execution_id, result}
      'job.error': {job_id, execution_id, error}
      'job.timeout': {job_id, execution_id}
      'job.cancelado': {job_id}
    }

    EVENTOS_SUBSCRIBES {
    }
  }
}

CLASE ScheduledJob {
  ATRIBUTOS {
    job_id: String
    name: String
    cron: String
    action: String (emit_event|call_handler|http_request)
    params: Object
    description: String
    status: String (scheduled|cancelled|error)
    created_at: String (ISO)
    executions: Integer
    last_run: String|Null (ISO)
    last_error: String|Null
    next_run: String|Null (ISO)
  }
}

CLASE Execution {
  ATRIBUTOS {
    execution_id: String
    job_id: String
    status: String (running|completed|failed|timeout)
    started_at: String (ISO)
    completed_at: String|Null (ISO)
    result: Any|Null
    error: String|Null
  }
}
```
