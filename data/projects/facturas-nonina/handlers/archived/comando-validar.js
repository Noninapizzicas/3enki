/**
 * Handler Proyecto: /validar
 *
 * Paso manual 4: Valida el ultimo resultado de /ia.
 * Lee de storage/ia/, comprueba campos y cuadre de importes.
 *
 * Flujo: /listar → /ocr → /ia → [/validar] → /guardar
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { EVENTS, resolveStoragePath, formatMoney } = require('../../../../lib/handler-utils');

const TOLERANCIA_IMPORTES = 0.02;

module.exports = {
  name: 'comando-validar',
  description: 'Valida datos extraidos por IA (paso manual)',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'validar';
  },

  async handle(event, { logger, emit, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    logger.info('comando-validar.ejecutando', { chatId, projectId });

    // 1. Leer ultimo resultado IA
    const iaDir = resolveStoragePath({
      config: cfg, projectId, subdir: 'ia'
    });

    let iaFiles;
    try {
      iaFiles = fs.readdirSync(iaDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();
    } catch (e) {
      iaFiles = [];
    }

    if (iaFiles.length === 0) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: 'No hay resultados de IA. Ejecuta /ia primero.'
      });
      return { success: false };
    }

    const iaData = JSON.parse(
      fs.readFileSync(path.join(iaDir, iaFiles[0]), 'utf-8')
    );
    const datos = iaData.datos;

    if (!datos) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: 'El resultado de IA no contiene datos. Ejecuta /ia de nuevo.'
      });
      return { success: false };
    }

    // 2. Validar campos obligatorios
    const checks = [];
    let errores = 0;

    const campos = [
      { val: datos.emisor?.nombre, label: 'Emisor' },
      { val: datos.emisor?.nif, label: 'NIF emisor' },
      { val: datos.factura?.numero, label: 'N. factura' },
      { val: datos.factura?.fecha, label: 'Fecha' },
      { val: datos.totales?.total, label: 'Total' }
    ];

    for (const c of campos) {
      if (c.val != null && c.val !== '') {
        checks.push(`  [OK] ${c.label}: ${c.val}`);
      } else {
        checks.push(`  [--] ${c.label}: FALTA`);
        errores++;
      }
    }

    // 3. Validar cuadre de importes
    const base = parseFloat(datos.totales?.base_imponible) || 0;
    const iva = parseFloat(datos.totales?.iva_importe) || 0;
    const total = parseFloat(datos.totales?.total) || 0;

    if (total > 0) {
      const calculado = base + iva;
      const diferencia = Math.abs(calculado - total);

      if (diferencia < TOLERANCIA_IMPORTES) {
        checks.push(`\n  [OK] Importes: ${base} + ${iva} = ${calculado.toFixed(2)} (total: ${total})`);
      } else {
        checks.push(`\n  [--] Importes: ${base} + ${iva} = ${calculado.toFixed(2)} != ${total} (dif: ${diferencia.toFixed(2)})`);
        errores++;
      }
    }

    // 4. Lineas de detalle
    const lineas = datos.lineas || [];
    if (lineas.length > 0) {
      checks.push(`\n  Lineas: ${lineas.length}`);
      lineas.slice(0, 5).forEach((l, i) => {
        checks.push(`    ${i + 1}. ${l.descripcion || '?'} - ${formatMoney(l.importe)}`);
      });
      if (lineas.length > 5) {
        checks.push(`    ... y ${lineas.length - 5} mas`);
      }
    }

    // 5. Resultado
    const estado = errores === 0 ? 'VALIDA' : `${errores} PROBLEMA(S)`;

    const mensaje = [
      `Validacion: ${iaData.fileName}`,
      `Estado: ${estado}`,
      '',
      ...checks,
      '',
      errores === 0
        ? 'Factura lista. Usa /guardar para archivarla.'
        : 'Revisa los problemas. Puedes /guardar igualmente o repetir /ocr + /ia.'
    ];

    emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
      botName, chatId,
      text: mensaje.join('\n')
    });

    logger.info('comando-validar.completado', {
      fileName: iaData.fileName, errores
    });

    return { success: true, errores };
  }
};
