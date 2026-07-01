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

const CANTERA_DIR = path.join(__dirname, 'cantera');

class CosechaModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cosecha';
    this.version = '0.1.0';
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
  _descubrir() {
    this._skills.clear();
    let fuentes;
    try { fuentes = fs.readdirSync(CANTERA_DIR, { withFileTypes: true }); }
    catch (err) { this.logger?.warn('cosecha.cantera.missing', { error: err.message }); return; }

    for (const f of fuentes) {
      if (!f.isDirectory()) continue;
      const fuenteDir = path.join(CANTERA_DIR, f.name);
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
      contenido: contenido.trim()
    };
  }

  _fuentes() { return [...new Set([...this._skills.values()].map(s => s.fuente))]; }

  // ── handlers (una línea por op; delegan a _atender de la base) ──
  async onBuscarRequest(event)  { return this._atender(event, 'buscar',  'cosecha.buscar.response',  (d) => this._buscar(d)); }
  async onObtenerRequest(event) { return this._atender(event, 'obtener', 'cosecha.obtener.response', (d) => this._obtener(d)); }
  async onListarRequest(event)  { return this._atender(event, 'listar',  'cosecha.listar.response',  () => this._listar()); }
  async onStatsRequest(event)   { return this._atender(event, 'stats',   'cosecha.stats.response',   () => this._stats()); }

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
      nombre: s.nombre, descripcion: s.descripcion, fuente: s.fuente, dominio: s.dominio, tags: s.tags
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
}

module.exports = CosechaModule;
