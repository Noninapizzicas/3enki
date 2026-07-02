/**
 * conserje — abre el camino al comerciante.
 *
 * Cruza lo que el sistema OFRECE (LibroDeCapacidades) con lo que el comerciante
 * USA (derivado del bus en vivo) y, cuando hay una brecha con intención, le
 * ofrece el siguiente paso — en POSITIVO, no señalando la carencia.
 *
 * No tiene sondas hardcodeadas: lee el grafo de capacidades y el uso real.
 *   intentada pero vacía  -> "lo buscas, te falta montarlo, ¿lo completamos?"
 *   ofrecida nunca tocada -> "esto existe y te daría valor, ¿lo arrancamos?"
 *
 * Apagado por defecto. Su on/off vive en el registro central de interruptores
 * (botón 'conserje'); reacciona a interruptor.cambiado en caliente. Cooldown
 * por capacidad para no agobiar.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');
const { LibroDeCapacidades, PIZZEPOS_CAPACIDADES } = require('../_shared/libro-capacidades');

// Cómo el bus delata el USO de una capacidad. El project_id viaja en el .request;
// el estado (lleno/vacío) en el .response — que NO lleva project_id. Por eso se
// correla request->response por request_id.
//   SEÑAL_REQUEST: <evento>.request -> capacidad (da el project_id)
//   SEÑAL_RESPONSE: <evento>.response -> { capacidad, lleno(data) } (da el estado)
//   SEÑAL_EVENTO: evento de dominio autocontenido (project_id + significado juntos)
const SEÑAL_REQUEST = {
  'carta-marketing.get_perfil.request': 'marca',
  'recetas.listar.request': 'recetas',
  'carta.get.request': 'carta',
  'carta.list.request': 'carta'
};
const SEÑAL_RESPONSE = {
  'carta-marketing.get_perfil.response': {
    capacidad: 'marca',
    lleno: d => !!(d && (d.onboarding_completado || (d.esencia && d.esencia.nombre) || d.nombre))
  },
  'recetas.listar.response': {
    capacidad: 'recetas',
    lleno: d => !!(d && ((d.total || 0) > 0 || (Array.isArray(d.recetas) && d.recetas.length > 0)))
  },
  'carta.get.response': {
    capacidad: 'carta',
    lleno: d => !!(d && ((Array.isArray(d.productos) && d.productos.length > 0) || d.carta_id))
  },
  'carta.list.response': {
    capacidad: 'carta',
    lleno: d => !!(d && ((d.total || 0) > 0 || (Array.isArray(d.cartas) && d.cartas.length > 0)))
  }
};
const SEÑAL_EVENTO = {
  'escandallo.coste.calculado': { capacidad: 'escandallo', lleno: () => true },
  // diseno/digital: sin esta señal su estado `usada` no se observaba nunca y el
  // conserje los ofrecía cada cooldown PARA SIEMPRE, incluso ya construidos.
  // Ambos eventos son autocontenidos (llevan project_id) y significan "hecho".
  'carta.html.generada':        { capacidad: 'diseno',  lleno: () => true },  // un diseño guardado existe
  'cartadigital.publicado':     { capacidad: 'digital', lleno: () => true }   // la carta pública está publicada
};

// Capacidad tocada -> el HOGAR de lente (dominio + tarea = ruta) donde una skill traída
// de fuera se activa para que el nervio la inyecte EN LA PÁGINA que el comerciante tiene
// delante. dominios/tareas son RUTAS REALES de los packs del cuenco (diseño/copy/negocio);
// por eso promover no crea colgantes. Una capacidad sin hogar aquí (p.ej. recetas) se puede
// TRAER a la cantera pero no auto-activar: se ofrece activar (no hay dónde montarla sola).
const MAPA_CAP_LENTE = {
  carta:      { dominio: 'diseño',  tarea: 'tema' },
  diseno:     { dominio: 'diseño',  tarea: 'tema' },
  digital:    { dominio: 'diseño',  tarea: 'tema' },
  marca:      { dominio: 'copy',    tarea: 'copy' },
  escandallo: { dominio: 'negocio', tarea: 'coste' },
  viabilidad: { dominio: 'negocio', tarea: 'viabilidad' }
};

// La capacidad interna es en ESPAÑOL ('diseno', 'marca', 'escandallo'); skills.sh es un
// catálogo PÚBLICO en inglés. Buscar fuera con el nombre interno devuelve 0 o basura
// (verificado en vivo: 'diseno'→0, 'marca'→basura), así que la BÚSQUEDA DE FUERA se
// traduce a la query que de verdad rinde. Calibrado contra skills.sh, no adivinado:
//   frontend design → 614K · copywriting → 140K · pricing → 61K.
// La búsqueda DENTRO (la cantera propia) sigue con el cap español — así está indexada.
// Un cap sin entrada aquí busca fuera con su propio nombre (probable 0 → silencio honesto).
const MAPA_CAP_CONSULTA = {
  carta:      'frontend design',
  diseno:     'frontend design',
  digital:    'frontend design',
  marca:      'copywriting',
  escandallo: 'pricing',
  viabilidad: 'pricing'
};

class ConserjeModule extends BaseModule {
  constructor() {
    super();
    this.name = 'conserje';
    this.version = '0.6.1';
    this.config = null;
    this.libro = new LibroDeCapacidades(PIZZEPOS_CAPACIDADES);
    this.activo = false;                 // OFF por defecto (lo gobierna el interruptor 'conserje')
    this.activoRutas = false;            // OFF por defecto — interruptor 'conserje-rutas' (replay sugerente)
    this.activoCantera = false;          // OFF por defecto — interruptor 'conserje-cantera' (ofrece skills de la cosecha)
    this.activoFuera = false;            // OFF por defecto — interruptor 'conserje-fuera' (busca FUERA y trae+activa auto)
    this.fueraInstallsMin = 50000;       // suelo de instalaciones para tocar una skill de fuera
    this.fueraDominanciaX = 1.5;         // la top debe superar a la 2ª por este factor para "dominar" (auto)
    this.umbralRuta = 3;                 // solo ofrece rutas aprendidas >= N veces
    this.estados = new Map();            // project_id -> { usadas:Set, intentadas:Set }
    this.cooldown = new Map();           // `${project}::${capacidad}` -> ts
    this.pendientes = new Map();         // project_id -> empujon (lo lee el nervio, una vez)
    this.pendingReq = new Map();         // request_id -> { project_id, capacidad } (correla req->resp)
    this.maxPendingReq = 500;
    this.dirty = new Set();
    this._onBusMessage = null;
    this._tickTimer = null;
    this.cooldownMs = 24 * 60 * 60 * 1000;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.config = context.moduleConfig || {};
    this.activo = this.config.enabled_default === true;   // por defecto false
    this.activoRutas = this.config.rutas_enabled_default === true;   // por defecto false (aparcado)
    this.activoCantera = this.config.cantera_enabled_default === true;   // por defecto false
    this.activoFuera = this.config.fuera_enabled_default === true;   // por defecto false
    this.fueraInstallsMin = Number(this.config.fuera_installs_min) || 50000;
    this.fueraDominanciaX = Number(this.config.fuera_dominancia_x) || 1.5;
    this.umbralRuta = Number(this.config.umbral_ruta) || 3;
    this.cooldownMs = Number(this.config.cooldown_h ? this.config.cooldown_h * 3600000 : null) || 24 * 60 * 60 * 1000;

    this._registrarBoton();   // registra AMBOS botones (conserje + conserje-rutas); idempotente


    this._startBusCapture();
    const tickMs = Number(this.config.tick_ms) || 15000;
    this._tickTimer = setInterval(() => this._tick(), tickMs);

    this.logger?.info('conserje.loaded', { module: this.name, version: this.version, activo: this.activo });
  }

  async onUnload() {
    this._stopBusCapture();
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = null;
    this.estados.clear();
    this.cooldown.clear();
    this.pendientes.clear();
    this.pendingReq.clear();
    this.dirty.clear();
    this.logger?.info('conserje.unloaded', { module: this.name });
  }

  // registra su botón en el panel central. Idempotente: se llama al cargar y
  // cada vez que interruptores pide registro (cura la carrera de arranque).
  _registrarBoton() {
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'conserje', label: 'Conserje (empujones al comerciante)', grupo: 'aprendizaje',
        descripcion: 'Sugiere al comerciante el siguiente paso según lo que ofrece el sistema y lo que ya usa.',
        default: false
      });
      this.eventBus.publish('interruptor.registrar', {
        id: 'conserje-rutas', label: 'Conserje · rutas aprendidas (replay)', grupo: 'aprendizaje',
        descripcion: 'Tras un paso, ofrece la ruta que el destilador aprendió que suele seguir (replay sugerente). Independiente del conserje base.',
        default: false
      });
      this.eventBus.publish('interruptor.registrar', {
        id: 'conserje-cantera', label: 'Conserje · skills de la cantera', grupo: 'aprendizaje',
        descripcion: 'Tras un paso, mina la cosecha (cantera de skills) y ofrece en positivo la skill pertinente a lo que el comerciante está haciendo. Convierte la abundancia guardada en munición de empujones. Independiente de los otros dos.',
        default: false
      });
      this.eventBus.publish('interruptor.registrar', {
        id: 'conserje-fuera', label: 'Conserje · buscar FUERA (trae y activa auto)', grupo: 'aprendizaje',
        descripcion: 'Cuando la cantera propia no tiene skill para lo que el comerciante hace, busca en el ecosistema público (skills.sh). Si una skill DOMINA claramente (instalaciones), la TRAE y la ACTIVA sola, avisando después (reversible: quitar/olvidar). Si no domina, solo ofrece traerla. Baja código del ecosistema — OFF por defecto, más agresivo que los otros tres.',
        default: false
      });
    } catch (_) { /* best-effort */ }
  }

  // interruptores (re)cargó y pide a todos que se registren -> respondemos.
  onSolicitarRegistro() {
    this._registrarBoton();
  }

  // ── on/off en caliente desde el panel ──
  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id === 'conserje') {
      this.activo = !!d.enabled;
      this.logger?.warn('conserje.toggled', { activo: this.activo });
    } else if (d.id === 'conserje-rutas') {
      this.activoRutas = !!d.enabled;
      this.logger?.warn('conserje.rutas.toggled', { activoRutas: this.activoRutas });
    } else if (d.id === 'conserje-cantera') {
      this.activoCantera = !!d.enabled;
      this.logger?.warn('conserje.cantera.toggled', { activoCantera: this.activoCantera });
    } else if (d.id === 'conserje-fuera') {
      this.activoFuera = !!d.enabled;
      this.logger?.warn('conserje.fuera.toggled', { activoFuera: this.activoFuera });
    }
  }

  // ── oído al bus: deriva usadas / intentadas ──
  _startBusCapture() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || typeof mqtt.on !== 'function') {
      this.logger?.warn('conserje.bus.unavailable', {});
      return;
    }
    this._onBusMessage = (topic, message) => {
      try { this._capturar(topic, message); } catch (_) { this.metrics?.increment('conserje.errors.total', { kind: 'capture' }); }
    };
    mqtt.on('message', this._onBusMessage);
  }

  _stopBusCapture() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onBusMessage && typeof mqtt.removeListener === 'function') mqtt.removeListener('message', this._onBusMessage);
    this._onBusMessage = null;
  }

  _capturar(topic, message) {
    const env = this._parseEnvelope(message);
    if (!env) return;
    const eventType = env.event_type || this._eventTypeFromTopic(topic);
    if (!eventType) return;
    const data = env.data || {};

    // .request -> recuerda qué proyecto+capacidad por request_id (el response no lo lleva)
    const capReq = SEÑAL_REQUEST[eventType];
    if (capReq) {
      const projectId = data.project_id || data.projectId || null;
      if (projectId && data.request_id) {
        this.pendingReq.set(data.request_id, { project_id: projectId, capacidad: capReq });
        while (this.pendingReq.size > this.maxPendingReq) {
          this.pendingReq.delete(this.pendingReq.keys().next().value);  // evict el más viejo
        }
      }
      return;
    }

    // .response -> resuelve el proyecto por request_id y evalúa el estado
    const señalResp = SEÑAL_RESPONSE[eventType];
    if (señalResp) {
      const pend = data.request_id ? this.pendingReq.get(data.request_id) : null;
      if (!pend) return;
      this.pendingReq.delete(data.request_id);
      const inner = (data && typeof data.data === 'object' && data.data) ? data.data : data;  // response envuelve en .data
      this._actualizar(pend.project_id, señalResp.capacidad, señalResp.lleno(inner));
      return;
    }

    // evento de dominio autocontenido (project_id + significado juntos)
    const señalEv = SEÑAL_EVENTO[eventType];
    if (señalEv) {
      const projectId = data.project_id || data.projectId || null;
      if (projectId) this._actualizar(projectId, señalEv.capacidad, señalEv.lleno(data));
    }
  }

  _actualizar(projectId, capacidad, lleno) {
    const est = this._estado(projectId);
    est.ultimaCapacidad = capacidad;               // dónde está el comerciante (semilla del replay de rutas)
    if (lleno) {                                   // entrega valor -> usada
      est.usadas.add(capacidad);
      est.intentadas.delete(capacidad);
    } else if (!est.usadas.has(capacidad)) {       // la toca vacía -> intentada (intención)
      est.intentadas.add(capacidad);
    }
    this.dirty.add(projectId);
  }

  _estado(projectId) {
    let est = this.estados.get(projectId);
    if (!est) { est = { usadas: new Set(), intentadas: new Set(), ultimaCapacidad: null }; this.estados.set(projectId, est); }
    return est;
  }

  // ── evalúa la brecha y empuja (si activo) ──
  async _tick() {
    if (this.dirty.size === 0) return;
    const proyectos = Array.from(this.dirty);
    this.dirty.clear();
    if (this.activo) this._tickBrecha(proyectos);              // empujón por brecha (OFRECE vs USA)
    if (this.activoRutas) await this._tickRutas(proyectos);    // empujón por ruta aprendida (replay sugerente)
    if (this.activoCantera) await this._tickCantera(proyectos);// empujón por skill de la cantera (la abundancia como munición)
    if (this.activoFuera) await this._tickFuera(proyectos);    // busca FUERA (skills.sh) y trae+activa auto si domina
  }

  // ── FUERA: cuando la cantera propia no cubre la tarea, busca en el ecosistema
  // público (feeder→skills.sh) y, si una skill DOMINA, la trae y activa sola. La cara
  // más agresiva de "sumar": el sistema sale al mundo por ti. Guardas fuertes: su propio
  // interruptor (OFF), umbral de instalaciones + dominancia, y SIEMPRE reversible + con
  // testigo (avisa después, la activación es crecida → desmontar/olvidar). Última prioridad
  // del tick (no pisa brecha/rutas/cantera; solo actúa si dentro no había nada). ──
  async _tickFuera(proyectos) {
    for (const projectId of proyectos) {
      if (this.pendientes.has(projectId)) continue;            // los otros tienen prioridad este tick
      const est = this.estados.get(projectId);
      if (!est || !est.ultimaCapacidad) continue;
      const cap = est.ultimaCapacidad;
      const key = `${projectId}::fuera::${cap}`;
      if (Date.now() - (this.cooldown.get(key) || 0) < this.cooldownMs) continue;  // no agobiar (npx cuesta)

      // 1) DENTRO primero: si la cantera propia cubre la tarea, no salgo fuera.
      let dentro = null;
      try { dentro = await this._rpc('cosecha.buscar.request', { query: cap, tarea: cap, limite: 1 }, { timeout_ms: 3000 }); }
      catch (_) { this.metrics?.increment('conserje.errors.total', { kind: 'rpc_cosecha' }); }
      if (dentro && dentro.data && Array.isArray(dentro.data.skills) && dentro.data.skills.length > 0) continue;

      // 2) FUERA: descubre en el ecosistema público (degrada limpio si npx no está).
      // El cap interno (español) no casa con el catálogo público (inglés) → se traduce.
      const consulta = MAPA_CAP_CONSULTA[cap] || cap;
      let fuera = null;
      try { fuera = await this._rpc('feeder.buscar.request', { query: consulta }, { timeout_ms: 20000 }); }
      catch (_) { this.metrics?.increment('conserje.errors.total', { kind: 'rpc_feeder' }); continue; }
      const salida = fuera && fuera.data && fuera.data.salida;
      if (!salida) continue;                                   // degradado / sin salida → silencio honesto
      const cands = this._parseSkillsSh(salida);
      if (cands.length === 0) continue;

      this.cooldown.set(key, Date.now());                      // tenemos candidatos: marca el cooldown
      const top = cands[0];
      const domina = top.installs >= this.fueraInstallsMin
        && (cands.length < 2 || top.installs >= cands[1].installs * this.fueraDominanciaX);

      if (domina) await this._autoTraerActivar(projectId, cap, top);
      else this._emitirEmpujonFuera(projectId, 'descubrimiento_externo', {
        recurso: top.id,
        mensaje: `Para lo que estás haciendo hay una skill en el ecosistema: "${top.id}" (${top.installsHuman} usos). ¿Te la traigo a tu cantera?`,
        accion_sugerida: `feeder.traer_skill:${top.id}`
      });
    }
  }

  // trae la skill dominante (feeder.instalar) y, si su capacidad tiene HOGAR de lente,
  // la activa (cosecha.promover al dominio/tarea que la página bebe). Cada paso degrada a
  // OFRECER si no puede completarse solo — nunca miente sobre lo que hizo (P0 + no_silent).
  async _autoTraerActivar(projectId, cap, top) {
    let inst = null;
    try { inst = await this._rpc('feeder.instalar.request', { paquete: top.id }, { timeout_ms: 90000 }); }
    catch (_) { this.metrics?.increment('conserje.errors.total', { kind: 'rpc_instalar' }); }
    const ingeridas = inst && inst.data && Array.isArray(inst.data.ingeridas) ? inst.data.ingeridas : [];
    if (ingeridas.length === 0) {                              // no pude traerla sola → ofrezco traerla
      this._emitirEmpujonFuera(projectId, 'descubrimiento_externo', {
        recurso: top.id,
        mensaje: `Encontré "${top.id}" (${top.installsHuman} usos) para lo que haces, pero no pude traerla sola. ¿La traemos?`,
        accion_sugerida: `feeder.traer_skill:${top.id}`
      });
      return;
    }
    const nombre = ingeridas[0];
    const hogar = MAPA_CAP_LENTE[cap] || null;                 // ¿tiene dónde activarse para esta tarea?
    let activada = false;
    if (hogar) {
      let prom = null;
      try { prom = await this._rpc('cosecha.promover.request', { nombre, dominio: hogar.dominio, tarea: hogar.tarea }, { timeout_ms: 5000 }); }
      catch (_) { this.metrics?.increment('conserje.errors.total', { kind: 'rpc_promover' }); }
      activada = !!(prom && (prom.status === undefined || prom.status < 400) && prom.data);
    }
    if (activada) {                                            // TRAJE + ACTIVÉ → aviso después (reversible)
      this._emitirEmpujonFuera(projectId, 'traido_activado', {
        recurso: nombre,
        mensaje: `Te traje "${nombre}" de skills.sh y la activé como lente de "${hogar.dominio}" para lo que estás haciendo. Si no encaja, dímelo y la quito.`,
        accion_sugerida: `cosecha.olvidar:${nombre}`
      });
    } else {                                                   // TRAÍDA pero sin activar → ofrezco activarla
      this._emitirEmpujonFuera(projectId, 'traido', {
        recurso: nombre,
        mensaje: `Te traje "${nombre}" de skills.sh a tu cantera para lo que haces. ¿La activo?`,
        accion_sugerida: `cosecha.promover:${nombre}`
      });
    }
  }

  _emitirEmpujonFuera(projectId, tipo, { recurso, mensaje, accion_sugerida }) {
    const empujon = { tipo, recurso, mensaje, accion_sugerida };
    this.pendientes.set(projectId, empujon);   // el nervio lo leerá y consumirá (una vez)
    try {
      this.eventBus.publish('conserje.empujon', {
        project_id: projectId, ...empujon,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this.metrics?.increment('conserje.empujon.total', { tipo, recurso });
      this.logger?.info('conserje.empujon.fuera', { project_id: projectId, tipo, recurso });
    } catch (_) {
      this.metrics?.increment('conserje.errors.total', { kind: 'emit_fuera' });
    }
  }

  // ── parse de la salida cruda de `npx skills find` (skills.sh): líneas
  // "owner/repo@skill  <N>[KM] installs". Determinista y testeable. ──
  _stripAnsi(s) { return String(s || '').replace(/\x1b\[[0-9;]*m/g, ''); }

  _installsToNum(str) {
    const m = /^([\d.]+)\s*([KM]?)/.exec(String(str).trim());
    if (!m) return 0;
    let n = parseFloat(m[1]);
    if (m[2] === 'K') n *= 1000; else if (m[2] === 'M') n *= 1000000;
    return Math.round(n);
  }

  _parseSkillsSh(raw) {
    const clean = this._stripAnsi(raw);
    const out = [];
    for (const line of clean.split('\n')) {
      const m = /^(\S+@\S+)\s+([\d.]+[KM]?)\s+installs/.exec(line.trim());
      if (m) out.push({ id: m[1], installsHuman: m[2], installs: this._installsToNum(m[2]) });
    }
    out.sort((a, b) => b.installs - a.installs);
    return out;
  }

  // ── CANTERA: mina la cosecha por lo que el comerciante está haciendo y ofrece la skill ──
  // Aquí la abundancia guardada se vuelve GANANCIA: tener skills = poder ofrecer el
  // siguiente paso. Demand-driven: si la cantera no tiene skill pertinente, NO ofrece
  // (no spamea). Prioridad menor que brecha/rutas (no pisa un empujón pendiente).
  async _tickCantera(proyectos) {
    for (const projectId of proyectos) {
      if (this.pendientes.has(projectId)) continue;            // brecha/rutas tienen prioridad este tick
      const est = this.estados.get(projectId);
      if (!est || !est.ultimaCapacidad) continue;
      let resp = null;
      try {
        resp = await this._rpc('cosecha.buscar.request',
          { query: est.ultimaCapacidad, tarea: est.ultimaCapacidad, limite: 1 }, { timeout_ms: 3000 });
      } catch (_) { this.metrics?.increment('conserje.errors.total', { kind: 'rpc_cosecha' }); continue; }
      const skill = resp && resp.data && Array.isArray(resp.data.skills) ? resp.data.skills[0] : null;
      if (!skill || !skill.nombre) continue;                   // sin skill pertinente -> no ofrece
      const key = `${projectId}::skill::${skill.nombre}`;
      if (Date.now() - (this.cooldown.get(key) || 0) < this.cooldownMs) continue;  // no agobiar
      this.cooldown.set(key, Date.now());
      this._emitirEmpujonSkill(projectId, skill);
    }
  }

  _emitirEmpujonSkill(projectId, skill) {
    // Si la skill declara HOGAR (lente_dominio), ofrece PROMOVER (activarla como lente que
    // el LLM encarna en esa página) en vez de solo OBTENER (leerla). promover resuelve el
    // dominio/tarea desde la propia skill, así basta el nombre en la acción.
    const promovible = !!skill.lente_dominio;
    const mensaje = promovible
      ? `Para lo que estás haciendo hay una skill que encaja como lente de "${skill.lente_dominio}": "${skill.nombre}" — ${skill.descripcion}. ¿La activamos?`
      : `Para lo que estás haciendo hay una skill en la cantera: "${skill.nombre}" — ${skill.descripcion}. ¿La montamos?`;
    const empujon = {
      tipo: 'skill', recurso: skill.nombre, mensaje,
      accion_sugerida: promovible ? `cosecha.promover:${skill.nombre}` : `cosecha.obtener:${skill.nombre}`
    };
    this.pendientes.set(projectId, empujon);   // el nervio lo leerá y consumirá (una vez)
    try {
      this.eventBus.publish('conserje.empujon', {
        project_id: projectId, ...empujon,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this.metrics?.increment('conserje.empujon.total', { tipo: 'skill', recurso: skill.nombre });
    } catch (_) { /* best-effort */ }
  }

  _tickBrecha(proyectos) {
    for (const projectId of proyectos) {
      const est = this.estados.get(projectId);
      if (!est) continue;
      const item = this.libro.siguienteEmpujon({ usadas: est.usadas, intentadas: est.intentadas });
      if (!item) continue;
      const key = `${projectId}::${item.id}`;
      if (Date.now() - (this.cooldown.get(key) || 0) < this.cooldownMs) continue;  // no agobiar
      this.cooldown.set(key, Date.now());
      this._emitirEmpujon(projectId, item);
    }
  }

  // ── REPLAY SUGERENTE: pregunta al destilador "desde aquí, ¿por dónde se suele ir?" ──
  async _tickRutas(proyectos) {
    for (const projectId of proyectos) {
      if (this.pendientes.has(projectId)) continue;            // el empujón de brecha tiene prioridad este tick
      const est = this.estados.get(projectId);
      if (!est || !est.ultimaCapacidad) continue;
      let resp = null;
      try {
        resp = await this._rpc('destilador.ruta.request',
          { project_id: projectId, desde: est.ultimaCapacidad, limite: 1 }, { timeout_ms: 3000 });
      } catch (_) { this.metrics?.increment('conserje.errors.total', { kind: 'rpc_ruta' }); continue; }
      const ruta = resp && resp.data && Array.isArray(resp.data.rutas) ? resp.data.rutas[0] : null;
      if (!ruta || !Array.isArray(ruta.continuacion) || ruta.continuacion.length === 0) continue;
      if ((ruta.ocurrencias || 0) < this.umbralRuta) continue;  // solo rutas probadas
      const key = `${projectId}::ruta::${ruta.firma}`;
      if (Date.now() - (this.cooldown.get(key) || 0) < this.cooldownMs) continue;
      this.cooldown.set(key, Date.now());
      this._emitirEmpujonRuta(projectId, est.ultimaCapacidad, ruta);
    }
  }

  _emitirEmpujon(projectId, item) {
    const mensaje = item.tipo === 'desbloqueo'
      ? `Veo que buscas ${item.ofrece}, pero aún está sin montar. ¿Lo completamos? Es rápido.`
      : `¿Sabías que puedes tener ${item.ofrece}? Si quieres, lo arrancamos.`;
    const empujon = { tipo: item.tipo, recurso: item.id, mensaje, accion_sugerida: item.entrada };
    this.pendientes.set(projectId, empujon);   // el nervio lo leerá y consumirá (una vez)
    try {
      this.eventBus.publish('conserje.empujon', {
        project_id: projectId, ...empujon,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this.metrics?.increment('conserje.empujon.total', { tipo: item.tipo, recurso: item.id });
      this.logger?.info('conserje.empujon', { project_id: projectId, recurso: item.id, tipo: item.tipo });
    } catch (_) {
      this.metrics?.increment('conserje.errors.total', { kind: 'emit' });
    }
  }

  _emitirEmpujonRuta(projectId, desde, ruta) {
    const camino = ruta.continuacion.map(p => String(p).split('.')[0]).join(' → ');
    const mensaje = `Después de ${desde}, esto suele seguir así: ${camino}. ¿Sigo por ahí?`;
    const empujon = {
      tipo: 'ruta', recurso: ruta.firma, mensaje,
      accion_sugerida: ruta.continuacion[0], ruta: ruta.continuacion
    };
    this.pendientes.set(projectId, empujon);   // el nervio lo leerá y consumirá (una vez)
    try {
      this.eventBus.publish('conserje.empujon', {
        project_id: projectId, ...empujon,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this.metrics?.increment('conserje.empujon.total', { tipo: 'ruta', recurso: ruta.firma });
      this.logger?.info('conserje.empujon.ruta', { project_id: projectId, desde, firma: ruta.firma, pasos: ruta.continuacion.length });
    } catch (_) {
      this.metrics?.increment('conserje.errors.total', { kind: 'emit_ruta' });
    }
  }

  // publishAndWait genérico al bus (RPC request/response correlado por request_id).
  async _rpc(evento, payload = {}, { timeout_ms = 3000 } = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request')
      ? evento.slice(0, -('.request'.length)) + '.response'
      : `${evento}.response`;
    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeout_ms);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const d = (event && event.data) || event;
          if (!d || d.request_id !== request_id) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          resolve(d);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) {
        clearTimeout(timeout);
        if (unsub) unsub();
        resolve(null);
      }
    });
  }

  // ── el NERVIO lee el empujón pendiente (y lo CONSUME: se ofrece una vez) ──
  async handleEmpujonPendiente(data) {
    const project_id = data && (data.project_id || data.projectId);
    if (!project_id) return { status: 200, data: { empujon: null } };
    const empujon = this.pendientes.get(project_id) || null;
    if (empujon) this.pendientes.delete(project_id);   // consume-on-read
    return { status: 200, data: { empujon } };
  }

  // ── UI: ver la brecha de un proyecto (visibilidad / debug) ──
  async handleBrecha(data) {
    try {
      const { project_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido', { field: 'project_id' });
      const est = this.estados.get(project_id) || { usadas: new Set(), intentadas: new Set() };
      const brecha = this.libro.brecha({ usadas: est.usadas, intentadas: est.intentadas });
      return {
        status: 200,
        data: {
          project_id, activo: this.activo,
          usadas: Array.from(est.usadas), intentadas: Array.from(est.intentadas),
          brecha
        }
      };
    } catch (err) {
      return this._handleHandlerError('conserje.brecha.failed', err, 'brecha');
    }
  }

  async handleHealthCheck() {
    return { status: 200, data: { module: this.name, version: this.version, activo: this.activo, proyectos: this.estados.size } };
  }

  _parseEnvelope(message) {
    if (!message) return null;
    if (typeof message === 'object' && !Buffer.isBuffer(message)) return message;
    try { return JSON.parse(Buffer.isBuffer(message) ? message.toString('utf-8') : String(message)); } catch (_) { return null; }
  }

  _eventTypeFromTopic(topic) {
    const m = String(topic || '').match(/\/events\/(.+)$/);
    return m ? m[1].replace(/\//g, '.') : null;
  }
}

module.exports = ConserjeModule;
