/**
 * Handler Proyecto: /gofull
 *
 * Pipeline batch completo de facturas.
 * 1. Descarga Gmail
 * 2. PDF a PNG
 * 3. Sharp prepare-ocr
 * 4. OCR Google Vision
 * 5. Estructura DeepSeek
 * 6. CSV fiscal
 * 7. Mueve originales procesados sin error a procesados/
 *
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

const PROMPT_ESTRUCTURA = `Eres un experto en extracción de datos de facturas. A partir del texto OCR que te proporciono, extrae los datos estructurados en JSON con este formato exacto:

{
  "emisor": {
    "nombre": "",
    "cif": "",
    "direccion": "",
    "telefono": "",
    "web": ""
  },
  "receptor": {
    "nombre": "",
    "cif": "",
    "direccion": "",
    "codigo_cliente": ""
  },
  "factura": {
    "numero": "",
    "fecha": "",
    "forma_pago": ""
  },
  "lineas": [
    {
      "descripcion": "",
      "unidades": 0,
      "precio": 0,
      "descuento": "",
      "importe": 0
    }
  ],
  "totales": {
    "base_imponible": 0,
    "iva_porcentaje": 0,
    "iva_importe": 0,
    "total_factura": 0,
    "resto_cobrar": 0
  }
}

Devuelve SOLO el JSON, sin explicaciones ni markdown.`;

const CSV_HEADERS = [
  'Fecha', 'Num_Factura', 'NIF_Emisor', 'Nombre_Emisor',
  'NIF_Receptor', 'Nombre_Receptor', 'Descripcion',
  'Base_Imponible', 'Tipo_IVA', 'Cuota_IVA',
  'Tipo_RE', 'Cuota_RE', 'Total_Factura',
  'Forma_Pago', 'Clave_Operacion'
];

module.exports = {
  name: 'procesar-facturas',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'gofull';
  },

  async handle(event, { logger, emit, services, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;
    const gmail = cfg.gmail || {};

    // Directorios
    const baseDir = path.join(process.cwd(), 'data/projects', projectId, 'storage');
    const preproDir = path.join(baseDir, 'preprocesadas');
    const ocrDir = path.join(baseDir, 'ocr');
    const structDir = path.join(baseDir, 'estructuradas');
    const exportDir = path.join(baseDir, 'export');
    const procesadosDir = resolvePath(cfg.storage?.procesados, path.join(baseDir, 'procesados'));

    for (const dir of [preproDir, ocrDir, structDir, exportDir, procesadosDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    const stats = {
      gmail: { correos: 0, adjuntos: 0 },
      archivos: 0,
      pdf: { convertidos: 0, paginas: 0 },
      ocr: { ok: 0, errores: 0 },
      estructura: { ok: 0, errores: 0 },
      movidos: 0,
      csv: 0
    };

    const notificar = (texto) => {
      emit('telegram.send_message.request', { botName, chatId, text: texto });
    };

    notificar('Pipeline facturas iniciado...');

    // ═══ PASO 1: Gmail ═══
    if (gmail.account) {
      notificar(`1/6 Gmail: ${gmail.account}...`);
      try {
        await descargarGmail(services, gmail, logger, stats);
      } catch (e) {
        logger.error('batch.gmail.error', { error: e.message });
        notificar(`Gmail error: ${e.message}`);
      }
    }

    // ═══ PASO 2: Recoger archivos de inbox ═══
    const inboxBot = resolvePath(cfg.storage?.inbox?.telegram, `data/bots/${botName}/received`);
    const inboxGmail = resolvePath(cfg.storage?.inbox?.gmail, `data/gmail/${gmail.account || 'default'}`);

    const extensionesImg = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'];
    const originales = [];

    for (const [dir, origen] of [[inboxBot, 'bot'], [inboxGmail, 'gmail']]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        const ext = path.extname(f).toLowerCase();
        if (ext === '.pdf') {
          originales.push({ name: f, path: path.join(dir, f), origen, tipo: 'pdf' });
        } else if (extensionesImg.includes(ext)) {
          originales.push({ name: f, path: path.join(dir, f), origen, tipo: 'imagen' });
        }
      }
    }

    stats.archivos = originales.length;

    if (originales.length === 0) {
      notificar(`Pipeline: Gmail ${stats.gmail.adjuntos} adjuntos. No hay archivos nuevos en inbox.`);
      return;
    }

    notificar(`2/6 Encontrados ${originales.length} archivos (${originales.filter(o => o.tipo === 'pdf').length} PDF, ${originales.filter(o => o.tipo === 'imagen').length} img)`);

    // ═══ PASOS 3-6: Procesar cada archivo ═══
    for (const original of originales) {
      let exito = true;
      let imagenesGeneradas = [];

      try {
        // PASO 3: PDF a PNG o copiar imagen
        if (original.tipo === 'pdf') {
          const r = await services.call('local.pdf-to-png', 'convert', {
            pdf: original.path, dpi: 300, outputFolder: preproDir
          }, { timeout: 60000 });
          const d = r.data || r;
          imagenesGeneradas = (d.images || []).map(img =>
            img.path || path.join(preproDir, img.name)
          );
          stats.pdf.convertidos++;
          stats.pdf.paginas += imagenesGeneradas.length;
        } else {
          const dest = path.join(preproDir, original.name);
          if (original.path !== dest) fs.copyFileSync(original.path, dest);
          imagenesGeneradas = [dest];
        }

        // Procesar cada imagen del archivo
        for (const imgPath of imagenesGeneradas) {
          const baseName = path.basename(imgPath, path.extname(imgPath));

          // PASO 4: Sharp prepare-ocr
          const preparedPath = path.join(preproDir, `prepared_${baseName}.png`);
          await services.call('local.sharp', 'prepare-ocr', {
            image: imgPath,
            options: { grayscale: true, normalize: true, sharpen: true, maxWidth: 2400, maxHeight: 3200 },
            output: preparedPath
          }, { timeout: 30000 });

          // PASO 5: OCR Google Vision
          const ocrResult = await services.call('local.google-vision', 'extract', {
            image: preparedPath,
            hint: 'DOCUMENT_TEXT_DETECTION',
            languageHints: ['es']
          }, { timeout: 60000 });

          const texto = (ocrResult.data || ocrResult).text || '';
          if (!texto) {
            stats.ocr.errores++;
            exito = false;
            continue;
          }
          stats.ocr.ok++;

          // Guardar OCR
          fs.writeFileSync(path.join(ocrDir, `${baseName}.txt`), texto, 'utf-8');

          // PASO 6: Estructura DeepSeek
          const structResult = await services.call('ai', 'chat', {
            messages: [
              { role: 'system', content: PROMPT_ESTRUCTURA },
              { role: 'user', content: texto }
            ],
            provider: 'deepseek',
            temperature: 0.1,
            max_tokens: 2000
          }, { timeout: 60000 });

          const respuesta = (structResult.data || structResult).content
            || (structResult.data || structResult).message || '';

          if (respuesta) {
            fs.writeFileSync(path.join(structDir, `${baseName}.json`), respuesta, 'utf-8');
            stats.estructura.ok++;
          } else {
            stats.estructura.errores++;
            exito = false;
          }
        }

      } catch (error) {
        exito = false;
        logger.error('batch.file-error', { archivo: original.name, error: error.message });
      }

      // Mover original si TODO fue OK
      if (exito && imagenesGeneradas.length > 0) {
        try {
          fs.renameSync(original.path, path.join(procesadosDir, original.name));
          stats.movidos++;
        } catch (e) {
          logger.error('batch.move-error', { archivo: original.name, error: e.message });
        }
      }
    }

    notificar(`5/6 Procesado: OCR ${stats.ocr.ok} ok, ${stats.ocr.errores} err | Estructura ${stats.estructura.ok} ok, ${stats.estructura.errores} err`);

    // ═══ PASO 7: CSV Export ═══
    try {
      const csvRows = generarFilasCSV(structDir, logger);

      if (csvRows.length > 0) {
        const csvPath = path.join(exportDir, `facturas_${fechaHoy()}.csv`);
        const BOM = '\uFEFF';
        let csv = BOM + CSV_HEADERS.join(';') + '\n';
        for (const row of csvRows) {
          csv += row.map(v => escapeCsv(v)).join(';') + '\n';
        }
        fs.writeFileSync(csvPath, csv, 'utf-8');
        stats.csv = csvRows.length;

        // Enviar CSV por Telegram
        emit('telegram.send_document.request', {
          botName, chatId,
          filePath: csvPath,
          caption: `Facturas ${fechaHoy()} - ${csvRows.length} registro(s)`
        });
      }
    } catch (e) {
      logger.error('batch.csv-error', { error: e.message });
    }

    // ═══ Resumen final ═══
    const resumen = [
      'Pipeline facturas completado',
      '',
      gmail.account ? `Gmail: ${stats.gmail.correos} correos, ${stats.gmail.adjuntos} adjuntos` : '',
      `Archivos inbox: ${stats.archivos}`,
      stats.pdf.convertidos > 0 ? `PDF convertidos: ${stats.pdf.convertidos} (${stats.pdf.paginas} pags)` : '',
      `OCR: ${stats.ocr.ok} ok` + (stats.ocr.errores > 0 ? `, ${stats.ocr.errores} err` : ''),
      `Estructura: ${stats.estructura.ok} ok` + (stats.estructura.errores > 0 ? `, ${stats.estructura.errores} err` : ''),
      `CSV: ${stats.csv} facturas exportadas`,
      '',
      `Procesados sin error: ${stats.movidos}/${stats.archivos} (movidos a procesados/)`,
      stats.movidos < stats.archivos ? `Pendientes: ${stats.archivos - stats.movidos} (se reintentaran)` : ''
    ].filter(Boolean).join('\n');

    notificar(resumen);

    logger.info('batch.completado', stats);
  }
};

// ═══ Funciones auxiliares ═══

function resolvePath(configPath, defaultPath) {
  const p = configPath || defaultPath;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

async function descargarGmail(services, gmail, logger, stats) {
  const busqueda = await services.call('local.gmail', 'search', {
    account: gmail.account,
    query: gmail.query || 'has:attachment is:unread',
    maxResults: gmail.maxResults || 20
  }, { timeout: 30000 });

  const messages = (busqueda.data || busqueda).messages || [];
  stats.gmail.correos = messages.length;
  if (messages.length === 0) return;

  const dirGmail = path.join(process.cwd(), `data/gmail/${gmail.account}`);
  if (!fs.existsSync(dirGmail)) fs.mkdirSync(dirGmail, { recursive: true });

  for (const msg of messages) {
    try {
      const correo = await services.call('local.gmail', 'read', {
        account: gmail.account, messageId: msg.id, format: 'full'
      }, { timeout: 30000 });

      const attachments = (correo.data || correo).attachments || [];

      for (const adj of attachments) {
        try {
          const descarga = await services.call('local.gmail', 'attachments.download', {
            account: gmail.account, messageId: msg.id, attachmentId: adj.id
          }, { timeout: 30000 });

          const d = descarga.data || descarga;
          if (!d.content) continue;

          const ahora = new Date();
          const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
          const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');
          const ext = path.extname(adj.filename) || '';
          const base = path.basename(adj.filename, ext);
          const nombre = `${fecha}-${hora}_${base}${ext}`;

          fs.writeFileSync(path.join(dirGmail, nombre), Buffer.from(d.content, 'base64'));
          stats.gmail.adjuntos++;
        } catch (e) {
          logger.error('batch.gmail.adj-error', { error: e.message, filename: adj.filename });
        }
      }
    } catch (e) {
      logger.error('batch.gmail.msg-error', { error: e.message, messageId: msg.id });
    }
  }
}

function generarFilasCSV(structDir, logger) {
  const rows = [];
  if (!fs.existsSync(structDir)) return rows;

  const archivos = fs.readdirSync(structDir).filter(f => f.endsWith('.json'));

  for (const archivo of archivos) {
    const raw = fs.readFileSync(path.join(structDir, archivo), 'utf-8');
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    let factura;
    try {
      factura = JSON.parse(cleaned);
    } catch (e) {
      logger.warn('batch.csv.parse-error', { file: archivo, error: e.message });
      continue;
    }

    let fecha = factura.factura?.fecha || '';
    if (fecha.match(/^\d{2}\/\d{2}\/\d{2}$/)) {
      fecha = fecha.replace(/(\d{2})\/(\d{2})\/(\d{2})/, '$1/$2/20$3');
    }

    const nifEmisor = factura.emisor?.cif || '';
    const total = factura.totales?.total_factura || 0;
    const claveOp = (!nifEmisor || (total < 400 && !factura.receptor?.cif)) ? 'F2' : 'F1';

    const lineas = factura.lineas || [];
    const desc = lineas.length === 1
      ? (lineas[0].descripcion || '')
      : lineas.map(l => l.descripcion).filter(Boolean).join(' + ');

    rows.push([
      fecha,
      factura.factura?.numero || '',
      nifEmisor,
      factura.emisor?.nombre || '',
      factura.receptor?.cif || '',
      factura.receptor?.nombre || '',
      desc,
      factura.totales?.base_imponible || 0,
      factura.totales?.iva_porcentaje || 0,
      factura.totales?.iva_importe || 0,
      factura.totales?.re_porcentaje || 0,
      factura.totales?.re_importe || 0,
      total,
      factura.factura?.forma_pago || '',
      claveOp
    ]);
  }

  return rows;
}

function escapeCsv(value) {
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
