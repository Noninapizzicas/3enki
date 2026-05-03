/**
 * Carta Marketing v1.0.0 — Equipo de marketing silencioso
 *
 * Escucha carta.actualizada y automáticamente enriquece, pule y mejora
 * cada carta según el perfil de marca del proyecto.
 *
 * Responsabilidades:
 *   1. Perfil de marca por proyecto (construido via chat/onboarding)
 *   2. Dispatch automático de agentes cuando una carta cambia
 *   3. Prevención de loops (no reprocesar sus propios cambios)
 *   4. Aprendizaje: guardar decisiones y feedback para mejorar con el tiempo
 *
 * No hace el trabajo creativo directamente — lanza agentes especializados:
 *   - marketing-onboarding: entrevista inicial para construir perfil
 *   - marketing-copywriter: descripciones, tono, lenguaje
 *   - marketing-strategist: ingeniería de menú, orden, productos estrella
 *   - marketing-brand-keeper: coherencia de marca, revisión final
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class CartaMarketingModule {
  constructor() {
    this.name = 'carta-marketing';
    this.version = '1.0.0';

    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Multi-tenant: project_id → perfil de marca
    this.perfilesPerProject = new Map();
    // project_id → base path
    this.projectPaths = new Map();
    // Hash de la última carta procesada por marketing (para evitar loops)
    // project_id:carta_id → hash
    this.processedHashes = new Map();
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.perfilesPerProject.clear();
    this.projectPaths.clear();
    this.processedHashes.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Project Lifecycle
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, resolvedBase);
    }

    await this.loadPerfil(project_id);
    this.logger.info('carta-marketing.project.activated', {
      project_id,
      tiene_perfil: this.perfilesPerProject.has(project_id)
    });
  }

  async onProjectDeactivated(event) {
    // Keep data — multi-tenant
  }

  // ==========================================
  // Perfil de Marca — Persistencia
  // ==========================================

  perfilPathFor(projectId) {
    const basePath = this.projectPaths.get(projectId);
    if (!basePath) return null;
    return path.join(basePath, 'storage', 'config', 'marca.json');
  }

  defaultPerfil() {
    return {
      nombre: null,
      tono: null,
      idioma: 'es',
      publico: null,
      valores: null,
      colores: {},
      prohibido: null,
      referencia_visual: null,
      notas: [],
      onboarding_completado: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async loadPerfil(projectId) {
    const filePath = this.perfilPathFor(projectId);
    if (!filePath) {
      this.perfilesPerProject.set(projectId, this.defaultPerfil());
      return;
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      this.perfilesPerProject.set(projectId, JSON.parse(content));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('carta-marketing.perfil.load_error', { project_id: projectId, error: err.message });
      }
      this.perfilesPerProject.set(projectId, this.defaultPerfil());
    }
  }

  async savePerfil(projectId) {
    const filePath = this.perfilPathFor(projectId);
    if (!filePath) return;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const perfil = this.getPerfil(projectId);
      perfil.updated_at = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(perfil, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error('carta-marketing.perfil.save_error', { project_id: projectId, error: err.message });
    }
  }

  getPerfil(projectId) {
    return this.perfilesPerProject.get(projectId) || this.defaultPerfil();
  }

  // ==========================================
  // Loop Prevention
  // ==========================================

  cartaHash(carta) {
    const content = JSON.stringify({
      productos: (carta.productos || []).map(p => ({ id: p.id, nombre: p.nombre, precio: p.precio })),
      categorias: (carta.categorias || []).map(c => ({ id: c.id, nombre: c.nombre }))
    });
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
  }

  wasProcessedByMe(projectId, cartaId, hash) {
    const key = `${projectId}:${cartaId}`;
    return this.processedHashes.get(key) === hash;
  }

  markProcessed(projectId, cartaId, hash) {
    const key = `${projectId}:${cartaId}`;
    this.processedHashes.set(key, hash);
  }

  // ==========================================
  // Listener: carta.actualizada → dispatch agentes
  // ==========================================

  async onCartaActualizada(event) {
    const data = event?.data || event?.payload || event;
    const cartaId = data?.meta?.id;
    const projectId = data?.project_id;

    if (!cartaId || !projectId) return;

    // Loop prevention: si el hash no cambió, fui yo
    const hash = this.cartaHash(data);
    if (this.wasProcessedByMe(projectId, cartaId, hash)) {
      this.logger.debug('carta-marketing.skip.own_change', { carta_id: cartaId, project_id: projectId });
      return;
    }

    const perfil = this.getPerfil(projectId);

    // Si no hay perfil de marca, no hacer nada (necesita onboarding primero)
    if (!perfil.onboarding_completado) {
      this.logger.debug('carta-marketing.skip.no_perfil', { project_id: projectId });
      return;
    }

    // Detectar qué necesita trabajo
    const necesidades = this.detectarNecesidades(data);

    if (necesidades.length === 0) {
      this.logger.debug('carta-marketing.skip.nada_que_hacer', { carta_id: cartaId });
      this.markProcessed(projectId, cartaId, hash);
      return;
    }

    this.logger.info('carta-marketing.procesando', {
      carta_id: cartaId, project_id: projectId,
      necesidades: necesidades.map(n => n.tipo)
    });

    // Dispatch agentes según necesidades
    for (const necesidad of necesidades) {
      await this.dispatchAgente(necesidad, cartaId, projectId, perfil);
    }

    // Marcar como procesado DESPUÉS de dispatch (el agente guardará con carta.save
    // y el hash cambiará — pero ese nuevo hash se marcará cuando el evento vuelva)
    this.markProcessed(projectId, cartaId, hash);
    this.metrics?.increment('carta-marketing.procesado');
  }

  // ==========================================
  // Detección de necesidades
  // ==========================================

  detectarNecesidades(carta) {
    const necesidades = [];
    const productos = carta.productos || [];

    // Productos sin descripción
    const sinDescripcion = productos.filter(p => !p.descripcion);
    if (sinDescripcion.length > 0) {
      necesidades.push({
        tipo: 'copywriting',
        agente: 'marketing-copywriter',
        productos: sinDescripcion.map(p => p.id),
        count: sinDescripcion.length
      });
    }

    // Carta con muchos productos sin orden optimizado (strategist)
    if (productos.length >= 5) {
      const sinTags = productos.filter(p => !p.tags || p.tags.length === 0);
      if (sinTags.length > productos.length * 0.5) {
        necesidades.push({
          tipo: 'strategy',
          agente: 'marketing-strategist',
          count: productos.length
        });
      }
    }

    // Siempre: brand-keeper como revisión final (si hay otro trabajo que hacer)
    if (necesidades.length > 0) {
      necesidades.push({
        tipo: 'brand-review',
        agente: 'marketing-brand-keeper'
      });
    }

    return necesidades;
  }

  // ==========================================
  // Dispatch de agentes
  // ==========================================

  async dispatchAgente(necesidad, cartaId, projectId, perfil) {
    await this.eventBus.publish('agent.execute.request', {
      correlation_id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      user_id: 'system',
      agent_name: necesidad.agente,
      project_id: projectId,
      timestamp: new Date().toISOString(),
      context: {
        carta_id: cartaId,
        perfil_marca: perfil,
        necesidad: necesidad
      },
      task: this.buildTask(necesidad, cartaId, perfil)
    });

    this.logger.info('carta-marketing.agent.dispatched', {
      agente: necesidad.agente, tipo: necesidad.tipo,
      carta_id: cartaId, project_id: projectId
    });
  }

  buildTask(necesidad, cartaId, perfil) {
    const tono = perfil.tono || 'cercano y natural';
    const idioma = perfil.idioma || 'es';

    switch (necesidad.tipo) {
      case 'copywriting':
        return `Enriquece los productos de la carta "${cartaId}" que no tienen descripción. Tono: ${tono}. Idioma: ${idioma}. Usa carta.get para cargar la carta y carta.save para guardar los cambios.`;
      case 'strategy':
        return `Revisa la carta "${cartaId}" como experto en ingeniería de menú. Analiza orden de categorías, identifica productos estrella, sugiere tags. Usa carta.get y carta.save.`;
      case 'brand-review':
        return `Revisa la carta "${cartaId}" para coherencia de marca. Perfil: ${perfil.nombre || 'sin nombre'}. Tono: ${tono}. Verifica que todo sea consistente. Usa carta.get y carta.save.`;
      default:
        return `Procesa la carta "${cartaId}" según la necesidad: ${necesidad.tipo}.`;
    }
  }

  // ==========================================
  // Tools — Perfil de marca
  // ==========================================

  async toolGetPerfil({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const perfil = this.getPerfil(project_id);
    return { status: 200, data: perfil };
  }

  async toolUpdatePerfil({ project_id, ...campos }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const perfil = this.getPerfil(project_id);

    // Actualizar solo los campos proporcionados
    for (const [key, value] of Object.entries(campos)) {
      if (key !== 'project_id' && value !== undefined) {
        perfil[key] = value;
      }
    }

    this.perfilesPerProject.set(project_id, perfil);
    await this.savePerfil(project_id);

    this.logger.info('carta-marketing.perfil.updated', {
      project_id, campos: Object.keys(campos).filter(k => k !== 'project_id')
    });

    return {
      status: 200,
      data: { perfil, message: 'Perfil de marca actualizado.' }
    };
  }

  async toolCompletarOnboarding({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const perfil = this.getPerfil(project_id);
    perfil.onboarding_completado = true;
    this.perfilesPerProject.set(project_id, perfil);
    await this.savePerfil(project_id);

    this.logger.info('carta-marketing.onboarding.completado', { project_id });

    return {
      status: 200,
      data: { message: 'Onboarding completado. Marketing empezará a trabajar automáticamente en cada cambio de carta.' }
    };
  }

  async toolGetActividad({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    // Contar cuántas cartas ha procesado para este proyecto
    let procesadas = 0;
    for (const [key] of this.processedHashes) {
      if (key.startsWith(`${project_id}:`)) procesadas++;
    }

    return {
      status: 200,
      data: {
        project_id,
        cartas_procesadas: procesadas,
        perfil_completado: this.getPerfil(project_id).onboarding_completado
      }
    };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGetPerfil(data) {
    return (await this.toolGetPerfil({ project_id: data?.project_id })).data;
  }

  async handleUpdatePerfil(data) {
    const result = await this.toolUpdatePerfil(data);
    if (result.error) throw { status: result.status || 400, code: 'UPDATE_ERROR', message: result.error };
    return result.data;
  }

  async handleGetActividad(data) {
    return (await this.toolGetActividad({ project_id: data?.project_id })).data;
  }

  async handleHealth() {
    return {
      status: 'healthy', module: this.name, version: this.version,
      proyectos_con_perfil: this.perfilesPerProject.size
    };
  }
}

module.exports = CartaMarketingModule;
