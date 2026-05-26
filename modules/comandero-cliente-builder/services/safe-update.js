'use strict';

const path = require('path');
const fs = require('fs').promises;

/**
 * safeUpdate(filePath, mutator) — patron read-modify-write atomico para JSON.
 *
 * Equivalente JS del patron canonico safeUpdate del blueprint padre
 * subsistema-recetario (contrato llm-runtime-discipline principio 11).
 * El padre define el patron pensado para LLM-runtime atravesando
 * fs.{read,write}.request con expected_hash. Aqui implementamos la
 * version JS POC2 que vive intra-proceso:
 *
 *   1. lock por path serializa las operaciones concurrentes contra el
 *      mismo archivo (un solo node.js corre el sistema, los locks intra-
 *      proceso bastan; no hace falta hash CAS porque el lock garantiza
 *      orden sequencial).
 *   2. read snapshot (null si ENOENT).
 *   3. mutator(snapshot) -> nuevo objeto; si devuelve undefined, no-op.
 *   4. write atomico via tmp + rename.
 *
 * Cierra la clase de bugs "salmorejo perdido" del audit cross-blueprint
 * 2026-05-25: dos handlers reservando el ultimo item al mismo tiempo.
 * El segundo ve el estado tras el primero gracias al lock.
 */
class SafeUpdate {
  constructor() {
    this._locks = new Map();
  }

  /**
   * @param {string} filePath ruta absoluta al JSON
   * @param {(snapshot: any) => any | Promise<any>} mutator
   *   recibe el snapshot parseado (o null si ENOENT) y devuelve el nuevo
   *   objeto. Si devuelve undefined, no-op (no escribe). Puede ser async.
   * @returns {Promise<any>} el objeto persistido (o null si no-op)
   */
  async update(filePath, mutator) {
    const prev = this._locks.get(filePath) || Promise.resolve();
    const next = prev.then(() => this._doUpdate(filePath, mutator));
    // Guardar la promesa pero capturar errores para no romper la cadena
    this._locks.set(filePath, next.catch(() => {}));
    try {
      return await next;
    } finally {
      // Liberar el lock si fue el ultimo en la cadena
      if (this._locks.get(filePath) === next.catch(() => {})) {
        this._locks.delete(filePath);
      }
    }
  }

  async _doUpdate(filePath, mutator) {
    let snapshot = null;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      snapshot = JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const mutated = await mutator(snapshot);
    if (mutated === undefined) return null;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const content = JSON.stringify(mutated, null, 2);
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, filePath);
    return mutated;
  }

  /**
   * @param {string} filePath
   * @returns {Promise<any | null>} contenido parseado o null si ENOENT
   */
  async read(filePath) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
}

module.exports = { SafeUpdate };
