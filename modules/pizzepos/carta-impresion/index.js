/**
 * Carta Impresion v1.0.0
 *
 * Renderiza cartas del restaurante en HTML listo para imprimir desde el navegador.
 * El LLM llama a las tools desde el chat; sin UI propia, sin llamadas AI.
 *
 * Tools:
 *   carta.render            — Genera HTML de una carta con la plantilla elegida
 *   carta.plantillas        — Lista plantillas disponibles (globales + proyecto)
 *   carta.plantilla_crear   — Crea plantilla personalizada para el proyecto
 *   carta.plantilla_eliminar— Elimina plantilla del proyecto
 *
 * Flujo:
 *   usuario pide imprimir → LLM llama carta.render(carta_id, plantilla_id)
 *   → lee carta del disco → aplica plantilla → guarda .html
 *   → devuelve ruta → usuario abre en navegador → Ctrl+P
 *
 * Plantillas built-in: templates/*.html (siempre disponibles)
 * Plantillas proyecto: storage/pizzepos/carta-templates/{id}.json + .html
 * HTML generados:      storage/pizzepos/cartas-html/{carta_id}_{plantilla_id}_{ts}.html
 */

const path = require('path');
const fs = require('fs').promises;

// Plantillas built-in incluidas con el módulo
const PLANTILLAS_GLOBALES = [
  {
    id: 'a4-clasica',
    nombre: 'A4 Clásica',
    descripcion: 'Carta completa en A4 vertical. Ideal para cartas con muchos productos y categorías.',
    formato: 'A4',
    orientacion: 'portrait',
    global: true
  },
  {
    id: 'a5-menu-dia',
    nombre: 'A5 Menú del Día',
    descripcion: 'Formato A5 compacto. Perfecto para menú del día o cartas cortas.',
    formato: 'A5',
    orientacion: 'portrait',
    global: true
  },
  {
    id: 'a4-cuadruple',
    nombre: 'A4 Cuádruple (4 por hoja)',
    descripcion: 'Cuatro cartas en un A4 para recortar. Óptimo para cartas muy cortas (hasta 2 categorías).',
    formato: 'A4',
    orientacion: 'portrait',
    global: true
  },
  {
    id: 'a4-diptico',
    nombre: 'A4 Díptico',
    descripcion: 'Dos páginas A5 en un A4 que se dobla por la mitad. Formato clásico de carta de restaurante.',
    formato: 'A4',
    orientacion: 'landscape',
    global: true
  },
  {
    id: 'a4-paisaje-5col',
    nombre: 'A4 Apaisado 5 Columnas',
    descripcion: 'A4 horizontal con 5 columnas CSS. Ideal para muchas categorías en una sola hoja.',
    formato: 'A4',
    orientacion: 'landscape',
    global: true
  }
];

class CartaImpresionModule {
  constructor() {
    this.name = 'carta-impresion';
    this.version = '1.0.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // project_id → { featurePath, storagePath }
    this.projectPaths = new Map();

    // Cache de plantillas globales (HTML cargado en memoria)
    this.globalTemplates = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;

    await this.loadGlobalTemplates();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.projectPaths.clear();
    this.globalTemplates.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, {
        featurePath: path.join(resolvedBase, 'storage', 'pizzepos'),
        storagePath: path.join(resolvedBase, 'storage')
      });
    }

    this.logger.info('carta-impresion.project.activated', { project_id });
  }

  async onProjectDeactivated(event) {
    // No-op
  }

  // ==========================================
  // Template Loading (globales desde disco)
  // ==========================================

  async loadGlobalTemplates() {
    const templatesDir = path.join(__dirname, 'templates');
    for (const plantilla of PLANTILLAS_GLOBALES) {
      try {
        const htmlPath = path.join(templatesDir, `${plantilla.id}.html`);
        const html = await fs.readFile(htmlPath, 'utf-8');
        this.globalTemplates.set(plantilla.id, html);
      } catch (err) {
        this.logger.warn('carta-impresion.template.load_failed', { id: plantilla.id, error: err.message });
      }
    }
    this.logger.info('carta-impresion.templates.loaded', { count: this.globalTemplates.size });
  }

  // ==========================================
  // Paths helpers
  // ==========================================

  getPaths(projectId) {
    return this.projectPaths.get(projectId);
  }

  cartasDir(projectId) {
    const p = this.getPaths(projectId);
    return p ? path.join(p.featurePath, 'cartas') : null;
  }

  cartasHtmlDir(projectId) {
    const p = this.getPaths(projectId);
    return p ? path.join(p.featurePath, 'cartas-html') : null;
  }

  cartaTemplatesDir(projectId) {
    const p = this.getPaths(projectId);
    return p ? path.join(p.featurePath, 'carta-templates') : null;
  }

  // ==========================================
  // Tools — expuestos al LLM via agentic loop
  // ==========================================

  async toolRender({ carta_id, plantilla_id = 'a4-clasica', project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    // 1. Leer la carta del disco (misma ruta que menu-generator guarda)
    const cartaPath = path.join(this.cartasDir(project_id) || '', `${carta_id}.json`);
    let carta;
    try {
      const raw = await fs.readFile(cartaPath, 'utf-8');
      carta = JSON.parse(raw);
    } catch (err) {
      return { status: 404, error: `Carta "${carta_id}" no encontrada en disco. Asegúrate de que existe y está guardada.` };
    }

    // 2. Obtener HTML de la plantilla (global o del proyecto)
    let templateHtml = this.globalTemplates.get(plantilla_id);

    if (!templateHtml) {
      // Buscar en plantillas del proyecto
      const projectTemplate = await this.loadProjectTemplate(plantilla_id, project_id);
      if (!projectTemplate) {
        return { status: 404, error: `Plantilla "${plantilla_id}" no encontrada. Usa carta.plantillas para ver las disponibles.` };
      }
      templateHtml = projectTemplate.html;
    }

    // 3. Renderizar: sustituir marcadores + generar bloques de categorías/productos
    const html = this.render(templateHtml, carta);

    // 4. Guardar HTML generado en disco
    const dir = this.cartasHtmlDir(project_id);
    let htmlPath = null;
    let relativePath = null;

    if (dir) {
      await fs.mkdir(dir, { recursive: true });
      const filename = `${carta_id}_${plantilla_id}_${Date.now().toString(36)}.html`;
      const absolutePath = path.join(dir, filename);
      await fs.writeFile(absolutePath, html, 'utf-8');
      htmlPath = absolutePath;

      const paths = this.getPaths(project_id);
      relativePath = '/' + path.relative(paths.storagePath, absolutePath).replace(/\\/g, '/');
    }

    this.metrics?.increment('carta.render.completed');
    this.logger.info('carta.render.completed', { carta_id, plantilla_id, project_id, path: relativePath });

    const cartaNombre = carta.meta?.nombre || 'Carta';
    const filename = `${cartaNombre}_${plantilla_id}.html`.replace(/[^a-z0-9._-]/gi, '_');

    await this.eventBus.publish('carta.html.generada', {
      carta_id,
      plantilla_id,
      project_id,
      html_path: relativePath,
      // HTML completo incluido para que el frontend pueda mostrar preview inline
      // sin necesidad de leer el fichero desde disco
      html,
      title: cartaNombre,
      filename
    });

    return {
      status: 200,
      data: {
        carta_id,
        carta_nombre: cartaNombre,
        plantilla_id,
        html_path: relativePath,
        productos: carta.productos?.length || 0,
        categorias: carta.categorias?.length || 0,
        message: `Carta "${cartaNombre}" renderizada. El preview se ha abierto en pantalla — usa el botón Imprimir para exportar a PDF.`
      }
    };
  }

  async toolPlantillas({ project_id }) {
    const globales = PLANTILLAS_GLOBALES.map(p => ({
      ...p,
      disponible: this.globalTemplates.has(p.id)
    }));

    let proyecto = [];
    if (project_id) {
      proyecto = await this.listProjectTemplates(project_id);
    }

    return {
      status: 200,
      data: {
        globales,
        proyecto,
        total: globales.length + proyecto.length,
        uso: 'Usa el campo "id" en carta.render como plantilla_id'
      }
    };
  }

  async toolPlantillaCrear({ nombre, html, formato = 'A4', descripcion = '', project_id }) {
    if (!nombre) return { status: 400, error: 'Se requiere "nombre" para la plantilla' };
    if (!html) return { status: 400, error: 'Se requiere "html" con el contenido de la plantilla' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    const id = `custom_${this.slugify(nombre)}_${Date.now().toString(36)}`;
    const dir = this.cartaTemplatesDir(project_id);
    if (!dir) return { status: 400, error: 'Proyecto sin paths configurados. ¿Está el proyecto activado?' };

    await fs.mkdir(dir, { recursive: true });

    const meta = { id, nombre, formato, descripcion, global: false, created_at: new Date().toISOString() };

    await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(meta, null, 2), 'utf-8');
    await fs.writeFile(path.join(dir, `${id}.html`), html, 'utf-8');

    this.metrics?.increment('carta.plantilla.creada');
    this.logger.info('carta.plantilla.creada', { id, nombre, project_id });

    return {
      status: 201,
      data: { ...meta, message: `Plantilla "${nombre}" creada con ID "${id}". Úsala con carta.render(carta_id, "${id}")` }
    };
  }

  async toolPlantillaEliminar({ plantilla_id, project_id }) {
    if (!plantilla_id) return { status: 400, error: 'Se requiere plantilla_id' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    if (PLANTILLAS_GLOBALES.find(p => p.id === plantilla_id)) {
      return { status: 403, error: `"${plantilla_id}" es una plantilla global y no se puede eliminar` };
    }

    const dir = this.cartaTemplatesDir(project_id);
    if (!dir) return { status: 400, error: 'Proyecto sin paths configurados' };

    const jsonFile = path.join(dir, `${plantilla_id}.json`);
    const htmlFile = path.join(dir, `${plantilla_id}.html`);

    try {
      await fs.unlink(jsonFile);
    } catch (_) { /* ya no existía */ }

    try {
      await fs.unlink(htmlFile);
    } catch (_) {
      return { status: 404, error: `Plantilla "${plantilla_id}" no encontrada en el proyecto` };
    }

    this.metrics?.increment('carta.plantilla.eliminada');
    this.logger.info('carta.plantilla.eliminada', { plantilla_id, project_id });

    return { status: 200, data: { plantilla_id, message: `Plantilla "${plantilla_id}" eliminada` } };
  }

  // ==========================================
  // Plantillas del proyecto — helpers
  // ==========================================

  async loadProjectTemplate(plantillaId, projectId) {
    const dir = this.cartaTemplatesDir(projectId);
    if (!dir) return null;
    try {
      const meta = JSON.parse(await fs.readFile(path.join(dir, `${plantillaId}.json`), 'utf-8'));
      const html = await fs.readFile(path.join(dir, `${plantillaId}.html`), 'utf-8');
      return { ...meta, html };
    } catch (_) {
      return null;
    }
  }

  async listProjectTemplates(projectId) {
    const dir = this.cartaTemplatesDir(projectId);
    if (!dir) return [];
    try {
      const files = await fs.readdir(dir);
      const metas = [];
      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const meta = JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8'));
          metas.push(meta);
        } catch (_) { /* skip */ }
      }
      return metas;
    } catch (_) {
      return [];
    }
  }

  // ==========================================
  // Motor de renderizado de plantillas
  // ==========================================

  /**
   * Sustituye marcadores en el HTML de la plantilla con datos reales de la carta.
   *
   * Marcadores disponibles:
   *   {{nombre_carta}}      — nombre de la carta/restaurante
   *   {{fecha}}             — fecha actual formateada (dd/mm/aaaa)
   *   {{total_productos}}   — número total de productos
   *   {{total_categorias}}  — número total de categorías
   *   {{categorias_html}}   — bloque HTML completo de categorías + productos (generado)
   */
  render(templateHtml, carta) {
    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const vars = {
      '{{nombre_carta}}': carta.meta?.nombre || 'Carta',
      '{{fecha}}': fecha,
      '{{total_productos}}': String(carta.productos?.length || 0),
      '{{total_categorias}}': String(carta.categorias?.length || 0),
      '{{categorias_html}}': this.renderCategoriasHtml(carta)
    };

    let html = templateHtml;
    for (const [marker, value] of Object.entries(vars)) {
      html = html.split(marker).join(value);
    }
    return html;
  }

  renderCategoriasHtml(carta) {
    const categorias = carta.categorias || [];
    const productos = carta.productos || [];

    return categorias
      .sort((a, b) => a.orden - b.orden)
      .map(cat => {
        const prods = productos.filter(p => p.categoria === cat.id);
        if (prods.length === 0) return '';

        const productosHtml = prods.map(p => {
          const precio = p.precio > 0
            ? `<span class="precio">${p.precio.toFixed(2).replace('.', ',')} €</span>`
            : '';

          const ingredientes = p.ingredientes?.length
            ? `<span class="ingredientes">${p.ingredientes.map(i => `${i.emoji || ''} ${i.nombre}`.trim()).join(', ')}</span>`
            : '';

          return `
        <div class="producto">
          <div class="producto-header">
            <span class="producto-nombre">${this.escapeHtml(p.nombre)}</span>
            ${precio}
          </div>
          ${ingredientes ? `<div class="producto-ingredientes">${ingredientes}</div>` : ''}
        </div>`.trim();
        }).join('\n        ');

        return `
      <div class="categoria">
        <h2 class="categoria-nombre">${this.escapeHtml(cat.nombre)}</h2>
        <div class="categoria-productos">
          ${productosHtml}
        </div>
      </div>`.trim();
      })
      .filter(Boolean)
      .join('\n      ');
  }

  // ==========================================
  // Export PDF — server-side con pdfkit
  // ==========================================

  async toolExportPdf({ carta_id, formato = 'A4', orientacion = 'portrait', project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    const carta = await this.loadCarta(carta_id, project_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada en disco. Usa menu.save_carta primero.` };

    const PDFDocument = require('pdfkit');

    const isLandscape = orientacion === 'landscape';
    const size = formato === 'A5' ? 'A5' : 'A4';
    const doc = new PDFDocument({ size, layout: isLandscape ? 'landscape' : 'portrait', margin: 40 });

    // Collect chunks — registrar AMBOS listeners ANTES de escribir contenido
    const chunks = [];
    const bufferPromise = new Promise((resolve, reject) => {
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const cartaNombre = carta.meta?.nombre || 'Carta';
    const categorias = (carta.categorias || []).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const productos = carta.productos || [];
    const pageW = doc.page.width;
    const marginL = doc.page.margins.left;
    const marginR = doc.page.margins.right;
    const contentW = pageW - marginL - marginR;

    // Header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1a1a1a')
      .text(cartaNombre, { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).stroke('#b45309');
    doc.moveDown(0.6);

    // Categorias + productos
    for (const cat of categorias) {
      const catProds = productos.filter(p => p.categoria === cat.id);
      if (catProds.length === 0) continue;

      if (doc.y > doc.page.height - doc.page.margins.bottom - 80) {
        doc.addPage();
      }

      const catLabel = `${cat.icon || ''} ${cat.nombre}`.trim();
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#b45309')
        .text(catLabel, marginL, doc.y);
      doc.moveDown(0.2);
      doc.moveTo(marginL, doc.y).lineTo(marginL + contentW, doc.y).stroke('#e5e7eb');
      doc.moveDown(0.3);

      for (const prod of catProds) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 40) {
          doc.addPage();
        }

        const ings = (prod.ingredientes || []).map(i => i.nombre).join(', ');
        const precio = `${prod.precio.toFixed(2).replace('.', ',')} \u20ac`;
        const y = doc.y;

        // Nombre del producto (izquierda)
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a')
          .text(prod.nombre, marginL, y, { width: contentW - 70 });

        // Precio (derecha, misma línea)
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#b45309')
          .text(precio, marginL + contentW - 65, y, { width: 65, align: 'right' });

        // Ingredientes (debajo)
        if (ings) {
          doc.fontSize(7.5).font('Helvetica').fillColor('#777')
            .text(ings, marginL, doc.y, { width: contentW });
        }
        doc.moveDown(0.25);
      }
      doc.moveDown(0.5);
    }

    // Footer
    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    doc.fontSize(7).font('Helvetica').fillColor('#aaa')
      .text(fecha, marginL, doc.page.height - doc.page.margins.bottom - 12, {
        width: contentW, align: 'center'
      });

    doc.end();
    const buffer = await bufferPromise;

    // Guardar
    const dir = this.cartasHtmlDir(project_id) || path.join(process.cwd(), 'storage', 'pizzepos', 'cartas-html');
    await fs.mkdir(dir, { recursive: true });

    const filename = `${carta_id}_${formato}_${orientacion}.pdf`;
    const absolutePath = path.join(dir, filename);
    await fs.writeFile(absolutePath, buffer);

    const paths = this.getPaths(project_id);
    const storagePath = paths?.storagePath || path.join(process.cwd(), 'storage');
    const relativePath = '/' + path.relative(storagePath, absolutePath).replace(/\\/g, '/');

    this.metrics?.increment('carta.export_pdf.completed');
    this.logger.info('carta.export_pdf.completed', { carta_id, project_id, formato, orientacion, size: buffer.length });

    return {
      status: 200,
      data: {
        carta_id,
        formato,
        orientacion,
        path: relativePath,
        size_bytes: buffer.length,
        filename,
        message: `PDF generado: ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`
      }
    };
  }

  // ==========================================
  // Export Image — PDF→PNG via pdf-to-png
  // ==========================================

  async toolExportImage({ carta_id, formato = 'A4', orientacion = 'landscape', project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    // Primero generar el PDF
    const pdfResult = await this.toolExportPdf({ carta_id, formato, orientacion, project_id });
    if (pdfResult.status !== 200) return pdfResult;

    const dir = this.cartasHtmlDir(project_id) || path.join(process.cwd(), 'storage', 'pizzepos', 'cartas-html');
    const pdfPath = path.join(dir, pdfResult.data.filename);

    try {
      const { pdfToPng } = require('pdf-to-png-converter');
      const pages = await pdfToPng(pdfPath, { viewportScale: 2.0 });

      if (!pages || pages.length === 0) {
        return { status: 500, error: 'No se pudo convertir el PDF a imagen' };
      }

      const pngFilename = `${carta_id}_${formato}_${orientacion}.png`;
      const pngPath = path.join(dir, pngFilename);
      await fs.writeFile(pngPath, pages[0].content);

      const paths = this.getPaths(project_id);
      const storagePath = paths?.storagePath || path.join(process.cwd(), 'storage');
      const relativePath = '/' + path.relative(storagePath, pngPath).replace(/\\/g, '/');

      this.metrics?.increment('carta.export_image.completed');
      this.logger.info('carta.export_image.completed', { carta_id, project_id, size: pages[0].content.length });

      return {
        status: 200,
        data: {
          carta_id,
          formato,
          orientacion,
          path: relativePath,
          size_bytes: pages[0].content.length,
          filename: pngFilename,
          pages: pages.length,
          message: `Imagen generada: ${pngFilename} (${(pages[0].content.length / 1024).toFixed(0)} KB, ${pages.length} página${pages.length > 1 ? 's' : ''})`
        }
      };
    } catch (err) {
      this.logger.warn('carta.export_image.error', { carta_id, error: err.message });
      return { status: 500, error: `Error al generar imagen: ${err.message}. El PDF se generó correctamente en ${pdfResult.data.path}` };
    }
  }

  // ==========================================
  // Export SVG — vectorial puro
  // ==========================================

  async toolExportSvg({ carta_id, orientacion = 'landscape', project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    const carta = await this.loadCarta(carta_id, project_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const isLandscape = orientacion === 'landscape';
    const W = isLandscape ? 1190 : 842;
    const H = isLandscape ? 842 : 1190;
    const MARGIN = 40;
    const COL_GAP = 24;

    const cartaNombre = carta.meta?.nombre || 'Carta';
    const categorias = (carta.categorias || []).sort((a, b) => a.orden - b.orden);
    const productos = carta.productos || [];

    // Build columns: one per category
    const columns = categorias.map(cat => ({
      cat,
      prods: productos.filter(p => p.categoria === cat.id)
    })).filter(c => c.prods.length > 0);

    const numCols = columns.length || 1;
    const colW = (W - 2 * MARGIN - (numCols - 1) * COL_GAP) / numCols;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif">\n`;

    // Background
    svg += `  <rect width="${W}" height="${H}" fill="#fff"/>\n`;

    // Header
    svg += `  <text x="${W / 2}" y="${MARGIN + 24}" text-anchor="middle" font-size="22" font-weight="bold" fill="#1a1a1a">${this.escapeHtml(cartaNombre)}</text>\n`;
    const headerY = MARGIN + 40;
    svg += `  <line x1="${MARGIN}" y1="${headerY}" x2="${W - MARGIN}" y2="${headerY}" stroke="#b45309" stroke-width="2"/>\n`;

    const contentY = headerY + 20;

    // Columns
    columns.forEach((col, ci) => {
      const x = MARGIN + ci * (colW + COL_GAP);
      let y = contentY;

      // Category name
      svg += `  <text x="${x}" y="${y}" font-size="13" font-weight="bold" fill="#b45309">${col.cat.icon || ''} ${this.escapeHtml(col.cat.nombre)}</text>\n`;
      y += 6;
      svg += `  <line x1="${x}" y1="${y}" x2="${x + colW}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>\n`;
      y += 14;

      // Products
      for (const prod of col.prods) {
        if (y > H - MARGIN - 30) break; // overflow protection

        const precio = `${prod.precio.toFixed(2)} €`;
        const ings = (prod.ingredientes || []).map(i => i.nombre).join(', ');

        // Product name + price on same line
        svg += `  <text x="${x}" y="${y}" font-size="9.5" font-weight="bold" fill="#1a1a1a">${this.escapeHtml(prod.nombre)}</text>\n`;
        svg += `  <text x="${x + colW}" y="${y}" text-anchor="end" font-size="9.5" font-weight="bold" fill="#b45309">${precio}</text>\n`;
        y += 11;

        // Ingredients
        if (ings) {
          // Truncate long ingredient lists
          const maxLen = Math.floor(colW / 3.5);
          const truncated = ings.length > maxLen ? ings.slice(0, maxLen) + '...' : ings;
          svg += `  <text x="${x}" y="${y}" font-size="7" fill="#888">${this.escapeHtml(truncated)}</text>\n`;
          y += 10;
        }
        y += 3;
      }
    });

    // Footer
    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    svg += `  <text x="${W / 2}" y="${H - MARGIN + 10}" text-anchor="middle" font-size="7" fill="#aaa">${fecha}</text>\n`;

    svg += '</svg>';

    // Save
    const dir = this.cartasHtmlDir(project_id) || path.join(process.cwd(), 'storage', 'pizzepos', 'cartas-html');
    await fs.mkdir(dir, { recursive: true });

    const filename = `${carta_id}_${orientacion}.svg`;
    const absolutePath = path.join(dir, filename);
    await fs.writeFile(absolutePath, svg, 'utf-8');

    const paths = this.getPaths(project_id);
    const storagePath = paths?.storagePath || path.join(process.cwd(), 'storage');
    const relativePath = '/' + path.relative(storagePath, absolutePath).replace(/\\/g, '/');

    this.metrics?.increment('carta.export_svg.completed');
    this.logger.info('carta.export_svg.completed', { carta_id, project_id, orientacion, size: svg.length });

    return {
      status: 200,
      data: {
        carta_id,
        orientacion,
        path: relativePath,
        size_bytes: svg.length,
        filename,
        columns: columns.length,
        message: `SVG vectorial generado: ${filename} (${(svg.length / 1024).toFixed(0)} KB, ${columns.length} columnas). Editable en Figma, Illustrator, Canva.`
      }
    };
  }

  // ==========================================
  // Helper: cargar carta desde disco
  // ==========================================

  async loadCarta(cartaId, projectId) {
    // Intentar ruta del proyecto activado
    const dir = this.cartasDir(projectId);
    if (dir) {
      try {
        const raw = await fs.readFile(path.join(dir, `${cartaId}.json`), 'utf-8');
        return JSON.parse(raw);
      } catch (_) {}
    }

    // Fallback: buscar en todas las rutas de proyectos registrados
    for (const [pid, paths] of this.projectPaths) {
      if (pid === projectId) continue;
      try {
        const fallbackDir = path.join(paths.featurePath, 'cartas');
        const raw = await fs.readFile(path.join(fallbackDir, `${cartaId}.json`), 'utf-8');
        return JSON.parse(raw);
      } catch (_) {}
    }

    // Último fallback: ruta por defecto (storage/pizzepos/cartas/)
    try {
      const defaultPath = path.join(process.cwd(), 'storage', 'pizzepos', 'cartas', `${cartaId}.json`);
      const raw = await fs.readFile(defaultPath, 'utf-8');
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  // ==========================================
  // Utils
  // ==========================================

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  slugify(text) {
    if (!text) return 'sin_nombre';
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'sin_nombre';
  }
}

module.exports = CartaImpresionModule;
