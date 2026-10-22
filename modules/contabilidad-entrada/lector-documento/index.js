/**
 * contabilidad-entrada/lector-documento — REFLEJO STATELESS (A · bytes → TEXTO).
 *
 * PORQUÉ: la cadena documental (ticket · albarán · factura) empieza con BYTES que llegan
 * por un canal (telegram / carpeta) y termina en un asiento. Entre medias hay un salto que
 * NADIE debe improvisar: bytes opacos → texto legible. Este módulo es ese salto, y solo ese:
 * no clasifica (eso es `clasificador-documento`), no extrae campos (eso es `extraccion-dato`),
 * no asienta. Convierte y declara CON QUÉ MOTOR lo hizo, porque la evidencia de un asiento
 * vale lo que vale la fiabilidad de su lectura.
 *
 * DISCIPLINA (la honestidad de la vertical: dato ausente = desconocido):
 *   - Primero lo BARATO y determinista: un PDF con capa de texto se lee con `pdftotext`.
 *     Si trae texto suficiente, NO se despierta el OCR (motor CPU-bound, caro, innecesario).
 *   - Solo si el texto no llega (imagen, o PDF escaneado) se llama al motor OCR4RS.
 *   - Motor caído o timeout → 502 MOTOR_OCR_NO_DISPONIBLE, con `abierto.texto` declarando
 *     que no se leyó. JAMÁS se devuelve texto inventado ni vacío disfrazado de éxito.
 *   - Texto final insuficiente (< 8 chars) → 422 TEXTO_VACIO, también declarado.
 *   - `evidencia.sha256` + `bytes` son la dirección de vuelta: el asiento podrá re-comprobar
 *     el dato abriendo EXACTAMENTE los mismos bytes.
 *
 * Al leer bien ENCADENA la cadena por EVENTO (hecho `contabilidad.documento_leido` +
 * `clasificador-documento.clasificar.request`): el reflejo no llama a nadie por código.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin estado en disco (solo un tmp que se
 * borra siempre). Op `leer` es PREGUNTA → SIN ui_handler.
 * Contrato congelado: docs/entrada-documental-contrato.md § 'A · lector-documento'.
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Extensiones soportadas y su mime REAL (inferido por extensión cuando el canal no lo trae).
const MIME_POR_EXT = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff'
};

// Un texto por debajo de esto no es texto: es ruido de una imagen en blanco o un PDF vacío.
const MIN_CHARS_TEXTO = 8;

// Techo del extractor local: si `pdftotext` se atasca, no cuelga la lectura (se pasa a OCR).
const TIMEOUT_PDFTOTEXT_MS = 20000;

// Techo del OCR local (tesseract sobre un ticket/albarán: segundos, no minutos).
const TIMEOUT_TESSERACT_MS = 60000;
// Techo del rasterizado de un PDF escaneado a imágenes (pdftoppm).
const TIMEOUT_PDFTOPPM_MS = 120000;
// Un PDF escaneado se rasteriza página a página; 8 páginas cubre un lote de facturas completo.
const MAX_PAGINAS_OCR = 8;

class LectorDocumento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'lector-documento';
    this.version = 'reflejo-0.1.0';
    // Defaults: el módulo funciona sin core (los tests lo instancian a pelo) y onLoad los
    // puede sobreescribir desde el manifest. Precedencia: config del manifest > default.
    this._baseUrl = 'http://localhost:8090';
    this._timeoutOcrMs = 60000;
    this._minCharsDigital = 40;
    this._tmpDir = os.tmpdir();
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config[this.name]))) || {};
    // tmp_dir null/vacío en el manifest = os.tmpdir() (JSON no puede expresar os.tmpdir()).
    this._baseUrl = String(cfg.base_url || this._baseUrl).replace(/\/+$/, '');
    this._timeoutOcrMs = Number(cfg.timeout_ocr_ms) || this._timeoutOcrMs;
    this._minCharsDigital = Number(cfg.min_chars_digital) || this._minCharsDigital;
    this._tmpDir = cfg.tmp_dir ? String(cfg.tmp_dir) : this._tmpDir;
    this.logger?.info(`${this.name}.reflejo.loaded`, {
      base_url: this._baseUrl, min_chars_digital: this._minCharsDigital
    });
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una línea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'lector-documento.leer.response', (d) => this._leerYAnunciar(d));
  }

  // Efectos de bus alrededor de la lectura: .failed si no se leyó, hecho + encadenado si sí.
  // Separado de _leer para que la proyección pura siga siendo testeable sin bus.
  async _leerYAnunciar(d) {
    const res = await this._leer(d);
    if (res.status !== 200) {
      try {
        this.eventBus?.publish('lector-documento.leer.failed', {
          request_id: d.request_id, status: res.status, error: res.error
        });
      } catch (_) { /* best-effort */ }
      return res;
    }
    this._encadenar(res, d);
    return res;
  }

  // ══════════════════════════════════════════════════════════════════════
  // leer(input) → { status, data } | { status, error }
  //   1. resolver ruta   2. comprobar formato   3. bytes   4. digital → OCR   5. umbral
  // ══════════════════════════════════════════════════════════════════════
  async _leer(input = {}) {
    const t0 = Date.now();
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const doc = (input.documento && typeof input.documento === 'object') ? input.documento : {};
    const rutaBus = doc.path || doc.file_path || input.path || null;
    const rutaAbs = input.ruta_absoluta || null;   // solo pruebas locales
    if (!rutaBus && !rutaAbs) return this._invalid('documento.path');

    const ref = rutaAbs || rutaBus;
    const ext = this._extDe(ref) || this._extDe(doc.nombre);
    const mime = this._mimeDe(ext, doc.mime);
    // 415 ANTES de leer bytes: un formato que no sabemos leer no se lee (ni se inventa).
    if (!mime) {
      return this._errorResponse(415, 'FORMATO_NO_SOPORTADO',
        `formato no soportado: ${ext || doc.mime || 'desconocido'} (soportados: pdf, jpg, jpeg, png, webp, tif, tiff)`,
        { extension: ext || null, mime: doc.mime || null, abierto: { texto: null } });
    }

    const documento = {
      path: rutaAbs || rutaBus,
      nombre: doc.nombre || path.basename(ref),
      mime
    };

    // ── bytes: fs local (pruebas) o fs del proyecto por bus (producción) ──
    let bytes;
    if (rutaAbs) {
      try { bytes = await fs.promises.readFile(rutaAbs); }
      catch (err) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `documento no encontrado: ${ref}`, { path: ref, motivo: err.code || err.message, entity_type: 'file' });
      }
    } else {
      bytes = await this._leerBytesBus(pid, rutaBus);
      if (!bytes) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `documento no encontrado en el storage del proyecto: ${rutaBus}`,
          { path: rutaBus, entity_type: 'file' });
      }
    }
    if (!bytes.length) {
      return this._errorResponse(422, 'TEXTO_VACIO', 'el documento no tiene bytes',
        { path: documento.path, abierto: { texto: 'fichero de 0 bytes: no hay nada que leer' } });
    }

    const evidencia = {
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length
    };

    // ── estrategia 1: PDF con capa de texto (determinista, sin motor) ──
    let texto = '';
    let paginas = [];
    let source_kind = null;
    let motor = null;

    if (ext === '.pdf') {
      const digital = await this._extraerPdfDigital(bytes);
      if (digital && digital.texto.trim().length >= this._minCharsDigital) {
        texto = digital.texto;
        paginas = digital.paginas;
        source_kind = 'digital';
        motor = 'pdftotext';
      }
    }

    // ── estrategia 2: imagen (o PDF escaneado) → OCR ──
    // ORDEN MEDIDO, no capricho: tesseract con `--psm 4` conserva el ORDEN DE LÍNEA de un
    // ticket/albarán ("TOTAL 69,96" pegado a su importe); el motor OCR4RS agrupa por bloques
    // y deja los importes al final del texto — con eso, un patrón "TOTAL <importe>" captura
    // la cifra equivocada. Se intenta tesseract (local, rápido, en orden) y solo si no saca
    // texto se recurre a OCR4RS (mejor con documentos grandes/escaneados y da evidencia).
    if (!source_kind) {
      const local = await this._ocrTesseract(bytes, ext);
      if (local && local.texto.trim().length >= MIN_CHARS_TEXTO) {
        texto = local.texto;
        paginas = local.paginas;
        source_kind = 'ocr';
        motor = 'tesseract';
      } else {
        const ocr = await this._ocr(bytes);
        if (!ocr.ok) return ocr.res;   // 502 honesto: no se leyó, y se declara
        texto = ocr.texto;
        paginas = ocr.paginas;
        source_kind = 'ocr';
        motor = 'ocr4rs';
      }
    }

    // ── umbral final: sin texto no hay lectura (y no se disfraza de éxito) ──
    if (!texto || texto.trim().length < MIN_CHARS_TEXTO) {
      return this._errorResponse(422, 'TEXTO_VACIO',
        `texto insuficiente (${(texto || '').trim().length} chars; mínimo ${MIN_CHARS_TEXTO})`,
        {
          path: documento.path, source_kind, motor,
          abierto: { texto: `no se pudo leer texto del documento con ${motor} (ni digital ni OCR): dato desconocido` }
        });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'lector-documento',
        documento,
        texto,
        paginas,
        source_kind,
        motor,
        evidencia,
        ms: Date.now() - t0,
        abierto: { texto: null }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Estrategia 1 — pdftotext (PDF con capa de texto). null si no hay capa.
  // Los bytes van a un tmp PROPIO que se borra siempre (pase lo que pase).
  // ══════════════════════════════════════════════════════════════════════
  async _extraerPdfDigital(bytes) {
    let dir = null;
    try {
      dir = await fs.promises.mkdtemp(path.join(this._tmpDir, 'lector-doc-'));
      const tmp = path.join(dir, 'documento.pdf');
      await fs.promises.writeFile(tmp, bytes);
      const bruto = await this._pdftotext(tmp);
      if (bruto == null) return null;
      const texto = bruto.replace(/\r\n/g, '\n');
      // pdftotext separa páginas con \f: se respeta la paginación real del PDF.
      const paginas = texto.split('\f')
        .map((t, i) => ({ n: i, texto: t }))
        .filter((p) => p.texto.trim().length > 0);
      return { texto, paginas };
    } catch (err) {
      this.logger?.warn?.(`${this.name}.pdf.digital.error`, { error: err.message });
      return null;
    } finally {
      if (dir) { try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch (_) { /* tmp */ } }
    }
  }

  // execFile pdftotext → stdout (string) | null si falla o expira. Overridable en test.
  _pdftotext(rutaPdf) {
    return new Promise((resolve) => {
      execFile('pdftotext', ['-layout', '-enc', 'UTF-8', rutaPdf, '-'],
        { timeout: TIMEOUT_PDFTOTEXT_MS, maxBuffer: 16 * 1024 * 1024, encoding: 'utf-8' },
        (err, stdout) => {
          if (err) return resolve(null);   // binario ausente, PDF corrupto o timeout
          resolve(typeof stdout === 'string' ? stdout : '');
        });
    });
  }


  // ══════════════════════════════════════════════════════════════════════
  // Estrategia 2a — tesseract LOCAL (imagen, o PDF escaneado rasterizado).
  // Conserva el orden de línea del documento (--psm 4): imprescindible para que
  // "TOTAL 69,96" llegue junto a su importe y no al final del texto.
  // Devuelve { texto, paginas } o null (sin binario, sin texto). NUNCA inventa.
  // ══════════════════════════════════════════════════════════════════════
  async _ocrTesseract(bytes, ext) {
    let dir = null;
    try {
      dir = await fs.promises.mkdtemp(path.join(this._tmpDir, 'lector-ocr-'));
      let imagenes = [];
      if (ext === '.pdf') {
        const pdf = path.join(dir, 'documento.pdf');
        await fs.promises.writeFile(pdf, bytes);
        imagenes = await this._pdfAPngs(pdf, dir);
      } else {
        const img = path.join(dir, `documento${ext || '.png'}`);
        await fs.promises.writeFile(img, bytes);
        imagenes = [img];
      }
      if (imagenes.length === 0) return null;

      const paginas = [];
      for (let i = 0; i < imagenes.length; i++) {
        const t = await this._tesseract(imagenes[i]);
        if (t && t.trim()) paginas.push({ n: i, texto: t });
      }
      if (paginas.length === 0) return null;
      return { texto: paginas.map((p) => p.texto).join('\n\f\n'), paginas };
    } catch (err) {
      this.logger?.warn?.(`${this.name}.tesseract.error`, { error: err.message });
      return null;
    } finally {
      if (dir) { try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch (_) { /* tmp */ } }
    }
  }

  // execFile tesseract → stdout | null. Overridable en test.
  _tesseract(ruta) {
    return new Promise((resolve) => {
      execFile('tesseract', [ruta, '-', '--psm', '4', '-l', 'spa+eng'],
        { timeout: TIMEOUT_TESSERACT_MS, maxBuffer: 16 * 1024 * 1024, encoding: 'utf-8' },
        (err, stdout) => {
          if (err) return resolve(null);   // binario ausente, imagen corrupta o timeout
          resolve(typeof stdout === 'string' ? stdout : '');
        });
    });
  }

  // pdftoppm: PDF → PNG por página (solo las primeras MAX_PAGINAS_OCR). [] si falla.
  _pdfAPngs(rutaPdf, dir) {
    return new Promise((resolve) => {
      execFile('pdftoppm',
        ['-r', '300', '-png', '-f', '1', '-l', String(MAX_PAGINAS_OCR), rutaPdf, path.join(dir, 'pag')],
        { timeout: TIMEOUT_PDFTOPPM_MS, maxBuffer: 16 * 1024 * 1024 },
        (err) => {
          if (err) return resolve([]);
          try {
            const pngs = fs.readdirSync(dir)
              .filter((f) => /^pag-?\d+\.png$/i.test(f))
              .sort()
              .map((f) => path.join(dir, f));
            resolve(pngs);
          } catch (_) { resolve([]); }
        });
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Estrategia 2b — POST /ocr con los bytes CRUDOS (el motor detecta imagen vs PDF).
  // Motor caído / timeout / 5xx → 502 MOTOR_OCR_NO_DISPONIBLE con abierto.texto.
  // ══════════════════════════════════════════════════════════════════════
  async _ocr(bytes) {
    const caido = (detalle) => ({
      ok: false,
      res: this._errorResponse(502, 'MOTOR_OCR_NO_DISPONIBLE',
        `motor OCR no disponible en ${this._baseUrl}: ${detalle}. NO ES: documento ilegible.`,
        {
          base_url: this._baseUrl,
          abierto: { texto: `no se pudo leer el documento (motor OCR caído: ${detalle}): dato desconocido` }
        })
    });

    let r;
    try { r = await this._postOcr(bytes); }
    catch (err) { return caido(err.name === 'AbortError' ? `timeout ${this._timeoutOcrMs}ms` : err.message); }

    if (r.status >= 500) return caido(`el motor respondió ${r.status}`);
    if (r.status === 401 || r.status === 403) return caido(`el motor rechazó la petición (${r.status})`);
    if (r.status < 200 || r.status >= 300) {
      // 4xx del motor: el documento no se puede leer (no es caída del servicio → no es 502).
      return {
        ok: false,
        res: this._errorResponse(422, 'TEXTO_VACIO',
          `el motor OCR no pudo leer el documento (${r.status})`,
          { status_motor: r.status, detalle: r.texto, abierto: { texto: 'el motor rechazó los bytes: dato desconocido' } })
      };
    }

    const cuerpo = r.body || {};
    const paginas = Array.isArray(cuerpo.pages)
      ? cuerpo.pages.map((p, i) => ({ n: p.n != null ? p.n : i, texto: p.text || '' }))
      : [];
    const texto = typeof cuerpo.text === 'string' && cuerpo.text
      ? cuerpo.text
      : paginas.map((p) => p.texto).join('\n\n');
    return { ok: true, texto, paginas };
  }

  // POST /ocr con bytes crudos (fetch global, node ≥18). Overridable en test.
  async _postOcr(bytes) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutOcrMs);
    try {
      const resp = await fetch(`${this._baseUrl}/ocr`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: bytes,
        signal: ctrl.signal
      });
      const texto = await resp.text();
      let body = null;
      try { body = texto ? JSON.parse(texto) : null; } catch (_) { body = null; }
      return { status: resp.status, body, texto };
    } finally { clearTimeout(to); }
  }

  // ── fs del proyecto por bus: base64 → Buffer (o null si no existe) ──
  async _leerBytesBus(project_id, ruta) {
    const resp = await this._rpc('fs.read.request', { project_id, path: ruta, encoding: 'base64' });
    if (!resp || resp.status === 404 || !resp.content) return null;
    try { return Buffer.from(resp.content, 'base64'); } catch (_) { return null; }
  }

  // Encadena la cadena por EVENTO: el HECHO (que el asiento podrá citar) y la pregunta
  // al clasificador. El reflejo no llama a nadie por código: publica y sigue.
  _encadenar(res, d) {
    const data = res.data;
    const correlation_id = d.correlation_id || null;
    try {
      this.eventBus?.publish('contabilidad.documento_leido', {
        project_id: data.project_id,
        documento: data.documento,
        texto: data.texto,
        source_kind: data.source_kind,
        motor: data.motor,
        evidencia: data.evidencia,
        correlation_id
      });
      this.eventBus?.publish('clasificador-documento.clasificar.request', {
        project_id: data.project_id,
        documento: data.documento,
        texto: data.texto,
        source_kind: data.source_kind,
        evidencia: data.evidencia,
        correlation_id
      });
    } catch (_) { /* best-effort */ }
  }

  // ── utilidades de formato ──
  _extDe(ruta) {
    if (!ruta || typeof ruta !== 'string') return null;
    const ext = path.extname(ruta).toLowerCase();
    return MIME_POR_EXT[ext] ? ext : (ext || null);
  }

  // Mime: el declarado manda si es de un formato soportado; si falta, se infiere por extensión.
  _mimeDe(ext, mimeDeclarado) {
    const declarado = String(mimeDeclarado || '').toLowerCase().split(';')[0].trim();
    const soportados = Object.values(MIME_POR_EXT);
    if (declarado && soportados.includes(declarado)) return declarado;
    return MIME_POR_EXT[ext] || null;
  }

  // ── Tools ──
  toolLeer(params) { return this._leer(params); }
}

module.exports = LectorDocumento;
