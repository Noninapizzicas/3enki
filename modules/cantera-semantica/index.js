'use strict';

/**
 * cantera-semantica — ÍNDICE SEMÁNTICO de la cantera (skills) sobre TURSO.
 *
 * El upgrade que la cabecera aplaza en cinco sitios ("semántica DETERMINISTA por
 * prefijo · cero embeddings · HNSW para después"): buscar por SIGNIFICADO, no por
 * palabra. Turso (SQLite reescrito en Rust) trae búsqueda vectorial NATIVA — se
 * guardan embeddings (vector32) y se ordena por distancia coseno (vector_distance_cos).
 *
 * DISCIPLINA (patrón Enki, reversible y honesto):
 *   - NACE OFF (interruptor 'cantera-semantica', grupo 'sistema'). Turso es BETA y
 *     dependencia opcional → encender el índice semántico es decisión consciente.
 *   - DEGRADA LIMPIO (fail-honest, como el feeder): sin Turso instalado, o con el
 *     interruptor OFF, o sin embeddings → 503 { degradado, motivo }. El caller cae al
 *     buscar por PALABRAS de siempre (cosecha.buscar). Nunca finge un resultado.
 *   - NO toca los datos vivos: índice aparte en data/cantera-semantica/index.db. La
 *     cantera keyword sigue intacta; esto la COMPLEMENTA.
 *
 * REPARTO: el reflejo custodia el índice (indexar/buscar/reindexar, determinista);
 * el EMBEDDING (lo fuzzy) lo pide al ai-gateway (embedding.generate.request → vector).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'cantera-semantica', 'index.db');

// Carga OPCIONAL de Turso: si el paquete no está (deploy sin él), el módulo degrada.
let turso = null;
try { turso = require('@tursodatabase/database'); } catch (_) { turso = null; }

class CanteraSemanticaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cantera-semantica';
    this.version = 'reflejo-0.1.0';
    this.activo = false;            // interruptor OFF por defecto (Turso beta · opcional)
    this._turso = turso;
    this._dbPath = DEFAULT_DB_PATH; // overridable en test (:memory:)
    this._connPromise = null;
    this._dim = null;               // dimensión del embedding (lazy, de la primera indexación)
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._registrarBoton();
  }

  _registrarBoton() {
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'cantera-semantica',
        label: 'Cantera semántica (buscar skills por significado · Turso)',
        grupo: 'sistema',
        descripcion: 'Índice vectorial de la cantera sobre Turso: buscar_semantica ordena por SIGNIFICADO. OFF = el chat busca por palabras (cosecha.buscar). Turso es BETA → nace apagado.',
        default: false
      });
    } catch (_) { /* best-effort */ }
  }

  onSolicitarRegistro() { this._registrarBoton(); }

  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id === 'cantera-semantica') {
      this.activo = !!d.enabled;
      this.logger?.info?.('cantera-semantica.toggled', { activo: this.activo });
    }
  }

  // ── RPC del bus ──
  onIndexarRequest(e)  { return this._atender(e, 'indexar', 'cantera.indexar.response', d => this._indexar(d)); }
  onBuscarRequest(e)   { return this._atender(e, 'buscar_semantica', 'cantera.buscar_semantica.response', d => this._buscar(d)); }
  onReindexarRequest(e){ return this._atender(e, 'reindexar', 'cantera.reindexar.response', d => this._reindexar(d)); }
  onEstadoRequest(e)   { return this._atender(e, 'semantica_estado', 'cantera.semantica_estado.response', d => this._estado(d)); }

  // ── Turso: conexión perezosa (una vez) ──
  async _db() {
    if (!this._turso) return null;
    if (!this._connPromise) {
      if (this._dbPath !== ':memory:') {
        try { fs.mkdirSync(path.dirname(this._dbPath), { recursive: true }); } catch (_) {}
      }
      this._connPromise = this._turso.connect(this._dbPath);
    }
    return this._connPromise;
  }

  async _ensureSchema(db, dim) {
    // esquema perezoso: la dimensión la fija el primer embedding (768/1536/… según modelo)
    await db.exec(`CREATE TABLE IF NOT EXISTS skills (nombre TEXT PRIMARY KEY, dominio TEXT, texto TEXT, emb F32_BLOB(${dim}))`);
    this._dim = dim;
  }

  // ── EMBEDDING (lo fuzzy): lo pide al ai-gateway. Overridable en test. ──
  async _embed(texto) {
    const r = await this._rpc('embedding.generate.request', {
      correlation_id: crypto.randomUUID(), project_id: 'system',
      content: String(texto || ''), source: 'cantera-semantica'
    }, { timeout_ms: 15000 });
    return (r && Array.isArray(r.vector)) ? r.vector : null;
  }

  // guarda: sin Turso o interruptor OFF → degradado honesto (el caller cae a keyword)
  _guardDegradado() {
    if (!this._turso) return this._degradado('turso_no_disponible');
    if (!this.activo) return this._degradado('apagado');
    return null;
  }
  _degradado(motivo) {
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `cantera-semantica degradada: ${motivo}`, details: { degradado: true, motivo } } };
  }

  // ── indexar una skill (embed → upsert) ──
  async _indexar(input) {
    const g = this._guardDegradado(); if (g) return g;
    if (!input.nombre) return this._invalid('nombre');
    if (!input.texto) return this._invalid('texto');
    const vec = await this._embed(input.texto);
    if (!vec) return this._degradado('embeddings_no_disponibles');
    const db = await this._db();
    await this._ensureSchema(db, vec.length);
    if (this._dim && vec.length !== this._dim) {
      return this._errorResponse(409, 'CONFLICT_STATE', 'dimensión de embedding distinta al índice (¿cambió el modelo?)', { esperado: this._dim, recibido: vec.length });
    }
    await db.prepare(
      'INSERT INTO skills (nombre, dominio, texto, emb) VALUES (?, ?, ?, vector32(?)) ' +
      'ON CONFLICT(nombre) DO UPDATE SET dominio=excluded.dominio, texto=excluded.texto, emb=excluded.emb'
    ).run(String(input.nombre), String(input.dominio || ''), String(input.texto), JSON.stringify(vec));
    return { status: 200, data: { indexado: input.nombre, dims: vec.length } };
  }

  // ── buscar por significado (embed query → orden por distancia coseno) ──
  async _buscar(input) {
    const g = this._guardDegradado(); if (g) return g;
    if (!input.query) return this._invalid('query');
    const vec = await this._embed(input.query);
    if (!vec) return this._degradado('embeddings_no_disponibles');
    const db = await this._db();
    // si el índice aún no existe (nada indexado) → vacío, no error
    const existe = await this._tablaExiste(db);
    if (!existe) return { status: 200, data: { resultados: [], total: 0, indice_vacio: true } };
    const lim = Math.max(1, Math.min(parseInt(input.limite, 10) || 10, 50)); // entero saneado → seguro inline (Turso beta no acepta LIMIT parametrizado)
    const dom = input.dominio ? String(input.dominio) : null;
    const sql =
      'SELECT nombre, dominio, vector_distance_cos(emb, vector32(?)) AS dist FROM skills ' +
      (dom ? 'WHERE dominio = ? ' : '') +
      `ORDER BY dist ASC LIMIT ${lim}`;
    const params = dom ? [JSON.stringify(vec), dom] : [JSON.stringify(vec)];
    const rows = await db.prepare(sql).all(...params);
    const resultados = (rows || []).map(r => ({ nombre: r.nombre, dominio: r.dominio, distancia: Number(r.dist) }));
    return { status: 200, data: { resultados, total: resultados.length, por: 'significado' } };
  }

  async _tablaExiste(db) {
    try {
      const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='skills'").all();
      return Array.isArray(r) && r.length > 0;
    } catch (_) { return false; }
  }

  // ── reindexar: trae todas las skills de la cantera (cosecha) y las indexa ──
  async _reindexar(input) {
    const g = this._guardDegradado(); if (g) return g;
    const listado = await this._rpc('cosecha.listar.request', {}, { timeout_ms: 8000 });
    const skills = (listado && listado.data && Array.isArray(listado.data.skills)) ? listado.data.skills : [];
    let indexadas = 0;
    for (const s of skills) {
      const nombre = s.nombre || s.name;
      if (!nombre) continue;
      // texto a embeber: descripción (barata) — lo que carga el significado
      const texto = s.descripcion || s.description || nombre;
      const r = await this._indexar({ nombre, dominio: s.dominio || s.domain || '', texto });
      if (r && r.status === 200) indexadas++;
    }
    return { status: 200, data: { indexadas, total_skills: skills.length } };
  }

  async _estado() {
    let total = 0;
    if (this._turso && this.activo) {
      try {
        const db = await this._db();
        if (await this._tablaExiste(db)) {
          const r = await db.prepare('SELECT COUNT(*) AS n FROM skills').all();
          total = (r && r[0] && Number(r[0].n)) || 0;
        }
      } catch (_) {}
    }
    return { status: 200, data: { activo: this.activo, turso_disponible: !!this._turso, total_indexadas: total, dims: this._dim } };
  }
}

module.exports = CanteraSemanticaReflejo;
