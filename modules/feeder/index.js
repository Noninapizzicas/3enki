'use strict';

/**
 * feeder — el ALIMENTADOR público de la cantera. El destilador SELLA patrones internos
 * → cantera; el feeder TRAE skills del ECOSISTEMA público (skills.sh / `npx skills`,
 * vercel-labs/agent-skills, anthropics/skills) → cantera. Reflejo puro.
 *
 * Los dos "find-skills" no son rivales, son un PIPELINE:
 *   skills.sh → npx skills add → SKILL.md en disco → feeder INGIERE → cosecha.importar
 *   → conserje ofrece → promover → lente viva → planificador ensambla proyectos.
 *
 * Puertas:
 *   feeder.ingerir  {fuente, md, nombre?}  → parsea un SKILL.md CRUDO y lo mete en la
 *       cantera (cosecha.importar). DETERMINISTA — la puerta universal: cualquier SKILL.md
 *       externo (de skills.sh, pegado, de una URL) entra por aquí. Es el corazón testeable.
 *   feeder.instalar {paquete, fuente?}     → `npx skills add <paquete>` → lee el/los
 *       SKILL.md instalados → ingiere cada uno. DEGRADA LIMPIO si `npx skills` no está (503).
 *   feeder.buscar   {query}                → `npx skills find <query>` → salida cruda
 *       (descubrimiento best-effort; degrada limpio).
 *
 * MANDATO fail-honest: si el CLI externo no está o falla, el feeder devuelve un error
 * limpio (503/degradado), nunca un falso éxito ni una caída. Verificar en vivo, no a fe.
 * Ver arquitectura/decisiones/propuestas/feeder-ecosistema.md.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

class FeederReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'feeder';
    this.version = '0.2.0';
  }

  onIngerirRequest(e)  { return this._atender(e, 'ingerir',  'feeder.ingerir.response',  d => this._ingerir(d)); }
  onInstalarRequest(e) { return this._atender(e, 'instalar', 'feeder.instalar.response', d => this._instalar(d)); }
  onBuscarRequest(e)   { return this._atender(e, 'buscar',   'feeder.buscar.response',   d => this._buscar(d)); }

  // ── SUPERFICIE: tools del LLM de chat (el grifo de FUERA). buscar_skill (cosecha) mira
  // DENTRO; estas miran FUERA: descubrir en el ecosistema público y traer a la cantera. ──
  async handleBuscarFueraTool(args) { return this._buscar(args || {}); }
  async handleTraerTool(args)       { return this._instalar(args || {}); }

  // ── parse SKILL.md CRUDO (frontmatter name/description/tags + cuerpo) → skill estructurada.
  // Misma forma que consume cosecha.importar. Determinista, reversible. ──
  _parseMd(raw, { nombreDefault = '' } = {}) {
    const fm = {};
    let contenido = String(raw || '');
    const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(contenido);
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
    const skill = {
      nombre: fm.name || nombreDefault,
      descripcion: fm.description || '',
      dominio: fm.dominio || fm.domain || '',
      tags: Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []),
      contenido: contenido.trim()
    };
    if (fm.lente_dominio) skill.lente_dominio = fm.lente_dominio;   // hogar declarado, si viene
    if (fm.lente_tarea) skill.lente_tarea = fm.lente_tarea;
    return skill;
  }

  // ── INGERIR: la puerta universal. Cualquier SKILL.md externo → la cantera. ──
  async _ingerir({ fuente, md, nombre } = {}) {
    if (!fuente || typeof fuente !== 'string') return this._invalid('fuente');
    if (!md || typeof md !== 'string') return this._invalid('md');
    const skill = this._parseMd(md, { nombreDefault: nombre || '' });
    if (!skill.nombre) {
      return this._errorResponse(400, 'INVALID_INPUT', 'el SKILL.md no declara name y no se pasó nombre', { field: 'name' });
    }
    const r = await this._rpc('cosecha.importar.request', { fuente, skills: [skill] });
    if (!r) return this._errorResponse(504, 'UPSTREAM_TIMEOUT', 'la cantera (cosecha) no respondió', { fuente });
    if (typeof r.status === 'number' && r.status >= 400) {
      return { status: r.status, error: r.error || { code: 'UPSTREAM_INVALID_RESPONSE', message: 'la cantera rechazó la ingesta' } };
    }
    return { status: 200, data: { fuente, ingerida: skill.nombre, dominio: skill.dominio || null, total: r.data && r.data.total } };
  }

  // ── INSTALAR: npx skills add <paquete> → lee el/los SKILL.md → ingiere. Degrada limpio. ──
  async _instalar({ paquete, fuente } = {}) {
    if (!paquete || typeof paquete !== 'string') return this._invalid('paquete');
    let dir;
    try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feeder-')); }
    catch (err) { return this._errorResponse(500, 'UNKNOWN_ERROR', err.message, {}); }
    try {
      const r = await this._ejec('npx', ['-y', 'skills', 'add', paquete, '-y'], { timeout: 90000, cwd: dir });
      if (r.degradado) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'npx skills no disponible en este entorno (el feeder degrada limpio)', { degradado: true, motivo: r.motivo });
      }
      const mds = this._buscarMds(dir);
      if (mds.length === 0) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'npx skills add no dejó ningún SKILL.md legible en el directorio', { paquete, salida: r.stdout.slice(0, 300) });
      }
      const fue = fuente || 'skills.sh';
      const ingeridas = [];
      const fallidas = [];
      for (const md of mds) {
        let raw = '';
        try { raw = fs.readFileSync(md, 'utf-8'); } catch (_) { continue; }
        const res = await this._ingerir({ fuente: fue, md: raw, nombre: path.basename(path.dirname(md)) });
        if (res.status === 200) ingeridas.push(res.data.ingerida);
        else fallidas.push({ md: path.relative(dir, md), motivo: (res.error && res.error.code) || 'error' });
      }
      return { status: 200, data: { paquete, fuente: fue, ingeridas, fallidas } };
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
    }
  }

  // ── BUSCAR: npx skills find <query> → salida cruda (best-effort, degrada limpio). ──
  async _buscar({ query } = {}) {
    if (!query || typeof query !== 'string') return this._invalid('query');
    const r = await this._ejec('npx', ['-y', 'skills', 'find', query], { timeout: 45000 });
    if (r.degradado) {
      return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'npx skills no disponible en este entorno (el feeder degrada limpio)', { degradado: true, motivo: r.motivo });
    }
    return { status: 200, data: { query, salida: r.stdout.slice(0, 4000), ok: r.ok } };
  }

  // ── helpers ──
  _ejec(cmd, args, { timeout = 60000, cwd } = {}) {
    return new Promise((resolve) => {
      execFile(cmd, args, { timeout, cwd, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && err.code === 'ENOENT') return resolve({ degradado: true, motivo: `comando no disponible: ${cmd}` });
        resolve({ degradado: false, ok: !err, code: err ? (err.code || 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
    });
  }

  _buscarMds(dir, out = []) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') this._buscarMds(p, out); }
      else if (/^SKILL\.md$/i.test(e.name)) out.push(p);
    }
    return out;
  }
}

module.exports = FeederReflejo;
