'use strict';

/**
 * cosecha — LA CANTERA (biblioteca viva de skills). Hermano del cuenco (lentes-diseno).
 *
 * Teoría del Órgano, cara aditiva: el cuenco (CÚPULA) sostiene las lentes ACTIVAS,
 * inyectadas por turno cuando una página las bebe. La cosecha (CANTERA) sostiene TODA
 * la abundancia — skills de cualquier fuente (importadas de ECC/VoltAgent, o nacidas
 * del destilador) — buscable pero NO inyectada. La cúpula se mantiene VIVA porque la
 * cantera absorbe lo demás. Sumar, no restar: la abundancia bien alojada no es ruido,
 * es MUNICIÓN (el conserje mina la cantera para ofrecer en positivo).
 *
 * La cantera vive en cantera/<fuente>/<skill>/SKILL.md (formato Agent Skills de
 * Anthropic: frontmatter name/description + markdown). Conocimiento en el código
 * (como los packs del cuenco), no datos de usuario.
 *
 * Puertas (RPC del bus) — el catálogo es BARATO (sin contenido); el contenido se pide aparte:
 *   cosecha.buscar.request  { query?, dominio?, tarea?, limite? } → { skills:[{nombre,descripcion,fuente,dominio,tags}], total }
 *   cosecha.obtener.request { nombres:[] }                        → { skills:[{...,contenido}] }   (SKILL.md completo)
 *   cosecha.listar.request  {}                                    → { total, fuentes, skills:[catálogo] }
 *   cosecha.stats.request   {}                                    → { total, por_fuente, fuentes }
 *
 * La búsqueda scopeada+rankeada es lo que evita la "dilución de selección": nadie lee
 * las N descripciones enteras — se busca y se rankea, y solo se pide el contenido de lo elegido.
 */

const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// La cantera vive en DOS sitios: la SEMILLA curada (en el código, versionada) y lo
// CRECIDO en caliente por cosecha.importar (en data/, persistente, no en git). Se
// escanean ambos; ante colisión de nombre, gana lo crecido (la importación más nueva).
const CANTERA_SEED_DIR = path.join(__dirname, 'cantera');
const CANTERA_DATA_DIR = path.join(process.cwd(), 'data', 'cosecha', 'cantera');

class CosechaModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cosecha';
    this.version = '0.8.0';
    // nombre → { nombre, descripcion, fuente, dominio, tags:[], contenido }
    this._skills = new Map();
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._descubrir();
    this.logger?.info('cosecha.loaded', {
      module: this.name, version: this.version,
      skills: this._skills.size, fuentes: this._fuentes().length
    });
  }

  async onUnload() {
    this._skills.clear();
    await super.onUnload();
  }

  // ── LA CANTERA: recoge cantera/<fuente>/<skill>/SKILL.md (biblioteca, no cúpula) ──
  // Escanea SEMILLA (código) primero y luego CRECIDO (data): lo crecido gana en colisión.
  _descubrir() {
    this._skills.clear();
    this._scanDir(CANTERA_SEED_DIR);
    this._scanDir(CANTERA_DATA_DIR);
  }

  _scanDir(baseDir) {
    let fuentes;
    try { fuentes = fs.readdirSync(baseDir, { withFileTypes: true }); }
    catch (_) { return; }  // dir ausente (p.ej. data/ aún sin importaciones) = sin ruido
    for (const f of fuentes) {
      if (!f.isDirectory()) continue;
      const fuenteDir = path.join(baseDir, f.name);
      let entradas;
      try { entradas = fs.readdirSync(fuenteDir, { withFileTypes: true }); }
      catch (_) { continue; }
      for (const s of entradas) {
        if (!s.isDirectory()) continue;
        const mdPath = path.join(fuenteDir, s.name, 'SKILL.md');
        let raw;
        try { raw = fs.readFileSync(mdPath, 'utf-8'); }
        catch (_) { this.logger?.warn('cosecha.skill.sin_md', { fuente: f.name, skill: s.name }); continue; }
        const skill = this._parse(raw, { fuenteDefault: f.name, nombreDefault: s.name });
        this._skills.set(skill.nombre, skill);
      }
    }
  }

  // frontmatter simple: bloque --- ... ---, `key: value`; `tags: [a, b]` → array.
  _parse(raw, { fuenteDefault, nombreDefault }) {
    const fm = {};
    let contenido = raw;
    const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(raw);
    if (m) {
      contenido = m[2];
      for (const line of m[1].split('\n')) {
        const kv = /^([a-zA-Z_]+)\s*:\s*(.*)$/.exec(line.trim());
        if (!kv) continue;
        let v = kv[2].trim();
        if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
        fm[kv[1]] = v;
      }
    }
    return {
      nombre: fm.name || nombreDefault,
      descripcion: fm.description || '',
      fuente: fm.fuente || fm.origin || fuenteDefault,
      dominio: fm.dominio || fm.domain || '',
      tags: Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []),
      // HOGAR declarado: si la skill dice dónde vivir como lente, promover lo usa por
      // defecto y el conserje la ofrece para ACTIVAR (no solo leer). Opcional.
      lente_dominio: fm.lente_dominio || '',
      lente_tarea: fm.lente_tarea || '',
      contenido: contenido.trim()
    };
  }

  _fuentes() { return [...new Set([...this._skills.values()].map(s => s.fuente))]; }

  // ── handlers (una línea por op; delegan a _atender de la base) ──
  async onBuscarRequest(event)   { return this._atender(event, 'buscar',   'cosecha.buscar.response',   (d) => this._buscar(d)); }
  async onObtenerRequest(event)  { return this._atender(event, 'obtener',  'cosecha.obtener.response',  (d) => this._obtener(d)); }
  async onListarRequest(event)   { return this._atender(event, 'listar',   'cosecha.listar.response',   () => this._listar()); }
  async onStatsRequest(event)    { return this._atender(event, 'stats',    'cosecha.stats.response',    () => this._stats()); }
  async onImportarRequest(event) { return this._atender(event, 'importar', 'cosecha.importar.response', (d) => this._importar(d)); }
  async onPromoverRequest(event) { return this._atender(event, 'promover', 'cosecha.promover.response', (d) => this._promover(d)); }
  async onOlvidarRequest(event)  { return this._atender(event, 'olvidar',  'cosecha.olvidar.response',  (d) => this._olvidar(d)); }
  async onTraerRequest(event)    { return this._atender(event, 'traer',    'cosecha.traer.response',    (d) => this._traer(d)); }

  // ── TOOLS del LLM de chat (LA SUPERFICIE): buscar y activar skills desde CUALQUIER
  // conversación. El grifo por el que el comerciante toca la cantera — realiza el
  // "¿cómo hago X?" de find-skills sobre nuestro catálogo interno. Devuelven {status,data}. ──
  async handleBuscarTool(args)   { return this._buscar(args || {}); }
  async handlePromoverTool(args) { return this._promover(args || {}); }

  // ── el NERVIO del destilador: cuando SELLA una skill en una cúpula (memoria por
  // proyecto), la cantera la ABSORBE a la biblioteca global. Fire-and-forget: el cuerpo
  // viaja en el evento (contenido_md), sin re-consultar cúpulas. Sumar, no restar. ──
  async onSkillDestilada(event) {
    const d = (event && event.data) || event || {};
    const nombre = d.nombre_skill;
    const contenido = d.contenido_md;
    if (!nombre || !contenido) {
      this.logger?.warn('cosecha.destilada.incompleta', { nombre: nombre || null });
      return;
    }
    const r = this._importar({ fuente: 'destilador', skills: [
      { nombre, contenido, descripcion: d.descripcion || '', dominio: 'skill', tags: [] }
    ]});
    this.logger?.info('cosecha.absorbe_destilada', {
      nombre, project_id: d.project_id, ok: r.status === 200 && r.data.importadas === 1
    });
  }

  // ── proyecciones deterministas (una respuesta correcta computable) ──

  // buscar: catálogo BARATO (sin contenido), rankeado. Evita la dilución de selección.
  _buscar({ query = '', dominio = '', tarea = '', limite = 10 } = {}) {
    const q = String(query || '').toLowerCase().trim();
    const dom = String(dominio || '').toLowerCase().trim();
    const tar = String(tarea || '').toLowerCase().trim();
    const scored = [];
    for (const s of this._skills.values()) {
      if (dom && String(s.dominio).toLowerCase() !== dom) continue;
      const heno = `${s.nombre} ${s.descripcion} ${s.tags.join(' ')} ${s.dominio}`.toLowerCase();
      let score = 0;
      if (q) for (const t of q.split(/\s+/)) if (t && heno.includes(t)) score += 2;
      if (tar && heno.includes(tar)) score += 3;
      if (!q && !tar) score = 1; // sin filtro (o solo dominio): todo lo que pasó el dominio entra
      if (score > 0) scored.push({ score, s });
    }
    scored.sort((a, b) => b.score - a.score);
    const lim = Math.max(1, Number(limite) || 10);
    const skills = scored.slice(0, lim).map(({ s }) => ({
      nombre: s.nombre, descripcion: s.descripcion, fuente: s.fuente, dominio: s.dominio, tags: s.tags,
      // el HOGAR viaja en el catálogo: el conserje distingue promover (activar) de obtener (leer).
      ...(s.lente_dominio ? { lente_dominio: s.lente_dominio } : {}),
      ...(s.lente_tarea ? { lente_tarea: s.lente_tarea } : {})
    }));
    return { status: 200, data: { skills, total: scored.length } };
  }

  // obtener: el SKILL.md COMPLETO de las pedidas (lo caro, solo bajo demanda).
  _obtener({ nombres = [] } = {}) {
    if (!Array.isArray(nombres) || nombres.length === 0) return this._invalid('nombres');
    const skills = nombres
      .map(n => this._skills.get(n))
      .filter(Boolean)
      .map(s => ({ nombre: s.nombre, descripcion: s.descripcion, fuente: s.fuente, dominio: s.dominio, tags: s.tags, contenido: s.contenido }));
    const faltan = nombres.filter(n => !this._skills.has(n));
    return { status: 200, data: { skills, faltan } };
  }

  _listar() {
    const skills = [...this._skills.values()].map(s => ({
      nombre: s.nombre, descripcion: s.descripcion, fuente: s.fuente, dominio: s.dominio, tags: s.tags
    }));
    return { status: 200, data: { total: skills.length, fuentes: this._fuentes(), skills } };
  }

  _stats() {
    const porFuente = {};
    for (const s of this._skills.values()) porFuente[s.fuente] = (porFuente[s.fuente] || 0) + 1;
    return { status: 200, data: { total: this._skills.size, por_fuente: porFuente, fuentes: this._fuentes() } };
  }

  // importar: la puerta de "sumar" — CUALQUIER fuente (destilador, ECC, un .md suelto)
  // vuelca skills a la cantera CRECIDA (data/, persistente). Escribe cada una como
  // SKILL.md y re-indexa. Idempotente por nombre (re-importar pisa la versión previa).
  _importar({ fuente = '', skills = [] } = {}) {
    if (!fuente || typeof fuente !== 'string') return this._invalid('fuente');
    if (!Array.isArray(skills) || skills.length === 0) return this._invalid('skills');
    const fuenteSlug = this._slug(fuente);
    let importadas = 0;
    const rechazadas = [];
    for (const raw of skills) {
      const nombre = raw && raw.nombre ? String(raw.nombre).trim() : '';
      const contenido = raw && raw.contenido ? String(raw.contenido) : '';
      if (!nombre || !contenido) { rechazadas.push({ nombre: nombre || '(sin nombre)', motivo: 'nombre+contenido requeridos' }); continue; }
      const dir = path.join(CANTERA_DATA_DIR, fuenteSlug, this._slug(nombre));
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SKILL.md'), this._serializar({ ...raw, nombre, fuente }), 'utf-8');
        importadas++;
      } catch (err) {
        rechazadas.push({ nombre, motivo: err.message });
      }
    }
    this._descubrir();  // re-indexa (semilla + crecido)
    this.metrics?.increment('cosecha.importadas.total', { fuente: fuenteSlug });
    return { status: 200, data: { fuente, importadas, rechazadas, total: this._skills.size } };
  }

  // promover: el PUENTE cantera → cuenco. Toma una skill de la abundancia y se la
  // entrega al cuenco (lentes-diseno) para que la MONTE como lente activa del dominio;
  // el nervio de ai-gateway la inyectará por turno en las páginas que beban ese dominio.
  // El cuenco pone la guarda no-colgantes (409 si el dominio no existe); aquí se propaga.
  async _promover({ nombre, dominio, tarea, cuando_usar } = {}) {
    if (!nombre || typeof nombre !== 'string') return this._invalid('nombre');
    const skill = this._skills.get(nombre);
    if (!skill) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `skill desconocida en la cantera: ${nombre}`, { faltan: [nombre] });
    }
    // el dominio/tarea pueden venir del caller o del HOGAR declarado por la skill.
    // Así el conserje ofrece `cosecha.promover:<nombre>` a secas y promover sabe dónde.
    const dominioFinal = (dominio && String(dominio)) || skill.lente_dominio;
    const tareaFinal = tarea !== undefined ? tarea : (skill.lente_tarea || undefined);
    if (!dominioFinal) {
      return this._errorResponse(400, 'INVALID_INPUT', 'falta `dominio` (ni en el parámetro ni declarado por la skill)', { field: 'dominio' });
    }
    const resp = await this._rpc('lentes.montar.request', {
      dominio: dominioFinal, nombre, contenido: skill.contenido,
      cuando_usar: cuando_usar || skill.descripcion || '',
      tarea: tareaFinal
    });
    if (!resp) {
      return this._errorResponse(504, 'UPSTREAM_TIMEOUT', 'el cuenco (lentes-diseno) no respondió al montaje', { dominio: dominioFinal, nombre });
    }
    if (typeof resp.status === 'number' && resp.status >= 400) {
      // propaga el veredicto del cuenco tal cual (p.ej. 409 colgante).
      return { status: resp.status, error: resp.error || { code: 'UPSTREAM_INVALID_RESPONSE', message: 'el cuenco rechazó el montaje' } };
    }
    this.metrics?.increment('cosecha.promovidas.total', { dominio: dominioFinal });
    return { status: 200, data: { nombre, dominio: dominioFinal, promovida: true, montaje: resp.data || null } };
  }

  // traer: EL TRAYECTO como OP DETERMINISTA (buscar → elegir → instalar → VERIFICAR →
  // veredicto). El outcome lo computa el reflejo, no lo narra el LLM: por eso el falso
  // éxito se vuelve IMPOSIBLE (no solo desaconsejado). Patrón blueprint-agentico — el único
  // paso fuzzy (¿cuál encaja?) lo puede resolver el LLM pasando `paquete`; si no, el reflejo
  // elige la MÁS INSTALADA (determinista). VERIFICAR contra el store propio es el freno:
  // no devuelve ok:true si la skill no acabó en la cantera.
  async _traer({ query, paquete, fuente } = {}) {
    let elegido = paquete && String(paquete).trim();
    let candidatos = [];

    // 1) elegir el paquete: el caller ya lo trae (PENSAR del LLM), o lo pone el reflejo
    //    por instalaciones (determinista, "la más usada").
    if (!elegido) {
      const q = query && String(query).trim();
      if (!q) return this._invalid('query|paquete');
      const b = await this._rpc('feeder.buscar.request', { query: q });
      if (!b) return this._errorResponse(504, 'UPSTREAM_TIMEOUT', 'el feeder no respondió a la búsqueda', { query: q });
      if (typeof b.status === 'number' && b.status >= 400) {
        return { status: 200, data: { ok: false, motivo: (b.error && b.error.message) || 'no pude buscar fuera', query: q, candidatos: [] } };
      }
      candidatos = (b.data && b.data.candidatos) || [];
      if (candidatos.length === 0) {
        return { status: 200, data: { ok: false, motivo: `sin resultados en skills.sh para "${q}"`, query: q, candidatos: [] } };
      }
      elegido = candidatos[0].id;   // el feeder ya los ordena por instalaciones desc
    }

    // 2) instalar (feeder.instalar → cosecha.importar; re-indexa este mismo store).
    const inst = await this._rpc('feeder.instalar.request', { paquete: elegido, ...(fuente ? { fuente } : {}) }, { timeout_ms: 95000 });
    if (!inst) return this._errorResponse(504, 'UPSTREAM_TIMEOUT', 'el feeder no respondió a la instalación', { paquete: elegido });
    if (typeof inst.status === 'number' && inst.status >= 400) {
      return { status: 200, data: { ok: false, paquete: elegido, motivo: (inst.error && inst.error.message) || 'falló la instalación', candidatos } };
    }
    const ingeridas = (inst.data && Array.isArray(inst.data.ingeridas)) ? inst.data.ingeridas : [];

    // 3) VERIFICAR (el freno): ¿acabó de verdad en la cantera? La verdad es el store, no el eco.
    const enCantera = ingeridas.filter(n => this._skills.has(n));
    if (enCantera.length === 0) {
      return { status: 200, data: { ok: false, paquete: elegido, motivo: 'la instalación no dejó ninguna skill legible en la cantera', ingeridas, candidatos } };
    }
    this.metrics?.increment('cosecha.traidas.total', {});
    return { status: 200, data: { ok: true, paquete: elegido, traidas: enCantera, total: this._skills.size } };
  }

  // olvidar: la reversibilidad de importar. Borra una skill CRECIDA (en data/) y re-indexa.
  // La semilla (en el código) es intocable: no vive en data/, así que pedir olvidarla → 409.
  _olvidar({ nombre } = {}) {
    if (!nombre || typeof nombre !== 'string') return this._invalid('nombre');
    const skill = this._skills.get(nombre);
    if (!skill) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `skill desconocida en la cantera: ${nombre}`, { faltan: [nombre] });
    }
    const dir = path.join(CANTERA_DATA_DIR, this._slug(skill.fuente), this._slug(nombre));
    if (!fs.existsSync(dir)) {
      return this._errorResponse(409, 'CONFLICT_STATE',
        `'${nombre}' es semilla (vive en el código): no se olvida en caliente`, { fuente: skill.fuente });
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); }
    catch (err) { return this._errorResponse(500, 'UNKNOWN_ERROR', `no se pudo olvidar: ${err.message}`, { nombre }); }
    this._descubrir();   // re-indexa (semilla + crecido restante)
    this.metrics?.increment('cosecha.olvidadas.total', { fuente: this._slug(skill.fuente) });
    return { status: 200, data: { nombre, olvidada: true, total: this._skills.size } };
  }

  // serializa una skill a SKILL.md (frontmatter + markdown). Reversible por _parse.
  _serializar({ nombre, descripcion = '', fuente = '', dominio = '', tags = [], lente_dominio = '', lente_tarea = '', contenido = '' }) {
    const tagsStr = Array.isArray(tags) ? `[${tags.join(', ')}]` : String(tags || '');
    const fm = [
      '---',
      `name: ${nombre}`,
      `description: ${String(descripcion).replace(/\n/g, ' ')}`,
      `fuente: ${fuente}`,
      `dominio: ${dominio}`,
      `tags: ${tagsStr}`,
      ...(lente_dominio ? [`lente_dominio: ${lente_dominio}`] : []),   // hogar declarado (opcional)
      ...(lente_tarea ? [`lente_tarea: ${lente_tarea}`] : []),
      '---',
      ''
    ].join('\n');
    return fm + String(contenido).trim() + '\n';
  }

  _slug(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  }
}

module.exports = CosechaModule;
