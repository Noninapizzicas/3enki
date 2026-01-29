/**
 * Handler: Pipeline de Factura (Orquestador)
 *
 * Conecta los handlers individuales en un flujo completo:
 *   imagen.preparar.request → imagen.preparada
 *   imagen.preparada → documento.ocr.request
 *   documento.ocr.completado → texto.estructurar.request
 *   texto.estructurado → factura.procesada
 *
 * Este handler es OPCIONAL - permite encadenar automáticamente.
 * También se pueden usar los handlers individuales por separado.
 *
 * FLUJO COMPLETO:
 *   factura.procesar.request
 *        ↓
 *   imagen.preparar.request (→ preparar-imagen + Sharp)
 *        ↓
 *   imagen.preparada
 *        ↓
 *   documento.ocr.request (→ ocr-tesseract)
 *        ↓
 *   documento.ocr.completado
 *        ↓
 *   texto.estructurar.request (→ estructurar-deepseek)
 *        ↓
 *   texto.estructurado
 *        ↓
 *   factura.procesada
 *
 * @version 2.0.0
 */

module.exports = [
  // =========================================================================
  // PASO 1: Iniciar pipeline → Preparar imagen
  // =========================================================================
  {
    name: 'factura-pipeline-inicio',
    description: 'Inicia el pipeline con preprocesamiento de imagen',
    trigger: 'factura.procesar.request',

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { filePath, language = 'spa', notificar, skipPreprocess = false } = data;
      const requestId = data.requestId || `fac-${Date.now()}`;

      logger.info('factura-pipeline.inicio', { filePath, requestId, skipPreprocess });

      if (skipPreprocess) {
        // Saltar preprocesamiento, ir directo a OCR
        emit('documento.ocr.request', {
          filePath,
          language,
          requestId,
          notificar,
          _pipeline: 'factura'
        });
      } else {
        // Primero preparar la imagen
        emit('imagen.preparar.request', {
          filePath,
          language,
          requestId,
          notificar,
          _pipeline: 'factura'
        });
      }

      return { success: true, requestId };
    }
  },

  // =========================================================================
  // PASO 1.5: Imagen preparada → OCR
  // =========================================================================
  {
    name: 'factura-pipeline-imagen-a-ocr',
    description: 'Conecta imagen preparada con OCR',
    trigger: 'imagen.preparada',

    filter: (event) => {
      const data = event.data || event;
      return data._pipeline === 'factura' || data.requestId?.startsWith('fac-');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { filePath, imagenProcesada, requestId, notificar, language = 'spa' } = data;

      logger.info('factura-pipeline.imagen-preparada', {
        filePath,
        tieneImagenProcesada: !!imagenProcesada,
        requestId
      });

      // Usar imagen procesada (base64) si existe, sino la original
      emit('documento.ocr.request', {
        filePath,
        image: imagenProcesada, // base64 de imagen procesada (o null)
        language,
        requestId,
        notificar,
        _pipeline: 'factura'
      });

      return { success: true };
    }
  },

  // =========================================================================
  // PASO 2: OCR completado → Estructurar
  // =========================================================================
  {
    name: 'factura-pipeline-ocr-a-estructura',
    description: 'Conecta OCR completado con estructuración',
    trigger: 'documento.ocr.completado',

    // Solo procesar si viene del pipeline de facturas
    filter: (event) => {
      const data = event.data || event;
      return data._pipeline === 'factura' || data.requestId?.startsWith('fac-');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { texto, filePath, requestId, confianza, notificar } = data;

      logger.info('factura-pipeline.ocr-completado', {
        caracteres: texto?.length,
        confianza,
        requestId
      });

      // Enviar a estructurar
      emit('texto.estructurar.request', {
        texto,
        tipo: 'factura',
        filePath,
        requestId,
        notificar, // Propagar datos de notificación
        _pipeline: 'factura'
      });

      return { success: true };
    }
  },

  // =========================================================================
  // PASO 3: Estructurado → Factura procesada
  // =========================================================================
  {
    name: 'factura-pipeline-estructurado',
    description: 'Marca factura como procesada',
    trigger: 'texto.estructurado',

    // Solo procesar si viene del pipeline de facturas
    filter: (event) => {
      const data = event.data || event;
      return data._pipeline === 'factura' ||
             data.tipo === 'factura' ||
             data.requestId?.startsWith('fac-');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { datos, filePath, requestId, _meta, notificar } = data;

      logger.info('factura-pipeline.completado', {
        filePath,
        requestId,
        tiempoTotal: _meta?.tiempoMs
      });

      // Emitir factura procesada con datos normalizados
      emit('factura.procesada', {
        filePath,
        requestId,
        datos: normalizarDatosFactura(datos),
        datosRaw: datos,
        notificar, // Propagar para notificación
        _meta
      });

      return { success: true, datos };
    }
  }
];

/**
 * Normaliza datos de factura al esquema de facturas-db
 */
function normalizarDatosFactura(datos) {
  if (!datos) return null;

  return {
    // Datos del emisor
    nombre_proveedor: datos.emisor?.nombre || null,
    nif_proveedor: datos.emisor?.nif || null,
    direccion_proveedor: datos.emisor?.direccion || null,

    // Datos de la factura
    numero_factura: datos.factura?.numero || null,
    fecha_factura: datos.factura?.fecha || null,
    fecha_vencimiento: datos.factura?.fecha_vencimiento || null,

    // Totales
    base_imponible: parseFloat(datos.totales?.base_imponible) || null,
    porcentaje_iva: parseFloat(datos.totales?.iva_porcentaje) || null,
    cuota_iva: parseFloat(datos.totales?.iva_importe) || null,
    total: parseFloat(datos.totales?.total) || null,

    // Otros
    forma_pago: datos.forma_pago || null,
    concepto: datos.lineas?.[0]?.descripcion || null,
    lineas: datos.lineas || [],

    // Receptor (si existe)
    receptor_nombre: datos.receptor?.nombre || null,
    receptor_nif: datos.receptor?.nif || null
  };
}
