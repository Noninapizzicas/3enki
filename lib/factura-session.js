/**
 * Sesión de factura por chat.
 *
 * Almacena el estado del pipeline paso a paso para cada chatId.
 * Los handlers usan esto en lugar de escanear directorios.
 *
 * Estado:
 * - lastReceivedPath: última foto descargada
 * - lastPreprocesadaPath: última imagen preprocesada (Sharp)
 * - lastOptimizadaPath: última imagen optimizada (agente)
 * - lastOCRPath: último archivo usado para OCR
 */

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

function sessionPath(botName, chatId) {
  return path.join(SESSIONS_DIR, `${botName}_${chatId}.json`);
}

function get(botName, chatId) {
  const p = sessionPath(botName, chatId);
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function update(botName, chatId, data) {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  const current = get(botName, chatId);
  const updated = { ...current, ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(sessionPath(botName, chatId), JSON.stringify(updated, null, 2));
  return updated;
}

/**
 * Devuelve la mejor ruta disponible para OCR:
 * optimizada > preprocesada > received
 */
function bestPathForOCR(botName, chatId) {
  const s = get(botName, chatId);
  return s.lastOptimizadaPath || s.lastPreprocesadaPath || s.lastReceivedPath || null;
}

module.exports = { get, update, bestPathForOCR };
