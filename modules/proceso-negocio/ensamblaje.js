/**
 * proceso-negocio/ensamblaje — F7b · INTEGRADOR.
 *
 * NATURALEZA
 *   Integra el módulo RECIÉN CONSTRUIDO en el ecosistema vivo del repo.
 *   Lee TODOS los manifests reales, deja que el LLM empareje la intención del
 *   módulo nuevo con los eventos que el bus ya emite, y ESCRIBE los subscribes
 *   faltantes en el manifest del módulo nuevo más los handlers esqueleto en su
 *   index.js. Jamás toca módulos viejos.
 *
 * FILOSOFÍA (intacta — es event-driven puro)
 *   Publique quien publique, oiga quien oiga.
 *   - Un publishes sin oyente HOY es futuro abierto, no deuda.
 *   - Un subscribes sin emisor conocido HOY es oreja esperando.
 *   - El dominio crece añadiendo manifests; los viejos no se tocan.
 *
 * PATRÓN agente-perspectiva-c
 *   Reflejo JS (determinista): leer / agrupar / persistir / validar / emitir.
 *   LLM (fuzzy, UNA pregunta pura): matching intención ↔ eventos vivos.
 *   El LLM es función pura sin herramientas — el reflejo lo rodea de determinismo.
 *
 * CICLO (CONTRATO → LEER → PENSAR → GUARDAR → EMITIR)
 *   1. CONTRATO : verificar que el módulo nuevo existe (module.json + index.js).
 *   2. LEER     : ecosistema vivo + módulo nuevo (descripción, handlers, subs).
 *   3. PENSAR   : UN prompt al LLM con el mapa de eventos vivos — devuelve la
 *                 lista de subscribes a añadir.
 *   4. GUARDAR  : escribir subscribes al module.json + handlers esqueleto al
 *                 index.js del módulo nuevo. Con rollback atómico ante error.
 *   5. EMITIR   : publicar nichos.hoja.integrada o su par .failed, y persistir
 *                 un informe incremental en proceso-negocio/fase7b-ensamblaje.json.
 *
 * FAIL-SAFE
 *   success = ENTREGABLE VERIFICADO. Si cualquier paso falla, retroceso total
 *   (ficheros quedan como estaban) y par .failed con motivo medido. Jamás
 *   certifica un cosido que no hizo.
 *
 * NUNCA TOCA
 *   - Módulos viejos (bajo ninguna circunstancia).
 *   - config.json, enabled[], el loader.
 *   - Otras hojas de la misma vertical salvo la que integra AHORA.
 *
 * Ver `modules/cosecha/cantera/enki/ensamblaje/SKILL.md` para el porqué.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─────────────────────────────────────────────────────────────────────────────
// Normalización
// ─────────────────────────────────────────────────────────────────────────────

// Un subscribe o publish puede venir como string o como { event, handler, ... }.
// Devuelve siempre { event, handler? } con event normalizado a string.
function normalizarEntrada(x) {
  if (typeof x === 'string') return { event: x };
  if (x && typeof x === 'object' && typeof x.event === 'string') {
    return { event: x.event, ...(x.handler ? { handler: x.handler } : {}) };
  }
  return null;
}

function listaDeEventos(bloque) {
  if (!bloque) return [];
  const raw = Array.isArray(bloque) ? bloque : (Array.isArray(bloque.subscribes || bloque.publishes) ? (bloque.subscribes || bloque.publishes) : []);
  return raw.map(normalizarEntrada).filter(Boolean);
}

// Lee publishes y subscribes de un manifest sin importar si están en
// manifest.publishes/subscribes (raíz) o en manifest.events.{publishes,subscribes}
// (algunos módulos del repo los anidan — p.ej. pizzepos/productos).
function sacarContrato(manifest) {
  const srcPubs = (manifest.events && manifest.events.publishes) || manifest.publishes || [];
  const srcSubs = (manifest.events && manifest.events.subscribes) || manifest.subscribes || [];
  return {
    publishes: listaDeEventos(srcPubs),
    subscribes: listaDeEventos(srcSubs)
  };
}

// 'puertas.abierta' → 'onAbierta' · 'carta.get.response' → 'onGetResponse'
// Si el canon rompe (evento sin segmentos), devuelve 'onEvento'.
function handlerCanonico(evento) {
  if (!evento || typeof evento !== 'string') return 'onEvento';
  const seg = evento.split('.').filter(Boolean);
  const colas = seg.slice(1).length ? seg.slice(1) : seg;
  const cam = colas.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return 'on' + (cam || 'Evento');
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrador
// ─────────────────────────────────────────────────────────────────────────────

class Integrador {
  /**
   * @param {object} opts
   * @param {string} opts.reposRoot — raíz del repo (contiene modules/).
   * @param {string} opts.slug      — slug del módulo recién construido.
   * @param {object} opts.vertical  — { nombre: string } (p.ej. 'nichos'); usado
   *                                   SOLO para los eventos de pulso que emite.
   * @param {function} opts.pedirAlLLM — fn async({sistema, user}) → stringJSON.
   *                                     Inyectada por el llamador (proceso-negocio
   *                                     la implementa via ai.chat.request).
   * @param {object} opts.informePath — ruta relativa a reposRoot donde persistir
   *                                     el informe incremental.
   */
  constructor({ reposRoot, slug, vertical, pedirAlLLM, informePath }) {
    if (!reposRoot) throw new Error('Integrador: reposRoot requerido');
    if (!slug) throw new Error('Integrador: slug requerido');
    if (typeof pedirAlLLM !== 'function') throw new Error('Integrador: pedirAlLLM requerido');

    this.reposRoot = reposRoot;
    this.slug = slug;
    this.vertical = (vertical && vertical.nombre) || null;
    this.pedirAlLLM = pedirAlLLM;
    this.informePath = informePath || 'proceso-negocio/fase7b-ensamblaje.json';
  }

  // ───── punto de entrada único ─────
  async integrar() {
    // 1. CONTRATO
    const rutas = this._verificarPrerequisitos();

    // 2. LEER
    const ecosistema = this._leerEcosistema();      // todos los manifests vivos
    const nuevo      = this._leerModuloNuevo(rutas); // manifest + código + descripcion

    // 3. PENSAR (LLM — matching puro)
    const decision = await this._pedirMatching({ ecosistema, nuevo });

    // 4. GUARDAR (con rollback atómico)
    const persistido = this._persistir({ rutas, nuevo, decision });

    // 5. EMITIR (devolvemos el pulso; el llamador lo publica al bus)
    const informe = this._construirInforme({ persistido });
    this._persistirInformeIncremental(informe);

    return {
      status: 200,
      data: informe,
      pulso: {
        evento: this._nombrePulso('integrada'),
        payload: informe
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1 · CONTRATO — verificar prerrequisitos
  // ─────────────────────────────────────────────────────────────────────────
  _verificarPrerequisitos() {
    const dirModulo = this._resolverModulo(this.slug);
    if (!dirModulo) {
      throw this._falla(409, 'FASE_INCOMPLETA',
        `No existe modules/${this.slug}/ en el repo — F4 no completó esta hoja.`);
    }
    const rutaManifest = path.join(dirModulo, 'module.json');
    const rutaIndex    = path.join(dirModulo, 'index.js');
    if (!fs.existsSync(rutaManifest)) {
      throw this._falla(409, 'FASE_INCOMPLETA',
        `Falta ${rutaManifest} — F4 debe producirlo antes de F7b.`);
    }
    if (!fs.existsSync(rutaIndex)) {
      throw this._falla(409, 'FASE_INCOMPLETA',
        `Falta ${rutaIndex} — F4 debe producirlo antes de F7b.`);
    }
    return { dirModulo, rutaManifest, rutaIndex };
  }

  // Localiza modules/<slug> en el repo. Puede vivir plano (modules/<slug>) o
  // bajo una vertical (modules/<vertical>/<slug>). F4 lo escribe donde toque;
  // el reflejo lo descubre sin suponer.
  _resolverModulo(slug) {
    const modulesDir = path.join(this.reposRoot, 'modules');
    if (!fs.existsSync(modulesDir)) return null;

    const planoCandidato = path.join(modulesDir, slug);
    if (this._esDirectorioModulo(planoCandidato)) return planoCandidato;

    // buscar en subdirectorios de modules/ (una vertical de profundidad)
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sub = path.join(modulesDir, entry.name, slug);
      if (this._esDirectorioModulo(sub)) return sub;
    }
    return null;
  }

  _esDirectorioModulo(dir) {
    try {
      return fs.statSync(dir).isDirectory() &&
             fs.existsSync(path.join(dir, 'module.json'));
    } catch { return false; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2 · LEER — ecosistema vivo + módulo nuevo
  // ─────────────────────────────────────────────────────────────────────────

  // Recorre modules/**/module.json (profundidad razonable) y agrupa los eventos
  // publicados por <dominio>.<objeto>. Excluye el propio slug.
  _leerEcosistema() {
    const modulesDir = path.join(this.reposRoot, 'modules');
    const manifests = this._encontrarManifests(modulesDir, 4);

    // mapa plano: evento -> { publicado_por: [slug,...], escuchado_por: [slug,...] }
    const porEvento = new Map();

    for (const { slug, manifest } of manifests) {
      if (slug === this.slug) continue; // nunca cuenta el propio módulo

      const { publishes, subscribes } = sacarContrato(manifest);

      for (const p of publishes) {
        const r = porEvento.get(p.event) || { publicado_por: [], escuchado_por: [] };
        if (!r.publicado_por.includes(slug)) r.publicado_por.push(slug);
        porEvento.set(p.event, r);
      }
      for (const s of subscribes) {
        const r = porEvento.get(s.event) || { publicado_por: [], escuchado_por: [] };
        if (!r.escuchado_por.includes(slug)) r.escuchado_por.push(slug);
        porEvento.set(s.event, r);
      }
    }

    // reagrupar por <dominio>.<objeto> para presentárselo al LLM organizado
    const porDominioObjeto = new Map();
    for (const [evento, caras] of porEvento.entries()) {
      const seg = evento.split('.');
      const dominioObjeto = seg.length >= 2 ? `${seg[0]}.${seg[1]}` : seg[0];
      const bucket = porDominioObjeto.get(dominioObjeto) || [];
      bucket.push({ evento, ...caras });
      porDominioObjeto.set(dominioObjeto, bucket);
    }

    return { porEvento, porDominioObjeto };
  }

  _encontrarManifests(raiz, profundidadMax) {
    const salida = [];
    const visitar = (dir, profundidad) => {
      if (profundidad > profundidadMax) return;
      let entradas;
      try { entradas = fs.readdirSync(dir, { withFileTypes: true }); }
      catch { return; }

      const manifest = path.join(dir, 'module.json');
      if (fs.existsSync(manifest)) {
        try {
          const raw = fs.readFileSync(manifest, 'utf8');
          const parsed = JSON.parse(raw);
          const slug = parsed.name || path.basename(dir);
          salida.push({ slug, manifest: parsed, dir });
          // no bajamos dentro de un módulo (su interior no lleva más manifests)
          return;
        } catch { /* manifest roto: lo saltamos, no bloqueamos la fase */ }
      }

      for (const e of entradas) {
        if (!e.isDirectory()) continue;
        // excluir subcarpetas convencionales que no son módulos
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_shared') continue;
        visitar(path.join(dir, e.name), profundidad + 1);
      }
    };
    visitar(raiz, 0);
    return salida;
  }

  _leerModuloNuevo({ rutaManifest, rutaIndex }) {
    const manifestRaw = fs.readFileSync(rutaManifest, 'utf8');
    const indexRaw    = fs.readFileSync(rutaIndex, 'utf8');
    const manifest    = JSON.parse(manifestRaw);
    const { publishes, subscribes } = sacarContrato(manifest);
    const descripcion = [manifest.description, manifest._doc].filter(Boolean).join('\n\n');
    const handlersYa = this._handlersDeclaradosEnIndex(indexRaw);

    return {
      slug: manifest.name || this.slug,
      manifestRaw,
      manifest,
      indexRaw,
      descripcion,
      publishes,
      subscribes,
      handlersYa
    };
  }

  // Detecta nombres de métodos en la clase principal del index.js. Heurística
  // textual conservadora: busca `handlerName(` como declaración de método
  // (no como invocación `.handlerName(`). Suficiente para no duplicar.
  _handlersDeclaradosEnIndex(src) {
    const nombres = new Set();
    const regex = /(?:^|\n)\s{0,8}(?:async\s+)?([a-z][A-Za-z0-9_]*)\s*\(/g;
    let m;
    while ((m = regex.exec(src)) !== null) {
      const nombre = m[1];
      // sólo nos interesan los que empiezan por 'on' (handlers de bus por canon)
      if (/^on[A-Z]/.test(nombre)) nombres.add(nombre);
    }
    return nombres;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3 · PENSAR — una pregunta pura al LLM, salida JSON cerrada
  // ─────────────────────────────────────────────────────────────────────────
  async _pedirMatching({ ecosistema, nuevo }) {
    const sistema = this._promptSistema();
    const user    = this._promptUser({ ecosistema, nuevo });

    const bruto = await this.pedirAlLLM({ sistema, user });
    const parseado = this._parsearSalidaLLM(bruto);

    // reglas que el reflejo IMPONE sobre la salida (determinista):
    //   - el evento debe existir en el bus vivo
    //   - no duplicar lo que ya escucha
    //   - handler canónico si el LLM no propuso uno sano
    const subsYaConocidos = new Set(nuevo.subscribes.map((s) => s.event));
    const subscribesFinales = [];
    const descartados = [];

    for (const prop of (parseado.subscribes_a_anadir || [])) {
      const evento = prop && typeof prop.event === 'string' ? prop.event.trim() : null;
      if (!evento) { descartados.push({ prop, motivo: 'evento vacío' }); continue; }
      if (!ecosistema.porEvento.has(evento)) {
        descartados.push({ prop, motivo: 'evento no vive en el bus (no se inventa oyente para voz inexistente)' });
        continue;
      }
      if (subsYaConocidos.has(evento)) {
        descartados.push({ prop, motivo: 'ya suscrito en el manifest actual' });
        continue;
      }
      let handler = typeof prop.handler === 'string' && /^on[A-Z]/.test(prop.handler) ? prop.handler : handlerCanonico(evento);
      // evitar colisión con handler ya existente en index.js (si colisiona, canonizamos y añadimos sufijo numérico)
      let candidato = handler;
      let n = 2;
      while (nuevo.handlersYa.has(candidato) || subscribesFinales.some((s) => s.handler === candidato)) {
        candidato = `${handler}${n++}`;
      }
      subscribesFinales.push({
        event: evento,
        handler: candidato,
        publicado_por: ecosistema.porEvento.get(evento).publicado_por
      });
    }

    return { subscribesFinales, descartados };
  }

  _promptSistema() {
    return [
      'Eres el integrador F7b del proceso Enki.',
      'Enki es event-driven puro: publique quien publique, oiga quien oiga.',
      'Tu única tarea: dado un módulo recién construido y el mapa de eventos vivos del bus, elegir',
      'qué eventos del bus necesita SUSCRIBIR para hacer bien su trabajo según su descripción.',
      '',
      'REGLAS INAMOVIBLES:',
      '  · Elegir SOLO eventos que ya emiten voz en el bus (están en el mapa).',
      '  · No inventar eventos nuevos.',
      '  · No proponer suscribir eventos que el propio módulo publica.',
      '  · Si el módulo no necesita ninguno, devuelve lista vacía.',
      '  · Respuesta ÚNICA en JSON válido con la forma: { "subscribes_a_anadir": [ { "event": "...", "handler": "on..." }, ... ] }',
      '  · Nada más fuera del JSON.'
    ].join('\n');
  }

  _promptUser({ ecosistema, nuevo }) {
    // Serializar el ecosistema por <dominio>.<objeto> en bloques legibles.
    const bloques = [];
    const claves = [...ecosistema.porDominioObjeto.keys()].sort();
    for (const k of claves) {
      const items = ecosistema.porDominioObjeto.get(k)
        .filter((e) => e.publicado_por.length > 0) // sólo eventos CON voz viva
        .sort((a, b) => a.evento.localeCompare(b.evento));
      if (!items.length) continue;
      bloques.push(`${k}.*`);
      for (const it of items) {
        bloques.push(`  - ${it.evento}   (publicado por: ${it.publicado_por.join(', ')})`);
      }
    }

    const descripcion = (nuevo.descripcion || '(sin descripción declarada)').slice(0, 4000);
    const pubs = nuevo.publishes.map((p) => p.event).join(', ') || '(ninguno)';
    const subs = nuevo.subscribes.map((s) => s.event).join(', ') || '(ninguno)';

    return [
      '## Módulo recién construido',
      `slug         : ${nuevo.slug}`,
      `publica      : ${pubs}`,
      `ya escucha   : ${subs}`,
      '',
      'descripcion :',
      descripcion,
      '',
      '## Eventos VIVOS del bus (sólo con voz emisora)',
      bloques.join('\n') || '(bus sin eventos vivos relevantes)',
      '',
      '## Devuelve',
      '{ "subscribes_a_anadir": [ { "event": "<nombre_del_bus>", "handler": "on<CamelCase>" }, ... ] }',
      'Lista vacía si no necesita suscribir ninguno.'
    ].join('\n');
  }

  _parsearSalidaLLM(bruto) {
    if (typeof bruto !== 'string' || !bruto.trim()) {
      throw this._falla(502, 'LLM_SIN_RESPUESTA', 'El LLM no devolvió texto parseable.');
    }
    // tolerante: si el LLM envuelve el JSON en ```json ... ``` o añade prólogo,
    // extraemos el primer { ... } balanceado.
    const inicio = bruto.indexOf('{');
    const fin    = bruto.lastIndexOf('}');
    if (inicio < 0 || fin < inicio) {
      throw this._falla(502, 'LLM_RESPUESTA_NO_JSON', 'La respuesta del LLM no contiene JSON.', { bruto: bruto.slice(0, 500) });
    }
    const trozo = bruto.slice(inicio, fin + 1);
    try {
      const obj = JSON.parse(trozo);
      if (!obj || typeof obj !== 'object') throw new Error('no es objeto');
      if (!Array.isArray(obj.subscribes_a_anadir)) obj.subscribes_a_anadir = [];
      return obj;
    } catch (e) {
      throw this._falla(502, 'LLM_JSON_INVALIDO', `JSON del LLM inválido: ${e.message}`, { bruto: trozo.slice(0, 500) });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4 · GUARDAR — persistir con rollback atómico
  // ─────────────────────────────────────────────────────────────────────────
  _persistir({ rutas, nuevo, decision }) {
    const backup = {
      rutaManifest: rutas.rutaManifest,
      rutaIndex:    rutas.rutaIndex,
      manifestOrig: nuevo.manifestRaw,
      indexOrig:    nuevo.indexRaw
    };

    // si no hay nada que coser, devolvemos sin tocar ficheros
    if (!decision.subscribesFinales.length) {
      return {
        subscribes_añadidos: [],
        handlers_creados: [],
        descartados: decision.descartados
      };
    }

    try {
      // A) manifest.json
      const manifestNuevo = this._manifestConSubscribes(nuevo.manifest, decision.subscribesFinales);
      const manifestTexto = JSON.stringify(manifestNuevo, null, 2) + '\n';
      fs.writeFileSync(rutas.rutaManifest, manifestTexto, 'utf8');

      // B) index.js
      const indexNuevo = this._indexConHandlers(nuevo.indexRaw, decision.subscribesFinales, nuevo.handlersYa);
      this._validarSintaxisJS(indexNuevo, rutas.rutaIndex);
      fs.writeFileSync(rutas.rutaIndex, indexNuevo, 'utf8');

      return {
        subscribes_añadidos: decision.subscribesFinales.map((s) => ({
          event: s.event,
          handler: s.handler,
          publicado_por: s.publicado_por
        })),
        handlers_creados: decision.subscribesFinales
          .filter((s) => !nuevo.handlersYa.has(s.handler))
          .map((s) => s.handler),
        descartados: decision.descartados
      };
    } catch (e) {
      this._restaurarBackups(backup);
      throw this._falla(500, 'PERSISTENCIA_FALLIDA',
        `No se pudo cosir el módulo nuevo — ficheros restaurados a su estado original. ${e.message}`,
        { causa: e.message });
    }
  }

  _restaurarBackups(backup) {
    try { fs.writeFileSync(backup.rutaManifest, backup.manifestOrig, 'utf8'); } catch { /* best-effort */ }
    try { fs.writeFileSync(backup.rutaIndex,    backup.indexOrig,    'utf8'); } catch { /* best-effort */ }
  }

  // Devuelve manifest con los subscribes nuevos añadidos (respetando el
  // esquema donde ya vivan: raíz o anidados en events{}). Nunca duplica.
  _manifestConSubscribes(manifestOrig, subscribesFinales) {
    const copia = JSON.parse(JSON.stringify(manifestOrig));
    const useEventsWrapper = !!(copia.events && (copia.events.publishes || copia.events.subscribes));
    const dest = useEventsWrapper
      ? (copia.events.subscribes = copia.events.subscribes || [])
      : (copia.subscribes = copia.subscribes || []);

    const yaConocidos = new Set(listaDeEventos(dest).map((e) => e.event));
    for (const s of subscribesFinales) {
      if (yaConocidos.has(s.event)) continue;
      dest.push({
        event: s.event,
        handler: s.handler,
        description: `Integrado por F7b el ${new Date().toISOString()}: evento vivo del bus (publicado por ${s.publicado_por.join(', ') || 'desconocido'}).`
      });
      yaConocidos.add(s.event);
    }
    return copia;
  }

  // Inyecta métodos esqueleto antes del cierre de la clase principal.
  // Localiza el ÚLTIMO 'module.exports' y antes de él busca la ÚLTIMA llave
  // de cierre '}' que cierra la clase. Si no la encuentra, falla (seguro).
  _indexConHandlers(src, subscribesFinales, handlersYa) {
    const porInyectar = subscribesFinales.filter((s) => !handlersYa.has(s.handler));
    if (!porInyectar.length) return src;

    const anchorExports = src.lastIndexOf('module.exports');
    if (anchorExports < 0) {
      throw new Error('index.js no contiene module.exports — no es un módulo CommonJS válido.');
    }
    // buscar la última '}' antes de module.exports (cierre de la clase)
    let i = anchorExports - 1;
    while (i >= 0 && /\s/.test(src[i])) i--;
    if (i < 0 || src[i] !== '}') {
      throw new Error('No se localiza el cierre de la clase antes de module.exports — índice.js inesperado.');
    }

    const bloques = porInyectar.map((s) => this._esqueletoHandler(s));
    const insercion = '\n' + bloques.join('\n') + '\n';
    return src.slice(0, i) + insercion + src.slice(i);
  }

  _esqueletoHandler(s) {
    const fecha = new Date().toISOString();
    return [
      '  /**',
      `   * Handler para '${s.event}' — integrado por F7b el ${fecha}.`,
      '   *',
      `   * El evento llega del bus (publicado por: ${s.publicado_por.join(', ') || 'desconocido'}).`,
      '   * TODO (lógica de dominio): usar el payload según necesite el módulo.',
      '   * El esqueleto NO es decisión de dominio — es el enganche al bus.',
      '   * Al rellenarlo, respeta event-driven: no acoplar al emisor.',
      '   */',
      `  ${s.handler}(e) {`,
      '    const d = (e && (e.data || e)) || {};',
      '    return d;',
      '  }'
    ].join('\n');
  }

  // Valida que el fichero resultante parsea como JS. Usa vm.Script sin ejecutar.
  _validarSintaxisJS(src, rutaInformativa) {
    try {
      new vm.Script(src, { filename: rutaInformativa });
    } catch (e) {
      throw new Error(`índice.js resultante no parsea: ${e.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5 · EMITIR — informe + pulso
  // ─────────────────────────────────────────────────────────────────────────
  _construirInforme({ persistido }) {
    return {
      slug: this.slug,
      vertical: this.vertical,
      subscribes_añadidos: persistido.subscribes_añadidos,
      handlers_creados: persistido.handlers_creados,
      descartados: persistido.descartados,
      integrado_el: new Date().toISOString()
    };
  }

  // Prefijo del pulso: si hay vertical, nichos.hoja.integrada; si no, proceso.hoja.integrada.
  _nombrePulso(verbo) {
    const dominio = this.vertical || 'proceso';
    return `${dominio}.hoja.${verbo}`;
  }

  _persistirInformeIncremental(entrada) {
    const abs = path.join(this.reposRoot, this.informePath);
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      let actual = { integraciones: [] };
      if (fs.existsSync(abs)) {
        try { actual = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { actual = { integraciones: [] }; }
        if (!Array.isArray(actual.integraciones)) actual.integraciones = [];
      }
      actual.integraciones.push(entrada);
      fs.writeFileSync(abs, JSON.stringify(actual, null, 2) + '\n', 'utf8');
    } catch (e) {
      // best-effort: el cosido ya está hecho; el informe es extra.
      // No convertimos esto en fallo porque la hoja ya quedó integrada.
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // helpers de error
  // ─────────────────────────────────────────────────────────────────────────
  _falla(status, code, mensaje, data) {
    const err = new Error(mensaje);
    err.status = status;
    err.code = code;
    err.data = data || null;
    return err;
  }
}

module.exports = { Integrador, normalizarEntrada, sacarContrato, handlerCanonico };
