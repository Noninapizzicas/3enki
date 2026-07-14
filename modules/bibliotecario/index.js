'use strict';

/**
 * bibliotecario — EL PUENTE A LA BIBLIOTECA EXTERNA (repo Noninapizzicas/Conocimiento).
 *
 * Hermano de la cosecha (cantera de skills), otra cara de la Teoría del Órgano:
 *   - la cosecha aloja el saber del SISTEMA  (skills: cómo se construye/opera 2enki)
 *   - el bibliotecario aloja el saber del MUNDO (la bóveda Obsidian: trading, cultivo,
 *     refrigeración, comercio… — notas markdown enlazadas, cosechadas por el agente
 *     acumulador-sectorial y fechadas para envejecer con honestidad)
 *
 * La decisión de diseño: los dos substratos NO se fusionan. El código del sistema vive
 * en 2enki; el saber del mundo vive en su propio repo (Conocimiento). El bibliotecario
 * los une por un PRÉSTAMO, no por una copia — mantiene un mirror git de solo-lectura y
 * sirve las notas por el bus. El agente/skill arranca LIGERO y pide prestados solo los
 * libros que la tarea justifica (reach-not-resident): el catálogo (índice barato de los
 * MOC) cabe siempre en el turno; el libro (caro) se pide aparte.
 *
 * Puertas (RPC del bus):
 *   bibliotecario.catalogo.request    {}                         → { sectores:[{sector,titulo,notas,dudosos}], total, stale }
 *   bibliotecario.prestamo.request    { sector } | { consulta, topK? } → { libros:[{ruta,titulo,sector,cosechado,dudoso,cuerpo}], por, stale }
 *   bibliotecario.sincronizar.request {}                         → { sincronizado, cambios, sectores, libros, stale }
 *
 * Degradación honesta (como el feeder/cantera-semantica): si el mirror falta y el clone
 * falla (sin credencial/red), sirve del último mirror bueno o catálogo vacío con
 * stale:true — nunca cuelga, nunca miente. El préstamo POR_SIGNIFICADO cae a palabras
 * (BM25-lite) mientras el vault no esté indexado en la cantera semántica; lo declara en `por`.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const MIRROR_DIR   = path.join(process.cwd(), 'data', 'bibliotecario', 'mirror');
const CLONE_TIMEOUT_MS = 120000;   // el pack de un vault es pequeño, pero damos aire por si la red parpadea
const PULL_TIMEOUT_MS  = 60000;
const TOPK_SIGNIFICADO = 5;        // consulta → pocas notas, señal limpia (presupuesto top-K)
const TOPK_REFERENCIA  = 40;       // sector → sus libros, con tope anti-volcado

class BibliotecarioModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'bibliotecario';
    this.version = '0.1.0';

    // Config (inyectada en onLoad)
    this.repoUrl     = null;
    this.ref         = 'main';
    this.vaultSubdir = 'boveda';
    this.mirrorPath  = MIRROR_DIR;

    // Estado runtime
    this._catalogoCache = new Map();   // sector → { sector, titulo, notas, dudosos }
    this._libros = 0;                  // total de notas indexadas
    this._stale = true;                // true hasta que un mirror bueno esté disponible
    this._motivo = 'sin sincronizar';  // por qué está stale, para degradar honesto
  }

  // =============================================================
  // Lifecycle
  // =============================================================

  async onLoad(context) {
    await super.onLoad(context);

    const cfg = (context.moduleConfig && context.moduleConfig.biblioteca) || {};
    this.repoUrl     = cfg.repo_url || 'https://github.com/Noninapizzicas/Conocimiento.git';
    this.ref         = cfg.ref || 'main';
    this.vaultSubdir = cfg.vault_subdir || 'boveda';
    this.mirrorPath  = cfg.mirror_path || MIRROR_DIR;   // override para test/despliegue; default data/bibliotecario/mirror

    // Materializar el mirror best-effort: si ya existe lo usamos; si no, clonamos.
    // Nunca bloquea el arranque — si falla, degradamos honesto (stale:true).
    try {
      await this._ensureMirror();
      this._reindexar();
    } catch (err) {
      this._stale = true;
      this._motivo = `mirror no disponible: ${err.message}`;
      this.logger?.warn('bibliotecario.mirror.degradado', { motivo: this._motivo });
    }

    this.logger?.info('bibliotecario.loaded', {
      module: this.name, version: this.version,
      sectores: this._catalogoCache.size, libros: this._libros, stale: this._stale
    });
  }

  async onUnload() {
    this._catalogoCache.clear();
    this._libros = 0;
    await super.onUnload();
  }

  // =============================================================
  // Bus API — un on<Op>Request de una línea, delega a _atender (base)
  // =============================================================

  async onCatalogoRequest(event)    { return this._atender(event, 'catalogo',    'bibliotecario.catalogo.response',    ()  => this._catalogo()); }
  async onPrestamoRequest(event)    { return this._atender(event, 'prestamo',    'bibliotecario.prestamo.response',    (d) => this._prestar(d)); }
  async onSincronizarRequest(event) { return this._atender(event, 'sincronizar', 'bibliotecario.sincronizar.response', ()  => this._sincronizar()); }

  // =============================================================
  // Tools del LLM — handleXxx, shape canónico { status, data | error }
  // =============================================================

  async handleCatalogoTool() {
    try {
      this.metrics?.increment('bibliotecario.catalogo.served');
      return this._catalogo();
    } catch (err) {
      return this._handleHandlerError('bibliotecario.catalogo.tool.failed', err, 'tool_catalogo');
    }
  }

  async handleConsultarTool(args) {
    try {
      if (!args || typeof args !== 'object') {
        return this._errorResponse(400, 'INVALID_INPUT', 'args debe ser un object', { kind: 'shape' });
      }
      const { sector, consulta } = args;
      if (!sector && !consulta) {
        return this._errorResponse(400, 'INVALID_INPUT', 'indica un sector o una consulta', { field: 'sector|consulta' });
      }
      return this._prestar(args);
    } catch (err) {
      return this._handleHandlerError('bibliotecario.consultar.tool.failed', err, 'tool_consultar');
    }
  }

  // =============================================================
  // Dominio (protegido) — el saber hacer del bibliotecario
  // =============================================================

  /** Índice BARATO: sectores + título de su MOC + recuento. No abre las notas. */
  _catalogo() {
    const sectores = [...this._catalogoCache.values()]
      .sort((a, b) => a.sector.localeCompare(b.sector));
    return {
      status: 200,
      data: {
        sectores,
        total: sectores.length,
        libros: this._libros,
        stale: this._stale,
        ...(this._stale ? { motivo: this._motivo } : {})
      }
    };
  }

  /** Presta los libros: por_referencia (sector) o por_significado (consulta, degrada a palabras). */
  _prestar(d) {
    const start = Date.now();
    const sector = typeof d.sector === 'string' ? d.sector.trim() : '';
    const consulta = typeof d.consulta === 'string' ? d.consulta.trim() : '';

    let libros;
    let por;
    if (sector) {
      por = 'referencia';
      const topK = Number.isFinite(d.topK) ? d.topK : TOPK_REFERENCIA;
      libros = this._notasDeSector(sector).slice(0, topK).map(p => this._leerLibro(p));
      if (libros.length === 0) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `sector sin libros: ${sector}`, {
          entity_type: 'sector', entity_id: sector, stale: this._stale
        });
      }
    } else {
      // POR_SIGNIFICADO — hoy servido por PALABRAS (BM25-lite). Honesto: `por: 'palabras'`.
      // Cuando el vault se indexe en cantera-semantica, aquí delegará a significado real.
      por = 'palabras';
      const topK = Number.isFinite(d.topK) ? d.topK : TOPK_SIGNIFICADO;
      libros = this._buscarPorPalabras(consulta, topK).map(p => this._leerLibro(p));
    }

    this.metrics?.increment('bibliotecario.prestamo.served', { por });
    this.metrics?.timing('bibliotecario.prestamo.duration_ms', Date.now() - start);
    return { status: 200, data: { libros, por, total: libros.length, stale: this._stale } };
  }

  /** git pull del mirror; si hay novedades reindexa y emite bibliotecario.actualizada. */
  async _sincronizar() {
    const start = Date.now();
    this.metrics?.increment('bibliotecario.sincronizar.total');
    try {
      await this._ensureMirror();
      const antes = this._libros;
      const salida = await this._git(['-C', this.mirrorPath, 'pull', '--ff-only'], PULL_TIMEOUT_MS);
      this._reindexar();
      const cambios = !/Already up to date|Ya está actualizado/i.test(salida) || this._libros !== antes;

      if (cambios) {
        await this._publicarEvento('bibliotecario.actualizada', {
          sectores: this._catalogoCache.size,
          libros: this._libros,
          resumen: `biblioteca sincronizada: ${this._catalogoCache.size} sectores, ${this._libros} libros`
        });
      }
      this.metrics?.timing('bibliotecario.sincronizar.duration_ms', Date.now() - start);
      return {
        status: 200,
        data: { sincronizado: true, cambios, sectores: this._catalogoCache.size, libros: this._libros, stale: this._stale }
      };
    } catch (err) {
      // Degradación honesta: seguimos sirviendo del último mirror bueno.
      this._stale = true;
      this._motivo = `pull falló: ${err.message}`;
      this.logger?.warn('bibliotecario.sincronizar.degradado', { motivo: this._motivo });
      return {
        status: 200,
        data: { sincronizado: false, cambios: false, sectores: this._catalogoCache.size, libros: this._libros, stale: true, motivo: this._motivo }
      };
    }
  }

  // =============================================================
  // Privados — mirror git + escaneo del vault + parse de nota
  // =============================================================

  /** Si el mirror no existe, clona (shallow). Best-effort — deja stale/motivo si falla. */
  async _ensureMirror() {
    const vaultDir = path.join(this.mirrorPath, this.vaultSubdir);
    if (fs.existsSync(vaultDir)) { this._stale = false; return; }

    fs.mkdirSync(path.dirname(this.mirrorPath), { recursive: true });
    // clone --depth 1 --branch <ref>: el mirror no necesita historial, solo el árbol vivo.
    await this._git(['clone', '--depth', '1', '--branch', this.ref, this.repoUrl, this.mirrorPath], CLONE_TIMEOUT_MS);
    if (!fs.existsSync(vaultDir)) {
      throw new Error(`el repo clonó pero no contiene ${this.vaultSubdir}/`);
    }
    this._stale = false;
    this._motivo = '';
  }

  /** Escanea boveda/ → construye el catálogo (sector → título MOC + recuento). */
  _reindexar() {
    this._catalogoCache.clear();
    this._libros = 0;
    const vaultDir = path.join(this.mirrorPath, this.vaultSubdir);
    let entradas;
    try { entradas = fs.readdirSync(vaultDir, { withFileTypes: true }); }
    catch (_) { return; }  // vault ausente = catálogo vacío (stale ya marcado)

    for (const e of entradas) {
      if (!e.isDirectory()) continue;                 // README.md del vault-root no es sector
      const sector = e.name;
      const notas = this._walkMd(path.join(vaultDir, sector));
      if (notas.length === 0) continue;
      const moc = notas.find(p => /(^|\/)00 - .*\(MOC\)\.md$/i.test(p) || /(^|\/)00 - /.test(path.basename(p)));
      const dudosos = notas.filter(p => this._esDudoso(p)).length;
      this._catalogoCache.set(sector, {
        sector,
        titulo: moc ? this._tituloDe(moc) : sector,
        notas: notas.length,
        dudosos
      });
      this._libros += notas.length;
    }
    this.metrics?.gauge?.('bibliotecario.sectores', this._catalogoCache.size);
    this.metrics?.gauge?.('bibliotecario.libros', this._libros);
  }

  /** Rutas absolutas de todas las notas .md bajo un sector (recursivo, sub-sectores incluidos). */
  _notasDeSector(sector) {
    // Acepta 'trading' o 'trading/opciones'. Normaliza y evita salir del vault (path traversal).
    const vaultDir = path.join(this.mirrorPath, this.vaultSubdir);
    const objetivo = path.resolve(vaultDir, sector);
    if (!objetivo.startsWith(path.resolve(vaultDir))) return [];   // guard traversal
    return this._walkMd(objetivo);
  }

  /** BM25-lite: puntúa cada nota por frecuencia de los términos de la consulta (título pesa x3). */
  _buscarPorPalabras(consulta, topK) {
    const terminos = this._tokenizar(consulta);
    if (terminos.length === 0) return [];
    const vaultDir = path.join(this.mirrorPath, this.vaultSubdir);
    const todas = this._walkMd(vaultDir);
    const puntuadas = [];
    for (const p of todas) {
      let raw;
      try { raw = fs.readFileSync(p, 'utf-8'); } catch (_) { continue; }
      const titulo = this._tituloDe(p).toLowerCase();
      const cuerpo = raw.toLowerCase();
      let score = 0;
      for (const t of terminos) {
        const enTitulo = titulo.split(t).length - 1;
        const enCuerpo = cuerpo.split(t).length - 1;
        score += enTitulo * 3 + enCuerpo;
      }
      if (score > 0) puntuadas.push({ p, score });
    }
    puntuadas.sort((a, b) => b.score - a.score);
    return puntuadas.slice(0, topK).map(x => x.p);
  }

  /** Lee una nota → { ruta, titulo, sector, cosechado, dudoso, cuerpo }. */
  _leerLibro(absPath) {
    const vaultDir = path.join(this.mirrorPath, this.vaultSubdir);
    const rel = path.relative(vaultDir, absPath);
    let raw = '';
    try { raw = fs.readFileSync(absPath, 'utf-8'); } catch (_) { /* nota ilegible → cuerpo vacío */ }
    const fm = this._frontmatter(raw);
    return {
      ruta: path.join(this.vaultSubdir, rel),
      titulo: this._tituloDe(absPath, raw),
      sector: rel.split(path.sep)[0] || '',
      cosechado: fm.cosechado || '',
      dudoso: this._esDudoso(absPath, raw),
      cuerpo: raw
    };
  }

  // ── utilidades de parseo ──

  /** Recoge rutas .md bajo un dir, recursivo. */
  _walkMd(dir) {
    const out = [];
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (_) { return out; }
    for (const e of entradas) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...this._walkMd(full));
      else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
    }
    return out;
  }

  /** Título: primer `# H1` del cuerpo, si no el nombre de fichero sin extensión. */
  _tituloDe(absPath, raw = null) {
    const texto = raw != null ? raw : (() => { try { return fs.readFileSync(absPath, 'utf-8'); } catch (_) { return ''; } })();
    const m = /^#\s+(.+)$/m.exec(texto);
    if (m) return m[1].trim();
    return path.basename(absPath, '.md');
  }

  /** Frontmatter simple `--- key: value ---` → objeto. */
  _frontmatter(raw) {
    const fm = {};
    const m = /^---\s*\n([\s\S]*?)\n---/.exec(raw);
    if (!m) return fm;
    for (const line of m[1].split('\n')) {
      const kv = /^([a-zA-Z_]+)\s*:\s*(.*)$/.exec(line.trim());
      if (kv) fm[kv[1]] = kv[2].trim();
    }
    return fm;
  }

  /** ¿Dato marcado a verificar? El agente lo marca con ⚠️ / "a verificar" en la nota. */
  _esDudoso(absPath, raw = null) {
    const texto = raw != null ? raw : (() => { try { return fs.readFileSync(absPath, 'utf-8'); } catch (_) { return ''; } })();
    return /⚠️|a verificar/i.test(texto);
  }

  _tokenizar(s) {
    return (s || '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3);   // descarta ruido (de, la, el…)
  }

  /** Wrapper de git como promesa, con timeout. Resuelve stdout; rechaza con stderr. */
  _git(args, timeout_ms) {
    return new Promise((resolve, reject) => {
      execFile('git', args, { timeout: timeout_ms, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const e = new Error((stderr || err.message || 'git error').toString().trim());
          e._code = /could not read|authentication|permission|denied|403|not found/i.test(stderr || '')
            ? 'AUTHENTICATION_REQUIRED' : 'UPSTREAM_UNREACHABLE';
          return reject(e);
        }
        resolve((stdout || '').toString());
      });
    });
  }
}

module.exports = BibliotecarioModule;
