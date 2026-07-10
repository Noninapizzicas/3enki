'use strict';

/**
 * ocr4rs — el PUENTE a OCR4RS (repo ocr4rs): OCR en Rust puro (imagen/PDF escaneado
 * → texto), envuelto como órgano del bus.
 *
 * HERMANO de crawl4rs, dominio opuesto: crawl4rs lee la WEB, ocr4rs lee lo FÍSICO.
 * Las dos alas de AFIRMACION_EXTERNA (prisma-del-caso): la evidencia vive en la web
 * (url → crawl4rs) o en el papel/imagen (foto → ocr4rs). Juntas cubren todo el mundo.
 *
 * El motor habla HTTP SÍNCRONO (POST /ocr, bytes → JSON). Más simple que crawl4rs:
 *   - SIN job/poll (la respuesta llega en la misma llamada).
 *   - SIN auth (ley de la frontera: el motor publica solo a 127.0.0.1).
 *
 *   bus  ocr4rs.leer.request {path}       → fs.read(base64) → POST /ocr → texto + evidencia
 *   bus  ocr4rs.leer_lote.request {paths} → lote con ritmo (CPU-bound)
 * y una tool de chat `leer_imagen`.
 *
 * DISCIPLINA (patrón Enki):
 *   - NACE OFF (interruptor 'ocr4rs', grupo 'sistema'). On-demand.
 *   - DEGRADA HONESTO: OFF | sin_servicio | sin_modelos → 503 {degradado, motivo}.
 *     Jamás inventa texto (el 'no inventar' del README = el 'no inventar precio' de escandallo).
 *   - HANDOFF: un PDF digital (con capa de texto) → 409 redirigido a crawl4rs + emite
 *     ocr4rs.pdf.es_digital. Los órganos se pasan el trabajo por el bus, no por el código.
 *   - EVIDENCIA: la respuesta trae {path, sha256} — la DIRECCIÓN DE VUELTA del prisma.
 *     Cuando facturas/escandallo persiste un dato OCR, fuente='ocr4rs' + evidencia=imagen
 *     ENTRA por la ley de la evidencia (re-comprobable abriendo la foto).
 *
 * LATENTE (se activa cuando el motor exponga confianza por línea — OcrLine v0.0.1 solo
 * trae texto): el gate umbral_confianza + el evento ocr4rs.baja_confianza.detectada.
 */

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// :8090 en el host — el servicio nativo ocr4rs (deployment/ocr4rs, systemd) bindea 127.0.0.1:8090.
const DEFAULT_BASE = 'http://localhost:8090';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Ocr4rsModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ocr4rs';
    this.version = '0.1.0';
    this.activo = false;          // interruptor OFF por defecto (on-demand)
    this._baseUrl = DEFAULT_BASE;
    this._timeoutMs = 60000;
    this._maxLote = 50;
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config.ocr4rs))) || {};
    // Precedencia env > config > default (el env es el override por despliegue).
    this._baseUrl = String(process.env.OCR4RS_BASE_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 60000;
    this._maxLote = Number(cfg.max_lote) || 50;
    this._registrarBoton();
    this.logger?.info('ocr4rs.loaded', { base_url: this._baseUrl, activo: this.activo });
  }

  // ── interruptor ──
  _registrarBoton() {
    try {
      this.eventBus?.publish?.('interruptor.registrar', {
        id: 'ocr4rs',
        label: 'OCR4RS (imagen/PDF escaneado → texto)',
        grupo: 'sistema',
        descripcion: 'Puente al servicio OCR4RS (Rust puro) por HTTP. Lee una foto o PDF escaneado → texto + evidencia. OFF = apagado (el servicio corre on-demand). Degrada honesto si no está; reencamina el PDF digital a crawl4rs.',
        default: false
      });
    } catch (_) { /* best-effort */ }
  }
  onSolicitarRegistro() { this._registrarBoton(); }
  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id === 'ocr4rs') {
      this.activo = !!d.enabled;
      this.logger?.info?.('ocr4rs.toggled', { activo: this.activo });
    }
  }

  // ── RPC del bus ──
  onLeerRequest(e)      { return this._atender(e, 'leer',      'ocr4rs.leer.response',      (d) => this._leer(d)); }
  onLeerLoteRequest(e)  { return this._atender(e, 'leer_lote', 'ocr4rs.leer_lote.response', (d) => this._leerLote(d)); }

  // ── tool de chat ──
  async handleLeerTool(args) { return this._leer(args || {}); }

  // ── guardas ──
  _guard() {
    if (!this.activo) return this._degradado('apagado');
    return null;
  }
  _degradado(motivo) {
    // Error fértil: la prescripción viaja en message (la única capa que todo transporte preserva).
    const prescripcion = {
      apagado: 'el interruptor ocr4rs está OFF — enciéndelo en el panel (grupo sistema). NO ES: motor caído.',
      sin_servicio: 'el servicio ocr4rs no responde en :8090 — verifica systemctl status ocr4rs y /health. NO ES: imagen ilegible.',
      sin_modelos: 'el servicio OCR4RS corre pero no cargó los modelos .rten — monta el volumen /models (scripts/get-models.sh). NO ES: imagen ilegible ni motor caído.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `ocr4rs degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  // ── leer: una imagen/PDF escaneado → texto + evidencia ──
  async _leer(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.path) return this._invalid('path');

    // 1. LEER la imagen del fs del proyecto (base64 — el bus mueve el puntero, no los MB).
    let bytes;
    try { bytes = await this._leerBytes(input.project_id, input.path); }
    catch (_) { bytes = null; }
    if (!bytes) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `imagen no encontrada: ${input.path}`, { path: input.path, entity_type: 'file' });

    // 2. POST /ocr (bytes crudos; el motor detecta imagen vs PDF y limpia dentro).
    let r;
    try { r = await this._postOcr(bytes, input.prep || {}); }
    catch (_) { return this._degradado('sin_servicio'); }

    // 3. degradación y handoff honestos según el status del motor.
    if (r.status === 503) return this._degradado('sin_modelos');
    if (r.status === 422 && /digital|crawl4rs|capa de texto/i.test(String(r.text || ''))) {
      // HANDOFF: el PDF ya tiene texto → no es nuestro trabajo. Avisamos y el caller decide.
      this.eventBus?.publish?.('ocr4rs.pdf.es_digital', { project_id: input.project_id, path: input.path });
      return { status: 409, error: { code: 'ES_DIGITAL_USA_CRAWL4RS', message: 'el PDF tiene capa de texto (es digital): usa crawl4rs.leer, no OCR', details: { redirigido: 'crawl4rs', path: input.path } } };
    }
    if (r.status === 415) return this._errorResponse(415, 'IMAGEN_INVALIDA', 'formato no soportado (el motor no puede extraer esta imagen/filtro PDF)', { detalle: r.text });
    if (r.status === 422) return this._errorResponse(422, 'IMAGEN_INVALIDA', 'imagen ilegible', { detalle: r.text });
    if (r.status < 200 || r.status >= 300) return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'ocr4rs rechazó la petición', { status: r.status, detalle: r.text });

    return this._proyectar(r.body, bytes, input);
  }

  // ── leer_lote: N rutas → texto por cada una, con ritmo (patrón obrero) ──
  async _leerLote(input) {
    const g = this._guard(); if (g) return g;
    const paths = Array.isArray(input && input.paths) ? input.paths.slice(0, this._maxLote) : null;
    if (!paths || paths.length === 0) return this._invalid('paths');
    const resultados = [];
    const fallidos = [];
    for (const path of paths) {
      const r = await this._leer({ project_id: input.project_id, path, prep: input.prep });
      if (r.status === 200) resultados.push({ path, texto: r.data.texto, source_kind: r.data.source_kind, evidencia: r.data.evidencia });
      else fallidos.push({ path, motivo: (r.error && r.error.code) || 'error' });
      await sleep(120);   // ritmo: el motor es CPU-bound, no lo saturamos
    }
    return { status: 200, data: { resultados, fallidos, total: resultados.length } };
  }

  // ── proyección: ProcessOutput del motor → forma del bus + evidencia ──
  _proyectar(out, bytes, input) {
    out = out || {};
    const paginas = Array.isArray(out.pages) ? out.pages.map((p) => ({ n: p.n, texto: p.text || '' })) : [];
    const texto = out.text || paginas.map((p) => p.texto).join('\n\n');
    const evidencia = {
      path: input.path,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      source_kind: out.source_kind || 'image'
    };
    this.eventBus?.publish?.('ocr4rs.texto.extraido', {
      project_id: input.project_id, path: input.path,
      source_kind: evidencia.source_kind, chars: texto.length
    });
    return { status: 200, data: { source_kind: evidencia.source_kind, texto, paginas, evidencia } };
  }

  // ── fs.read (base64) → Buffer. Overridable en test. ──
  async _leerBytes(project_id, path) {
    const resp = await this._rpc('fs.read.request', { project_id, path, encoding: 'base64' });
    if (!resp || resp.status === 404 || !resp.content) return null;
    return Buffer.from(resp.content, 'base64');
  }

  // ── POST /ocr con bytes crudos (fetch global, node ≥18). Overridable en test. ──
  async _postOcr(bytes, prep) {
    const qs = new URLSearchParams();
    if (prep && typeof prep === 'object') for (const [k, v] of Object.entries(prep)) if (v != null) qs.set(k, String(v));
    const url = this._baseUrl + '/ocr' + (qs.toString() ? '?' + qs.toString() : '');
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes, signal: ctrl.signal });
      const text = await resp.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = null; }
      return { status: resp.status, body: parsed, text };
    } finally { clearTimeout(to); }
  }
}

module.exports = Ocr4rsModule;
