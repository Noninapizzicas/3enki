/**
 * Invoice Processor Service
 * Procesa imágenes de facturas con OCR y extrae datos
 */

const path = require('path');
const fs = require('fs');

class InvoiceProcessor {
  constructor(logger, ocrService) {
    this.logger = logger;
    this.ocrService = ocrService;
  }

  /**
   * Procesa una imagen de factura
   * @param {Buffer} imageBuffer - Imagen en buffer
   * @param {string} mimeType - Tipo MIME
   * @param {string} fileName - Nombre del archivo
   * @returns {Promise<{text: string, extracted: object}>}
   */
  async processImage(imageBuffer, mimeType, fileName) {
    this.logger?.info('invoice.processing', { fileName, mimeType });

    // Convertir buffer a base64
    const base64Data = imageBuffer.toString('base64');

    // Extraer texto con OCR
    const ocrResult = await this.ocrService.extractText(base64Data, fileName, mimeType);

    // Extraer datos estructurados
    const extracted = this.extractInvoiceData(ocrResult.text);

    this.logger?.info('invoice.processed', {
      fileName,
      textLength: ocrResult.text.length,
      confidence: ocrResult.confidence,
      extracted
    });

    return {
      text: ocrResult.text,
      confidence: ocrResult.confidence,
      extracted
    };
  }

  /**
   * Extrae datos estructurados del texto OCR
   * Usa expresiones regulares para encontrar patrones comunes
   */
  extractInvoiceData(text) {
    const extracted = {
      vendor: null,
      date: null,
      total: null,
      taxId: null,
      invoiceNumber: null
    };

    if (!text) return extracted;

    const upperText = text.toUpperCase();

    // NIF/CIF (España)
    const taxIdMatch = text.match(/[A-Z]?\d{7,8}[A-Z]?/i) ||
                       text.match(/CIF[:\s]*([A-Z0-9]+)/i) ||
                       text.match(/NIF[:\s]*([A-Z0-9]+)/i);
    if (taxIdMatch) {
      extracted.taxId = taxIdMatch[1] || taxIdMatch[0];
    }

    // Fecha (varios formatos)
    const datePatterns = [
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/,  // DD/MM/YYYY o DD-MM-YYYY
      /(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/i,  // 15 de Enero de 2024
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        extracted.date = match[0];
        break;
      }
    }

    // Total (buscar patrones de importe)
    const totalPatterns = [
      /TOTAL[:\s]*€?\s*([\d.,]+)\s*€?/i,
      /IMPORTE\s*TOTAL[:\s]*€?\s*([\d.,]+)/i,
      /TOTAL\s*A\s*PAGAR[:\s]*€?\s*([\d.,]+)/i,
      /€\s*([\d.,]+)\s*$/m,  // Último euro en línea
    ];

    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Convertir a número
        const numStr = match[1].replace(/\./g, '').replace(',', '.');
        extracted.total = parseFloat(numStr);
        if (!isNaN(extracted.total)) break;
      }
    }

    // Número de factura
    const invoicePatterns = [
      /FACTURA[:\s]*N?[º°]?\s*([A-Z0-9\-\/]+)/i,
      /N[º°]?\s*FACTURA[:\s]*([A-Z0-9\-\/]+)/i,
      /INVOICE[:\s]*#?\s*([A-Z0-9\-\/]+)/i,
    ];

    for (const pattern of invoicePatterns) {
      const match = text.match(pattern);
      if (match) {
        extracted.invoiceNumber = match[1].trim();
        break;
      }
    }

    // Vendedor/Proveedor (primeras líneas suelen tener el nombre)
    const lines = text.split('\n').filter(l => l.trim().length > 3);
    if (lines.length > 0) {
      // Buscar línea que parezca nombre de empresa
      for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i].trim();
        // Si tiene formato de empresa (mayúsculas, S.L., S.A., etc.)
        if (line.match(/S\.?[LA]\.?|S\.?L\.?U\.?|SOCIEDAD|EMPRESA/i) ||
            (line.length > 5 && line.length < 50 && !line.match(/^\d/))) {
          extracted.vendor = line;
          break;
        }
      }
    }

    return extracted;
  }

  /**
   * Genera un nombre de archivo basado en los datos extraídos
   */
  generateFileName(extracted, originalName) {
    const parts = [];

    // Fecha
    if (extracted.date) {
      const dateClean = extracted.date.replace(/[\/\-\.]/g, '');
      parts.push(dateClean);
    } else {
      parts.push(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    }

    // Proveedor (sanitizado)
    if (extracted.vendor) {
      const vendorClean = extracted.vendor
        .substring(0, 20)
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_');
      parts.push(vendorClean);
    }

    // Importe
    if (extracted.total) {
      parts.push(`${extracted.total.toFixed(2)}EUR`);
    }

    // Extensión original
    const ext = path.extname(originalName) || '.jpg';

    return parts.join('_') + ext;
  }

  /**
   * Valida si los datos extraídos son suficientes
   */
  validateExtraction(extracted) {
    const issues = [];

    if (!extracted.total) {
      issues.push('No se detectó importe total');
    }

    if (!extracted.date) {
      issues.push('No se detectó fecha');
    }

    if (!extracted.vendor && !extracted.taxId) {
      issues.push('No se detectó proveedor ni CIF/NIF');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

module.exports = InvoiceProcessor;
