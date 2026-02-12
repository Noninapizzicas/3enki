/**
 * Handler: Optimizar imagen con agente AI (con Visión)
 *
 * Cuando el OCR tiene baja confianza, dispara el agente image-processor
 * que PUEDE VER LA IMAGEN y decidir qué operaciones de Sharp aplicar.
 *
 * El agente recibe la imagen en base64 para análisis visual.
 *
 * ENTRADA (evento): documento.ocr.completado (con baja confianza)
 *
 * SALIDA (evento): imagen.optimizar.request → agente (con visión) → imagen.optimizada
 *
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');

// Umbral de confianza para activar optimización
const CONFIDENCE_THRESHOLD = 50;

// Tamaño máximo de imagen para enviar al agente (evitar tokens excesivos)
const MAX_IMAGE_SIZE = 1500;

module.exports = [
  // =========================================================================
  // Detectar OCR con baja confianza → Disparar agente con visión
  // =========================================================================
  {
    name: 'detectar-ocr-bajo',
    description: 'Detecta OCR con baja confianza y dispara agente con visión',
    trigger: 'documento.ocr.completado',

    filter: (event) => {
      const data = event.data || event;
      // Solo si la confianza es baja y viene del pipeline de facturas
      // Y no es ya un intento optimizado (evitar loops)
      return data.confianza < CONFIDENCE_THRESHOLD &&
             (data._pipeline === 'factura' || data.requestId?.startsWith('fac-')) &&
             !data._optimizado;
    },

    async handle(event, { logger, emit, services }) {
      const data = event.data || event;
      const { filePath, texto, confianza, requestId, notificar, _pipeline } = data;

      logger.warn('optimizar-imagen-agente.baja-confianza', {
        filePath,
        confianza,
        requestId
      });

      // Obtener información y preparar imagen para el agente
      let imageInfo = null;
      let imageBase64 = null;

      try {
        // Obtener info de la imagen
        const infoResult = await services.call('local.sharp', 'info', { image: filePath });
        if (infoResult.data?.success) {
          imageInfo = {
            width: infoResult.data.width,
            height: infoResult.data.height,
            format: infoResult.data.format
          };

          // Si la imagen es muy grande, redimensionar para el agente
          if (imageInfo.width > MAX_IMAGE_SIZE || imageInfo.height > MAX_IMAGE_SIZE) {
            const resizeResult = await services.call('local.sharp', 'resize', {
              image: filePath,
              width: MAX_IMAGE_SIZE,
              height: MAX_IMAGE_SIZE,
              fit: 'inside'
            });
            if (resizeResult.data?.success) {
              imageBase64 = resizeResult.data.image;
              logger.info('optimizar-imagen-agente.imagen-redimensionada', {
                original: `${imageInfo.width}x${imageInfo.height}`,
                reducida: `${resizeResult.data.width}x${resizeResult.data.height}`
              });
            }
          } else {
            // Leer imagen original en base64
            imageBase64 = fs.readFileSync(filePath).toString('base64');
          }
        }
      } catch (e) {
        logger.warn('optimizar-imagen-agente.preparacion-error', { error: e.message });
      }

      // Disparar agente de optimización CON LA IMAGEN
      emit('imagen.optimizar.request', {
        filePath,
        imageBase64,  // Imagen para visión del agente
        ocrResult: {
          texto: texto?.substring(0, 300), // Texto OCR actual (limitado)
          confianza
        },
        imageInfo,
        requestId,
        notificar,
        _pipeline,
        _optimizacionIntento: 1
      });

      return { success: true, agentTriggered: true };
    }
  },

  // =========================================================================
  // Imagen optimizada → Reintentar OCR
  // =========================================================================
  {
    name: 'reintenta-ocr-optimizado',
    description: 'Reintenta OCR con imagen optimizada por el agente',
    trigger: 'imagen.optimizada',

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const {
        filePath,
        imagenProcesada,
        operaciones,
        requestId,
        notificar,
        _pipeline,
        _optimizacionIntento = 1
      } = data;

      logger.info('reintenta-ocr-optimizado.recibido', {
        filePath,
        operaciones,
        intento: _optimizacionIntento,
        requestId
      });

      // Si el agente devolvió imagen procesada, usarla
      if (imagenProcesada) {
        emit('documento.ocr.request', {
          filePath,
          image: imagenProcesada, // Base64 de imagen optimizada
          language: 'spa',
          requestId: `${requestId}-opt${_optimizacionIntento}`,
          notificar,
          _pipeline,
          _optimizado: true,
          _optimizacionIntento
        });

        return { success: true, ocrRetried: true };
      }

      // Si no hay imagen procesada, continuar con la original
      logger.warn('reintenta-ocr-optimizado.sin-imagen', { requestId });

      return { success: false, reason: 'No processed image from agent' };
    }
  }
];
