/**
 * Handler Base: Validar factura estructurada
 *
 * Recibe datos estructurados de una factura y:
 * 1. Normaliza al esquema de facturas-db
 * 2. Valida importes (base + IVA = total)
 * 3. Clasifica documento (invoice/receipt)
 * 4. Emite factura.procesada (válida) o factura.necesita_revision
 *
 * Lógica recuperada de archived/procesar-factura.js e integrada
 * en el pipeline modular.
 *
 * ENTRADA (evento): texto.estructurado
 * {
 *   datos: object,          // Datos crudos del LLM
 *   tipo: string,           // 'factura', 'ticket', 'documento'
 *   filePath: string,
 *   requestId: string,
 *   notificar: object,
 *   _pipeline: string,
 *   _meta: object
 * }
 *
 * SALIDA (evento):
 *   factura.procesada       → si pasa validación
 *   factura.necesita_revision → si falla validación
 *
 * @version 1.0.0
 */

const { EVENTS } = require('../lib/handler-utils');

// Tolerancia para validación de importes (en euros)
const TOLERANCIA_IMPORTES = 0.02;

// Confianza mínima del LLM (basada en _meta.costo > 0 indica que hubo respuesta)
const CONFIDENCE_THRESHOLD = 0.85;

module.exports = {
  name: 'validar-factura',
  description: 'Valida y normaliza datos de factura estructurada',
  trigger: EVENTS.TEXTO_ESTRUCTURADO,

  // Solo procesar facturas (no documentos genéricos)
  filter: (event) => {
    const data = event.data || event;
    return data._pipeline === 'factura' ||
           data.tipo === 'factura' ||
           data.requestId?.startsWith('fac-');
  },

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const { datos, filePath, requestId, notificar, _pipeline, _meta } = data;

    logger.info('validar-factura.inicio', { filePath, requestId });

    if (!datos) {
      logger.error('validar-factura.sin-datos', { requestId });
      emit(EVENTS.FACTURA_REVISION, {
        filePath, requestId, notificar, _pipeline, _meta,
        datos: null, datosRaw: null,
        razones: ['No se pudieron extraer datos del documento']
      });
      return { success: false, error: 'Sin datos' };
    }

    // 1. Normalizar al esquema de facturas-db
    const datosNormalizados = normalizarDatosFactura(datos);

    // 2. Validar importes: base + IVA = total
    const importes = {
      base: datosNormalizados.base_imponible,
      iva: datosNormalizados.cuota_iva || 0,
      total: datosNormalizados.total
    };
    const validacionImportes = validarImportes(importes);

    // 3. Clasificar documento
    const docType = clasificarDocumento(datos);

    // 4. Evaluar reglas de validación
    const reglas = {
      importesCuadran: validacionImportes.ok,
      diferenciaImportes: validacionImportes.diferencia,
      tieneNumeroFactura: !!datosNormalizados.numero_factura,
      tieneProveedor: !!datosNormalizados.nombre_proveedor,
      tieneFecha: !!datosNormalizados.fecha_factura,
      tieneTotal: datosNormalizados.total !== null
    };

    const razones = construirRazonesRevision(reglas, validacionImportes);
    const necesitaRevision = razones.length > 0;

    logger.info('validar-factura.resultado', {
      requestId, docType,
      valida: !necesitaRevision,
      razones: razones.length,
      importes
    });

    // 5. Emitir resultado
    const payload = {
      filePath, requestId, notificar, _pipeline, _meta,
      datos: datosNormalizados,
      datosRaw: datos,
      docType,
      validacion: { reglas, razones }
    };

    if (necesitaRevision) {
      emit(EVENTS.FACTURA_REVISION, { ...payload, razones });
    } else {
      emit(EVENTS.FACTURA_PROCESADA, payload);
    }

    return { success: true, valida: !necesitaRevision, docType };
  }
};

// ============================================
// Normalización
// ============================================

/**
 * Normaliza datos de factura al esquema estándar de facturas-db
 */
function normalizarDatosFactura(datos) {
  if (!datos) return null;

  return {
    nombre_proveedor: datos.emisor?.nombre || null,
    nif_proveedor: datos.emisor?.nif || null,
    direccion_proveedor: datos.emisor?.direccion || null,

    receptor_nombre: datos.receptor?.nombre || null,
    receptor_nif: datos.receptor?.nif || null,

    numero_factura: datos.factura?.numero || null,
    fecha_factura: datos.factura?.fecha || null,
    fecha_vencimiento: datos.factura?.fecha_vencimiento || null,

    base_imponible: parseFloat(datos.totales?.base_imponible) || null,
    porcentaje_iva: parseFloat(datos.totales?.iva_porcentaje) || null,
    cuota_iva: parseFloat(datos.totales?.iva_importe) || null,
    total: parseFloat(datos.totales?.total) || null,

    forma_pago: datos.forma_pago || null,
    concepto: datos.lineas?.[0]?.descripcion || null,
    lineas: datos.lineas || [],

    observaciones: datos.observaciones || null
  };
}

// ============================================
// Validación
// ============================================

/**
 * Valida que base + IVA = total (con tolerancia)
 */
function validarImportes({ base, iva, total }) {
  if (base == null || total == null) {
    return { ok: false, diferencia: null, razon: 'Faltan importes' };
  }

  const calculado = Number(base) + Number(iva || 0);
  const diferencia = Math.abs(calculado - Number(total));

  return {
    ok: diferencia < TOLERANCIA_IMPORTES,
    diferencia: Math.round(diferencia * 100) / 100,
    calculado,
    razon: diferencia >= TOLERANCIA_IMPORTES
      ? `Base(${base}) + IVA(${iva}) = ${calculado.toFixed(2)} ≠ Total(${total})`
      : null
  };
}

/**
 * Clasifica documento: invoice (factura A4) vs receipt (ticket)
 */
function clasificarDocumento(datos) {
  const lineItems = datos.lineas || [];
  const tieneNumeroFactura = !!datos.factura?.numero;
  const tieneNIF = !!datos.emisor?.nif;

  if (lineItems.length > 5 && !tieneNumeroFactura) return 'receipt';
  if (tieneNumeroFactura && tieneNIF) return 'invoice';
  return 'unknown';
}

/**
 * Construye lista de razones por las que necesita revisión
 */
function construirRazonesRevision(reglas, validacionImportes) {
  const razones = [];

  if (!reglas.importesCuadran && validacionImportes.diferencia !== null) {
    razones.push(`Importes no cuadran (diferencia: ${validacionImportes.diferencia}€)`);
  }

  if (!reglas.tieneNumeroFactura) {
    razones.push('Sin número de factura');
  }

  if (!reglas.tieneProveedor) {
    razones.push('Proveedor no identificado');
  }

  if (!reglas.tieneFecha) {
    razones.push('Sin fecha de factura');
  }

  if (!reglas.tieneTotal) {
    razones.push('Sin importe total');
  }

  return razones;
}
