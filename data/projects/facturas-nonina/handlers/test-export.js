/**
 * Handler Proyecto: /goexport
 *
 * Genera CSV fiscal a partir de la ultima factura estructurada.
 * Formato compatible con asesoria fiscal española (Libro Registro Facturas Recibidas).
 *
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

const CSV_HEADERS = [
  'Fecha',
  'Num_Factura',
  'NIF_Emisor',
  'Nombre_Emisor',
  'NIF_Receptor',
  'Nombre_Receptor',
  'Descripcion',
  'Base_Imponible',
  'Tipo_IVA',
  'Cuota_IVA',
  'Tipo_RE',
  'Cuota_RE',
  'Total_Factura',
  'Forma_Pago',
  'Clave_Operacion'
];

module.exports = {
  name: 'test-export',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'goexport';
  },

  async handle(event, { logger, emit, services, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    // 1. Buscar ultima factura estructurada
    const structDir = path.join(process.cwd(), 'data/projects', projectId, 'storage', 'estructuradas');
    const exportDir = path.join(process.cwd(), 'data/projects', projectId, 'storage', 'export');

    if (!fs.existsSync(structDir)) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: 'No hay facturas estructuradas. Usa /gostructure primero.'
      });
      return;
    }

    const archivos = fs.readdirSync(structDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, path: path.join(structDir, f), mtime: fs.statSync(path.join(structDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (archivos.length === 0) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: 'No hay facturas estructuradas. Usa /gostructure primero.'
      });
      return;
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `Exportando ${archivos.length} factura(s) a CSV...`
    });

    try {
      // 2. Leer todas las facturas estructuradas
      const rows = [];

      for (const archivo of archivos) {
        const raw = fs.readFileSync(archivo.path, 'utf-8');
        // Limpiar posible markdown ```json ... ```
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        let factura;

        try {
          factura = JSON.parse(cleaned);
        } catch (e) {
          logger.warn('test-export.parse-error', { file: archivo.name, error: e.message });
          continue;
        }

        // Normalizar fecha a formato DD/MM/AAAA
        let fecha = factura.factura?.fecha || '';
        if (fecha.match(/^\d{2}\/\d{2}\/\d{2}$/)) {
          fecha = fecha.replace(/(\d{2})\/(\d{2})\/(\d{2})/, '$1/$2/20$3');
        }

        // Determinar clave de operacion SII
        const claveOp = detectarClaveOperacion(factura);

        const row = [
          fecha,
          factura.factura?.numero || '',
          factura.emisor?.cif || '',
          factura.emisor?.nombre || '',
          factura.receptor?.cif || '',
          factura.receptor?.nombre || '',
          resumenLineas(factura.lineas),
          factura.totales?.base_imponible || 0,
          factura.totales?.iva_porcentaje || 0,
          factura.totales?.iva_importe || 0,
          factura.totales?.re_porcentaje || 0,
          factura.totales?.re_importe || 0,
          factura.totales?.total_factura || 0,
          factura.factura?.forma_pago || '',
          claveOp
        ];

        rows.push(row);
      }

      if (rows.length === 0) {
        emit('telegram.send_message.request', {
          botName, chatId,
          text: 'No se pudo parsear ninguna factura.'
        });
        return;
      }

      // 3. Generar CSV con separador ; (compatible con Excel español)
      if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

      const csvPath = path.join(exportDir, `facturas_${Date.now()}.csv`);
      const BOM = '\uFEFF'; // BOM UTF-8 para que Excel lo abra bien
      let csv = BOM + CSV_HEADERS.join(';') + '\n';

      for (const row of rows) {
        csv += row.map(v => escapeCsv(v)).join(';') + '\n';
      }

      fs.writeFileSync(csvPath, csv, 'utf-8');

      // 4. Mostrar resumen y enviar archivo
      const mensaje = [
        `CSV generado: ${rows.length} factura(s)`,
        `Archivo: ${path.basename(csvPath)}`,
        '',
        'Columnas: Fecha, Factura, NIF Emisor, Emisor, NIF Receptor,',
        'Receptor, Descripcion, Base, %IVA, Cuota IVA, %RE, Cuota RE,',
        'Total, Forma Pago, Clave Op.',
        '',
        'Vista previa:',
        CSV_HEADERS.join(' | '),
        rows.map(r => r.join(' | ')).join('\n')
      ].join('\n');

      // Truncar para Telegram
      const textoTelegram = mensaje.length > 3500
        ? mensaje.substring(0, 3500) + '\n\n... (truncado)'
        : mensaje;

      emit('telegram.send_message.request', { botName, chatId, text: textoTelegram });

      // Enviar archivo CSV por Telegram
      emit('telegram.send_document.request', {
        botName, chatId,
        filePath: csvPath,
        caption: `Facturas export - ${rows.length} registro(s)`
      });

      logger.info('test-export.ok', {
        facturas: rows.length,
        csvPath: path.basename(csvPath)
      });

    } catch (error) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: `Error exportando: ${error.message}`
      });
      logger.error('test-export.error', { error: error.message });
    }
  }
};

// Helpers

function escapeCsv(value) {
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function resumenLineas(lineas) {
  if (!lineas || lineas.length === 0) return '';
  if (lineas.length === 1) return lineas[0].descripcion || '';
  return lineas.map(l => l.descripcion).filter(Boolean).join(' + ');
}

function detectarClaveOperacion(factura) {
  // F1 = Factura corriente (la mas comun)
  // F2 = Factura simplificada (tickets)
  // F3 = Factura emitida como sustitutiva de simplificada
  // F5 = Importaciones
  const total = factura.totales?.total_factura || 0;
  const nifEmisor = factura.emisor?.cif || '';

  // Si no tiene NIF emisor o es muy simplificada -> F2
  if (!nifEmisor || total < 400 && !factura.receptor?.cif) {
    return 'F2';
  }

  return 'F1';
}
