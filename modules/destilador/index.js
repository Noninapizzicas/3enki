/**
 * destilador — el MINERO del lazo de aprendizaje (paso 1, solo reflejo).
 *
 * Hermano de propiocepcion: escucha el bus crudo (mqtt.on('message')) pero no
 * guarda QUE paso, sino que detecta CUANDO un PATRON DE RESOLUCION se repite.
 *
 * Como: agrupa los eventos del scope por correlation_id en "trazas" (la cadena
 * causal de una resolucion). Cierra la traza con un evento terminal o por
 * inactividad, la reduce a una FIRMA (la secuencia normalizada de dominio.op,
 * sin ids ni verbos request/response) y cuenta cuantas trazas DISTINTAS comparten
 * esa firma. Cuando una firma cruza el umbral de recurrencia, emite
 * 'aprendizaje.candidata.detectada' — la senal que (en el paso 2) disparara al
 * blueprint a redactar una skill.
 *
 * Paso 1 = SOLO la mineria. Sin blueprint, sin cola, sin escribir skills. El
 * objetivo es OBSERVAR las firmas que emergen (listar_clusters) y comprobar que
 * son patrones de verdad antes de cablear la redaccion automatica.
 *
 * Determinista de punta a punta: la firma sale de la secuencia, jamas de prosa.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

class DestiladorModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'destilador';
    this.version = '0.6.0';

    // Inyectados en onLoad
    this.config = null;

    // Interruptor on/off (panel central). El lazo de aprendizaje solo MINA si activo.
    // Default real se fija en onLoad (ON salvo config.enabled:false); el panel manda en caliente.
    this.activo = false;

    // Estado runtime — facultad MINERO (paso 1)
    this.trazas = new Map();      // groupKey -> { project_id, pasos:[], firstTs, lastTs }
    this.clusters = new Map();    // `${project}::${firma}` -> Cluster
    this.dirty = new Set();       // project_ids con clusters sin flushear
    this.pendingFsReads = new Map();
    this._onBusMessage = null;
    this._flushTimer = null;

    // Estado runtime — facultad COLA+PUBLICADOR (paso 2)
    this.cola = new Map();        // candidata_id -> Candidata
    this.colaPath = '/_destilador/cola.json';

    // Estado runtime — facultad AUTO-MEJORA (paso 3)
    this.skillStats = new Map();  // `${project}::${skill}` -> { ventana:[], revision_emitida }
    this.saludPath = '/_destilador/skills_salud.json';
    this.ventanaDesenlaces = 10;  // ultimos N desenlaces por skill
    this.umbralTasa = 0.5;        // fail_rate >= esto -> revision
    this.minMuestras = 3;         // no juzgar con menos de N aplicaciones

    // Derivados de config (rellenos en onLoad)
    this.scope = new Set();
    this.umbral = 3;
    this.minPasos = 1;
    this.ventanaMs = 60000;       // traza inactiva > ventana -> se cierra
    this.maxTrazas = 500;
    this.archivoPath = '/_destilador/clusters.json';
  }

  // =============================================================
  // Lifecycle
  // =============================================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.config = context.moduleConfig || {};

    this.scope = new Set(this.config.scope_modulos || []);
    this.umbral = Number(this.config.umbral_recurrencia) || 3;
    this.minPasos = Number(this.config.min_pasos) || 1;
    this.ventanaMs = Number(this.config.ventana_traza_ms) || 60000;
    this.maxTrazas = Number(this.config.max_trazas_abiertas) || 500;
    this.archivoPath = this.config.archivo_path || '/_destilador/clusters.json';
    this.colaPath = this.config.cola_path || '/_destilador/cola.json';
    // Las skills se SELLAN en cúpulas (memoria de Enki, por proyecto), no en
    // .claude/skills (memoria de Claude Code). Ver handleAprobar.
    this.saludPath = this.config.salud_path || '/_destilador/skills_salud.json';
    this.ventanaDesenlaces = Number(this.config.ventana_desenlaces) || 10;
    const uf = this.config.umbral_fallo || {};
    this.umbralTasa = Number(uf.tasa) || 0.5;
    this.minMuestras = Number(uf.min_muestras) || 3;

    // Interruptor: ON salvo que la config lo apague. El estado persistido del panel
    // manda en caliente vía interruptor.cambiado (el dueño reacciona sin reinicio).
    this.activo = this.config.enabled !== false;
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'destilador', label: 'Destilador (lazo de aprendizaje)', grupo: 'aprendizaje',
        descripcion: 'Mina el bus, detecta patrones de resolucion recurrentes y redacta skills candidatas. OFF = no aprende (cero captura); ver/aprobar lo ya recogido sigue disponible.',
        default: this.activo
      });
    } catch (_) { /* el registro puede no estar aun; se re-registra al recargar */ }

    this._startBusCapture();

    const flushMs = Number(this.config.flush_interval_ms) || 10000;
    this._flushTimer = setInterval(() => this._tick(), flushMs);

    this.logger.info('destilador.loaded', {
      module: this.name, version: this.version,
      scope: this.scope.size, umbral: this.umbral, ventana_ms: this.ventanaMs
    });
  }

  async onUnload() {
    this._stopBusCapture();
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = null;
    this._cerrarTrazasInactivas(0); // cierra todo lo abierto
    await this._flushDirty();
    for (const { timeout } of this.pendingFsReads.values()) clearTimeout(timeout);
    this.pendingFsReads.clear();
    this.trazas.clear();
    this.clusters.clear();
    this.cola.clear();
    this.skillStats.clear();
    this.dirty.clear();
    this.logger.info('destilador.unloaded', { module: this.name });
  }

  // =============================================================
  // Captura del bus (la mineria)
  // =============================================================

  _startBusCapture() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || typeof mqtt.on !== 'function') {
      this.logger.warn('destilador.bus.unavailable', { reason: 'eventBus.mqtt sin on()' });
      return;
    }
    this._onBusMessage = (topic, message) => {
      try { this._capturar(topic, message); }
      catch (_) { this.metrics?.increment('destilador.errors.total', { kind: 'capture' }); }
    };
    mqtt.on('message', this._onBusMessage);
    this.logger.info('destilador.bus.captured', {});
  }

  _stopBusCapture() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onBusMessage && typeof mqtt.removeListener === 'function') {
      mqtt.removeListener('message', this._onBusMessage);
    }
    this._onBusMessage = null;
  }

  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id !== 'destilador') return;
    this.activo = !!d.enabled;
    this.logger?.warn('destilador.toggled', { activo: this.activo });
  }

  _capturar(topic, message) {
    if (!this.activo) return;                         // OFF: no mina (cero captura, no-op puro)
    const env = this._parseEnvelope(message);
    if (!env) return;
    const eventType = env.event_type || this._eventTypeFromTopic(topic);
    if (!eventType) return;
    const data = env.data || {};

    // ── facultad AUTO-MEJORA (paso 3): la senal de que una skill entro en juego.
    // No es un paso de firma — es metadato que ETIQUETA la traza de su resolucion.
    if (eventType === 'skill.aplicada') {
      this._etiquetarSkill(data, env);
      return;
    }

    const domain = String(eventType).split('.')[0];
    if (!this.scope.has(domain)) return;            // solo el mundo del scope

    const projectId = data.project_id || data.projectId || null;
    if (!projectId) return;                         // patrones por proyecto

    const correlationId = data.correlation_id || env?.metadata?.correlation_id || null;
    const eventId = env.event_id || crypto.randomUUID();
    // Con correlation_id: la traza acumula la cadena causal. Sin el: evento
    // suelto -> traza de 1 paso con clave propia (igual cuenta para su firma).
    const groupKey = correlationId ? `corr:${correlationId}` : `solo:${eventId}`;
    const norm = this._normalizarEvento(eventType);

    const traza = this._getOrCreateTraza(groupKey, projectId);
    // dedup de pasos consecutivos identicos (ruido de re-emisiones)
    if (traza.pasos[traza.pasos.length - 1] !== norm) traza.pasos.push(norm);
    traza.lastTs = Date.now();
    // un fallo dentro de la traza marca su desenlace (paso 3)
    if (/\.(failed|error)$/.test(eventType)) traza.fallo = true;

    this.metrics?.increment('destilador.capturado.total', { modulo: domain });
    // La traza la cierra la INACTIVIDAD (la ventana en _tick), no el sufijo del
    // evento: un .response intermedio (una lectura RPC) no es fin de resolucion.
  }

  _getOrCreateTraza(groupKey, projectId) {
    let traza = this.trazas.get(groupKey);
    if (!traza) {
      traza = { project_id: projectId, pasos: [], skills: null, fallo: false,
                firstTs: Date.now(), lastTs: Date.now() };
      this.trazas.set(groupKey, traza);
      if (this.trazas.size > this.maxTrazas) this._evictTrazaMasVieja();
    }
    return traza;
  }

  _etiquetarSkill(data, env) {
    const correlationId = data.correlation_id || env?.metadata?.correlation_id || null;
    const projectId = data.project_id || data.projectId || null;
    if (!correlationId || !data.skill || !projectId) {
      this.metrics?.increment('destilador.skill.sin_correlacion');
      return;
    }
    const traza = this._getOrCreateTraza(`corr:${correlationId}`, projectId);
    (traza.skills || (traza.skills = new Set())).add(String(data.skill));
    traza.lastTs = Date.now();
  }

  // dominio.op.response -> dominio.op  (quita verbo de transporte + minuscula)
  _normalizarEvento(eventType) {
    const sinVerbo = String(eventType)
      .replace(/\.(request|response|failed|completado|resuelto)$/i, '');
    return sinVerbo.toLowerCase();
  }

  _tick() {
    this._cerrarTrazasInactivas(this.ventanaMs);
    this._flushDirty();
  }

  _cerrarTrazasInactivas(ventanaMs) {
    const ahora = Date.now();
    for (const [groupKey, t] of this.trazas) {
      if (ahora - t.lastTs >= ventanaMs) this._cerrarTraza(groupKey);
    }
  }

  _evictTrazaMasVieja() {
    let viejaKey = null; let viejaTs = Infinity;
    for (const [k, t] of this.trazas) {
      if (t.firstTs < viejaTs) { viejaTs = t.firstTs; viejaKey = k; }
    }
    if (viejaKey) this._cerrarTraza(viejaKey); // cerrarla cuenta, no se pierde
  }

  // Cierra una traza: la reduce a firma y la suma a su cluster.
  _cerrarTraza(groupKey) {
    const traza = this.trazas.get(groupKey);
    if (!traza) return;
    this.trazas.delete(groupKey);

    const firma = this._firmar(traza.pasos);
    // facultad AUTO-MEJORA (paso 3): evalua las skills aplicadas en esta traza
    // ANTES del filtro de firma — una traza con skill puede no llegar a minPasos.
    this._evaluarSkills(traza, groupKey, firma);

    if (traza.pasos.length < this.minPasos) return; // demasiado corta para ser patron

    const clusterKey = `${traza.project_id}::${firma}`;
    let cluster = this.clusters.get(clusterKey);
    if (!cluster) {
      cluster = {
        firma, project_id: traza.project_id, secuencia: traza.pasos.slice(),
        ocurrencias: 0, grupos: [], primera_ts: new Date().toISOString(),
        ultima_ts: null, emitida: false
      };
      this.clusters.set(clusterKey, cluster);
    }
    cluster.ocurrencias++;
    cluster.ultima_ts = new Date().toISOString();
    if (cluster.grupos.length < 20) cluster.grupos.push(groupKey);
    this.dirty.add(traza.project_id);

    this.metrics?.increment('destilador.traza.cerrada.total', { pasos: traza.pasos.length });

    if (!cluster.emitida && cluster.ocurrencias >= this.umbral) {
      cluster.emitida = true;
      this._emitirCandidata(cluster);
    }
  }

  _firmar(pasos) {
    const repr = JSON.stringify(pasos);
    return crypto.createHash('sha1').update(repr).digest('hex').slice(0, 16);
  }

  _emitirCandidata(cluster) {
    try {
      this.eventBus.publish('aprendizaje.candidata.detectada', {
        firma: cluster.firma,
        project_id: cluster.project_id,
        secuencia: cluster.secuencia,
        ocurrencias: cluster.ocurrencias,
        grupos: cluster.grupos.slice(),
        correlation_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      });
      this.metrics?.increment('destilador.candidata.detectada.total');
      this.logger.info('destilador.candidata.detectada', {
        firma: cluster.firma, project_id: cluster.project_id,
        ocurrencias: cluster.ocurrencias, secuencia: cluster.secuencia
      });
    } catch (err) {
      this.metrics?.increment('destilador.errors.total', { kind: 'emit' });
      this.logger.error('destilador.candidata.emit.failed', { error: err.message });
    }
  }

  // =============================================================
  // Facultad AUTO-MEJORA (paso 3) — capitaliza el FALLO recurrente.
  // El Minero capitaliza el acierto (firma recurrente); esto capitaliza el
  // fallo: una skill que, tras aplicarse, lleva a fallo demasiadas veces se
  // marca para re-redaccion (vuelve por la misma guardia humana del paso 2).
  // =============================================================

  _evaluarSkills(traza, groupKey, firma) {
    // SELF-TAG (cierra el nervio skill.aplicada INTERNAMENTE): si la firma de esta traza coincide
    // con la de una skill APROBADA, cuenta como APLICADA. El destilador SIENTE sus skills sin
    // depender de un emisor externo. (_etiquetarSkill sigue ahí para señales externas, si llegan.)
    if (firma) {
      for (const cand of this.cola.values()) {
        if (cand && cand.estado === 'aprobada' && cand.firma === firma && cand.nombre_skill) {
          (traza.skills || (traza.skills = new Set())).add(cand.nombre_skill);
        }
      }
    }
    if (!traza.skills || traza.skills.size === 0) return;
    const desenlace = traza.fallo ? 'fail' : 'ok';
    const corr = String(groupKey || '').replace(/^(corr:|solo:)/, '');
    for (const skill of traza.skills) {
      const key = `${traza.project_id}::${skill}`;
      let st = this.skillStats.get(key);
      if (!st) { st = { project_id: traza.project_id, skill, ventana: [], trazas_fallidas: [], revision_emitida: false }; this.skillStats.set(key, st); }
      st.ventana.push(desenlace);
      while (st.ventana.length > this.ventanaDesenlaces) st.ventana.shift();
      if (desenlace === 'fail' && corr) {
        st.trazas_fallidas.push(corr);
        while (st.trazas_fallidas.length > this.ventanaDesenlaces) st.trazas_fallidas.shift();
      }

      const fails = st.ventana.filter(d => d === 'fail').length;
      const tasa = fails / st.ventana.length;
      this.metrics?.increment('destilador.skill.desenlace', { desenlace });

      if (st.ventana.length >= this.minMuestras && tasa >= this.umbralTasa) {
        if (!st.revision_emitida) {
          st.revision_emitida = true;
          this._emitirRevision(skill, traza.project_id, tasa, st);
        }
      } else if (st.revision_emitida && tasa < this.umbralTasa) {
        st.revision_emitida = false;            // histeresis: la skill se recupero
      }
      this.dirty.add(traza.project_id);
    }
    this._persistirSalud(traza.project_id);
  }

  _emitirRevision(skill, projectId, tasa, st) {
    const fails = st.ventana.filter(d => d === 'fail').length;
    try {
      this.eventBus.publish('aprendizaje.revision.requerida', {
        skill, project_id: projectId, tasa_fallo: this._round(tasa, 2),
        muestras: st.ventana.length,
        trazas_fallidas: (st.trazas_fallidas || []).slice(),
        motivo: `${fails} de ${st.ventana.length} aplicaciones fallaron`,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this.metrics?.increment('destilador.revision.requerida.total');
      this.logger.info('destilador.revision.requerida', { skill, project_id: projectId, tasa_fallo: this._round(tasa, 2) });
    } catch (err) {
      this.metrics?.increment('destilador.errors.total', { kind: 'revision_emit' });
    }
  }

  _persistirSalud(projectId) {
    if (!projectId) return;
    try {
      const skills = Array.from(this.skillStats.values()).filter(s => s.project_id === projectId);
      const content = JSON.stringify(
        { _version: 1, _updated: new Date().toISOString(), skills }, null, 0);
      this.eventBus.publish('fs.write.request', {
        project_id: projectId, path: this.saludPath, content, request_id: crypto.randomUUID()
      });
    } catch (_) {
      this.metrics?.increment('destilador.errors.total', { kind: 'salud_flush' });
    }
  }

  async handleListarSaludSkills(data) {
    try {
      const { project_id } = data || {};
      if (!project_id) return this._invalid('project_id');
      const skills = Array.from(this.skillStats.values())
        .filter(s => s.project_id === project_id)
        .map(s => {
          const fails = s.ventana.filter(d => d === 'fail').length;
          return {
            skill: s.skill, muestras: s.ventana.length, fallos: fails,
            tasa_fallo: s.ventana.length ? this._round(fails / s.ventana.length, 2) : 0,
            en_revision: s.revision_emitida
          };
        })
        .sort((a, b) => b.tasa_fallo - a.tasa_fallo);
      return { status: 200, data: { project_id, total: skills.length, skills } };
    } catch (err) {
      return this._handleHandlerError('destilador.listar_salud_skills.failed', err, 'listar_salud_skills');
    }
  }

  // =============================================================
  // Persistencia (se apoya en el reflejo fs, como propiocepcion)
  // =============================================================

  async _flushDirty() {
    if (this.dirty.size === 0) return;
    const proyectos = Array.from(this.dirty);
    this.dirty.clear();
    for (const projectId of proyectos) {
      try {
        const clusters = this._clustersDeProyecto(projectId);
        const content = JSON.stringify(
          { _version: 1, _updated: new Date().toISOString(), clusters }, null, 0);
        this.eventBus.publish('fs.write.request', {
          project_id: projectId, path: this.archivoPath, content,
          request_id: crypto.randomUUID()
        });
        this.metrics?.increment('destilador.flush.total');
      } catch (_) {
        this.dirty.add(projectId);
        this.metrics?.increment('destilador.errors.total', { kind: 'flush' });
      }
    }
  }

  _clustersDeProyecto(projectId) {
    const out = [];
    for (const c of this.clusters.values()) {
      if (c.project_id === projectId) out.push(c);
    }
    return out;
  }

  async onProjectActivated(event) {
    const data = event.data || event;
    const projectId = data.project_id;
    if (!projectId) return;
    // si ya tenemos clusters de este proyecto en memoria, no recargamos
    let yaCargado = false;
    for (const c of this.clusters.values()) if (c.project_id === projectId) { yaCargado = true; break; }
    if (!yaCargado) this._pedirLectura(projectId, this.archivoPath, 'clusters');
    this._pedirLectura(projectId, this.colaPath, 'cola');
    this._pedirLectura(projectId, this.saludPath, 'salud');
  }

  _pedirLectura(projectId, filePath, kind) {
    try {
      const request_id = crypto.randomUUID();
      const timeout = setTimeout(() => this.pendingFsReads.delete(request_id), 8000);
      this.pendingFsReads.set(request_id, { project_id: projectId, kind, timeout });
      this.eventBus.publish('fs.read.request', {
        project_id: projectId, path: filePath, request_id, encoding: 'utf-8'
      });
    } catch (_) { /* arranca vacio */ }
  }

  onFsReadResponse(event) {
    const payload = event.data || event;
    const pending = this.pendingFsReads.get(payload.request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingFsReads.delete(payload.request_id);
    if (payload.status !== 200 || !payload.content) return;
    try {
      const parsed = JSON.parse(payload.content);
      if (pending.kind === 'cola') {
        for (const c of parsed.candidatas || []) {
          if (!this.cola.has(c.candidata_id)) this.cola.set(c.candidata_id, c);
        }
        this.logger.info('destilador.cola.restored', {
          project_id: pending.project_id, candidatas: (parsed.candidatas || []).length
        });
      } else if (pending.kind === 'salud') {
        for (const s of parsed.skills || []) {
          const key = `${s.project_id}::${s.skill}`;
          if (!this.skillStats.has(key)) this.skillStats.set(key, s);
        }
        this.logger.info('destilador.salud.restored', {
          project_id: pending.project_id, skills: (parsed.skills || []).length
        });
      } else {
        for (const c of parsed.clusters || []) {
          const key = `${c.project_id}::${c.firma}`;
          if (!this.clusters.has(key)) this.clusters.set(key, c);
        }
        this.logger.info('destilador.restored', {
          project_id: pending.project_id, clusters: (parsed.clusters || []).length
        });
      }
    } catch (_) { /* corrupto -> ignora */ }
  }

  // =============================================================
  // Facultad COLA+PUBLICADOR (paso 2) — REFLEJO determinista.
  // El blueprint (LLM) redacta la skill; el reflejo la sella y la publica.
  // =============================================================

  // ── RPC del bus: el blueprint hidrata los registros de la traza ──
  onLeerRegistrosRequest(e) {
    return this._atender(e, 'leer_registros', 'destilador.leer_registros.response',
      d => this._leerRegistros(d));
  }

  async _leerRegistros(input) {
    if (!input.project_id) return this._invalid('project_id');
    const resp = await this._rpc('propiocepcion.leer.request',
      { project_id: input.project_id, limite: 200 });
    const eventos = resp?.data?.eventos || resp?.eventos || [];
    // grupos vienen como 'corr:xxx' | 'solo:xxx' -> extrae el id correlable
    const corrs = new Set(
      (input.grupos || input.correlation_ids || [])
        .map(g => String(g).replace(/^(corr:|solo:)/, '')));
    const registros = corrs.size > 0
      ? eventos.filter(r => corrs.has(r.correlation_id))
      : eventos;
    return { status: 200, data: { total: registros.length, registros } };
  }

  // ── RPC del bus: REPLAY (lado lectura) — dado DONDE estas, devuelve las
  // trayectorias aprendidas que arrancan ahi (cluster.secuencia ya guardada).
  // NO gateado por 'activo': leer rutas aprendidas funciona aunque el aprendizaje
  // este OFF (como listar_clusters — apagar es no APRENDER, no dejar de consultar).
  onRutaRequest(e) {
    return this._atender(e, 'ruta', 'destilador.ruta.response', d => this._ruta(d));
  }

  _ruta(input) {
    if (!input.project_id) return this._invalid('project_id');
    const limite = Number(input.limite) > 0 ? Number(input.limite) : 5;
    const rutas = this._rutasDesde(input.project_id, input.desde, limite);
    return { status: 200, data: { total: rutas.length, rutas } };
  }

  // ── RPC del bus: el blueprint encola la skill que redacto (NO la publica) ──
  onEncolarCandidataRequest(e) {
    return this._atender(e, 'encolar_candidata', 'destilador.encolar_candidata.response',
      d => this._encolar(d));
  }

  _encolar(input) {
    if (!input.nombre_skill || !input.contenido_md) {
      return this._invalid('nombre_skill|contenido_md');
    }
    if (!this._tienePasos(input.contenido_md)) {            // Guard: no_esteril
      this.metrics?.increment('destilador.candidata.rechazada', { motivo: 'esteril' });
      return this._errorResponse(422, 'SKILL_ESTERIL',
        'la skill no tiene pasos accionables', { kind: 'no_esteril' });
    }
    const cand = {
      candidata_id: crypto.randomUUID(),
      firma: input.firma || null,
      nombre_skill: this._slug(input.nombre_skill),
      project_id: input.project_id || null,
      contenido_md: input.contenido_md,
      registros_fuente: input.correlation_ids || input.grupos || [],
      ocurrencias: input.ocurrencias || null,
      estado: 'pendiente',
      created_at: new Date().toISOString()
    };
    this.cola.set(cand.candidata_id, cand);
    this._persistirCola(cand.project_id);
    try {
      this.eventBus.publish('aprendizaje.candidata.encolada', {
        candidata_id: cand.candidata_id, nombre_skill: cand.nombre_skill,
        project_id: cand.project_id, ocurrencias: cand.ocurrencias,
        correlation_id: crypto.randomUUID(), timestamp: cand.created_at
      });
    } catch (_) { /* observabilidad best-effort */ }
    this.metrics?.increment('destilador.candidata.encolada.total');
    return { status: 200, data: { candidata_id: cand.candidata_id } };
  }

  // ── GUARDIA HUMANA: aprobar SELLA la skill en CÚPULAS (la memoria de Enki),
  //    NO en .claude/skills (la memoria de Claude Code). Son dos mundos paralelos:
  //    el destilador es un órgano de Enki, así que su sello vive en Enki. El lazo
  //    "3× → patrón → sello → reuso" se cierra entero dentro del sistema: detecta,
  //    sella la nota en una cúpula, y el LLM-de-página la reutiliza vía
  //    cupulas.contexto. Anti-wipe (no pisa una nota ya sellada). ──
  async handleAprobar(data) {
    try {
      const { candidata_id } = data || {};
      if (!candidata_id) return this._invalid('candidata_id');
      const cand = this.cola.get(candidata_id);
      if (!cand) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'candidata no encontrada',
          { entity_type: 'candidata', entity_ref: candidata_id });
      }
      if (!cand.project_id) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'la candidata no tiene project_id; cúpulas es la memoria POR PROYECTO de Enki',
          { kind: 'sin_proyecto' });
      }

      const CUPULA = 'skills-destiladas';
      const contenido = this._conFrontmatter(cand);

      // 1. asegurar la cúpula de skills destiladas (idempotente: 409 = ya existe, ok)
      await this._rpc('cupulas.crear_cupula.request', {
        project_id: cand.project_id, tema: 'Skills destiladas', tipo: 'skill',
        descripcion: 'Atajos que el destilador selló desde patrones recurrentes del runtime de Enki.'
      });

      // 2. ANTI-WIPE: no pisar una nota ya sellada con ese nombre
      const previa = await this._rpc('cupulas.get_nota.request', {
        project_id: cand.project_id, nota_id: cand.nombre_skill
      });
      if (previa && previa.status === 200) {
        cand.estado = 'conflicto';
        this._persistirCola(cand.project_id);
        this.metrics?.increment('destilador.aprobar.conflicto');
        return this._errorResponse(409, 'CONFLICT_STATE', 'ya existe una skill sellada con ese nombre',
          { kind: 'anti_wipe', nombre_skill: cand.nombre_skill, cupula: CUPULA });
      }

      // 3. SELLAR la nota en cúpulas (Mundo Enki). El cuerpo (pseudocódigo/OOP) es la base.
      const add = await this._rpc('cupulas.add_nota.request', {
        project_id: cand.project_id, cupula: CUPULA,
        titulo: cand.nombre_skill, id: cand.nombre_skill,
        contenido, tipo: 'skill', lenguaje: 'pseudo',
        resumen: this._resumenDe(cand), enlaces: []
      });
      if (!add || (typeof add.status === 'number' && add.status >= 400)) {
        return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE',
          'cúpulas no pudo sellar la nota', { cupula: CUPULA, respuesta: add && add.status });
      }
      const destino = (add.data && add.data.path) || `${CUPULA}/${cand.nombre_skill}`;

      cand.estado = 'aprobada';
      this._persistirCola(cand.project_id);
      try {
        this.eventBus.publish('aprendizaje.skill.creada', {
          nombre_skill: cand.nombre_skill, candidata_id, project_id: cand.project_id,
          cupula: CUPULA, nota_id: cand.nombre_skill, destino,
          correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
        });
      } catch (_) { /* best-effort */ }
      this.metrics?.increment('destilador.skill.creada.total');
      this.logger.info('destilador.skill.sellada_en_cupula',
        { nombre_skill: cand.nombre_skill, cupula: CUPULA, project_id: cand.project_id });
      return { status: 201, data: { nombre_skill: cand.nombre_skill, cupula: CUPULA, nota_id: cand.nombre_skill, destino } };
    } catch (err) {
      return this._handleHandlerError('destilador.aprobar.failed', err, 'aprobar');
    }
  }

  // resumen (1 línea, prosa mínima) para la cabecera de la nota sellada.
  _resumenDe(cand) {
    const md = String(cand.contenido_md || '');
    const linea = md.split('\n').find(l => l.trim() && !/^---/.test(l)) || cand.nombre_skill;
    return linea.replace(/^#+\s*/, '').replace(/^>\s*/, '').trim().slice(0, 200);
  }

  async handleRechazar(data) {
    try {
      const { candidata_id } = data || {};
      if (!candidata_id) return this._invalid('candidata_id');
      const cand = this.cola.get(candidata_id);
      if (!cand) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'candidata no encontrada',
          { entity_type: 'candidata', entity_ref: candidata_id });
      }
      cand.estado = 'rechazada';
      this._persistirCola(cand.project_id);
      this.metrics?.increment('destilador.candidata.rechazada', { motivo: 'humano' });
      return { status: 200, data: { candidata_id, estado: 'rechazada' } };
    } catch (err) {
      return this._handleHandlerError('destilador.rechazar.failed', err, 'rechazar');
    }
  }

  async handleListarCandidatas(data) {
    try {
      const { project_id } = data || {};
      if (!project_id) return this._invalid('project_id');
      const estado = data.estado || 'pendiente';
      const candidatas = Array.from(this.cola.values())
        .filter(c => c.project_id === project_id && c.estado === estado)
        .map(c => ({
          candidata_id: c.candidata_id, nombre_skill: c.nombre_skill, firma: c.firma,
          ocurrencias: c.ocurrencias, estado: c.estado, created_at: c.created_at,
          preview: String(c.contenido_md || '').slice(0, 280)
        }));
      return { status: 200, data: { project_id, estado, total: candidatas.length, candidatas } };
    } catch (err) {
      return this._handleHandlerError('destilador.listar_candidatas.failed', err, 'listar_candidatas');
    }
  }

  _persistirCola(projectId) {
    if (!projectId) return;
    try {
      const candidatas = Array.from(this.cola.values()).filter(c => c.project_id === projectId);
      const content = JSON.stringify(
        { _version: 1, _updated: new Date().toISOString(), candidatas }, null, 0);
      this.eventBus.publish('fs.write.request', {
        project_id: projectId, path: this.colaPath, content, request_id: crypto.randomUUID()
      });
    } catch (_) {
      this.metrics?.increment('destilador.errors.total', { kind: 'cola_flush' });
    }
  }

  // Una skill es fertil si tiene >=2 lineas y al menos un PASO accionable
  // (bullet o numerado). Un heading suelto no es un paso: no basta para sellar.
  _tienePasos(md) {
    const lineas = String(md || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (lineas.length < 2) return false;
    return lineas.some(l => /^([-*]|\d+\.)\s+\S/.test(l));
  }

  _slug(s) {
    return String(s).toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'skill';
  }

  // Si el contenido no trae frontmatter YAML, se lo antepone (name/description).
  _conFrontmatter(cand) {
    const md = String(cand.contenido_md || '');
    if (/^---\s*\n/.test(md)) return md;
    const desc = (md.split('\n').find(l => l.trim().length > 0) || cand.nombre_skill)
      .replace(/^#+\s*/, '').slice(0, 200);
    return `---\nname: ${cand.nombre_skill}\ndescription: ${desc}\n---\n\n${md}`;
  }

  // =============================================================
  // UI / inspeccion — el ojo humano del paso 1
  // =============================================================

  async handleListarClusters(data) {
    try {
      const { project_id } = data || {};
      if (!project_id || typeof project_id !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido (string)',
          { field: 'project_id', entity_type: 'project' });
      }
      const minOcurrencias = Number(data.min_ocurrencias) > 0 ? Number(data.min_ocurrencias) : 1;
      const clusters = this._clustersDeProyecto(project_id)
        .filter(c => c.ocurrencias >= minOcurrencias)
        .sort((a, b) => b.ocurrencias - a.ocurrencias)
        .map(c => ({
          firma: c.firma, secuencia: c.secuencia, ocurrencias: c.ocurrencias,
          emitida: c.emitida, primera_ts: c.primera_ts, ultima_ts: c.ultima_ts
        }));
      return { status: 200, data: { project_id, total: clusters.length, clusters } };
    } catch (err) {
      return this._handleHandlerError('destilador.listar_clusters.failed', err, 'listar_clusters');
    }
  }

  // REPLAY (visibilidad): desde donde estas, que rutas aprendidas continuan. El ojo del lado lectura.
  async handleRuta(data) {
    try {
      const { project_id } = data || {};
      if (!project_id || typeof project_id !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido (string)',
          { field: 'project_id', entity_type: 'project' });
      }
      const limite = Number(data.limite) > 0 ? Number(data.limite) : 5;
      const rutas = this._rutasDesde(project_id, data.desde, limite);
      return { status: 200, data: { project_id, desde: data.desde ?? null, total: rutas.length, rutas } };
    } catch (err) {
      return this._handleHandlerError('destilador.ruta.failed', err, 'ruta');
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        module: this.name, version: this.version,
        activo: this.activo,
        capturando: !!this._onBusMessage,
        trazas_abiertas: this.trazas.size,
        clusters: this.clusters.size,
        umbral: this.umbral, scope: Array.from(this.scope)
      }
    };
  }

  // =============================================================
  // Privados
  // =============================================================

  // REPLAY — el corazon: clusters del proyecto cuya secuencia ARRANCA por 'desde',
  // rankeados por ocurrencias (cuan probada esta la ruta). La 'continuacion' es el
  // replay: los pasos que vienen DESPUES de donde estas.
  _rutasDesde(project_id, desde, limite) {
    const prefijo = Array.isArray(desde)
      ? desde.map(s => String(s))
      : (desde != null && desde !== '' ? [String(desde)] : []);
    const matches = [];
    for (const c of this._clustersDeProyecto(project_id)) {
      const cont = this._continuacion(c.secuencia, prefijo);
      if (cont === null) continue;                       // no arranca por 'desde'
      matches.push({
        firma: c.firma, secuencia: c.secuencia, continuacion: cont,
        ocurrencias: c.ocurrencias, ultima_ts: c.ultima_ts
      });
    }
    matches.sort((a, b) => b.ocurrencias - a.ocurrencias);
    return Number(limite) > 0 ? matches.slice(0, Number(limite)) : matches;
  }

  // Devuelve la continuacion (pasos tras 'prefijo') o null si la secuencia no arranca por el.
  //   prefijo []                     -> la ruta entera (sin 'desde': todas las rutas del proyecto)
  //   prefijo ['recetas']            -> entrada por DOMINIO/pagina: match si secuencia[0] es de ese dominio
  //   prefijo ['recetas.obtener',..] -> match EXACTO del comienzo de la secuencia
  _continuacion(secuencia, prefijo) {
    if (!Array.isArray(secuencia)) return null;
    if (prefijo.length === 0) return secuencia.slice();
    if (prefijo.length === 1 && !prefijo[0].includes('.')) {
      const dom = prefijo[0];
      const s0 = String(secuencia[0] || '');
      if (s0 === dom || s0.startsWith(dom + '.')) return secuencia.slice(1);
      return null;
    }
    if (secuencia.length < prefijo.length) return null;
    for (let i = 0; i < prefijo.length; i++) {
      if (String(secuencia[i]) !== prefijo[i]) return null;
    }
    return secuencia.slice(prefijo.length);
  }

  _parseEnvelope(message) {
    if (!message) return null;
    if (typeof message === 'object' && !Buffer.isBuffer(message)) return message;
    try { return JSON.parse(Buffer.isBuffer(message) ? message.toString('utf-8') : String(message)); }
    catch (_) { return null; }
  }

  _eventTypeFromTopic(topic) {
    const m = String(topic || '').match(/\/events\/(.+)$/);
    return m ? m[1].replace(/\//g, '.') : null;
  }
}

module.exports = DestiladorModule;
