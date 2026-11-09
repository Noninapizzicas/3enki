/**
 * PosPersistencia — snapshot por proyecto del estado vivo de un reflejo del POS.
 *
 * Composición sobre herencia: un reflejo del POS (carrito/cobro/cuenta/cierre) tiene
 * estado transaccional en memoria (Maps/arrays). Este helper lo persiste como un
 * snapshot JSON por proyecto vía el reflejo fs (fs.write atómico), lo restaura en
 * project.activated, y lo vuelca en onUnload. Debounced (no escribe en cada tecla).
 *
 * El reflejo aporta DOS funciones puras (map/array ↔ objeto serializable):
 *   snapshot(project_id) → objeto con SOLO las entidades de ese proyecto.
 *   hidratar(project_id, data) → carga esas entidades en su estado (merge por id).
 * Así la persistencia no conoce la forma del estado; el reflejo no conoce el bus fs.
 *
 * v0.1: si falta project_id (entidad sin proyecto) → no persiste (degradación honesta,
 * queda en memoria). El fichero vive en /prisma/pos/<file> del storage del proyecto.
 * Ver arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

class PosPersistencia {
  constructor({ modulo, file, snapshot, hidratar, saveMs = 800, dir = '/prisma/pos' }) {
    this.modulo = modulo;
    this.path = `${dir}/${file}`;
    this._snapshot = snapshot;
    this._hidratar = hidratar;
    this.saveMs = saveMs;
    this.dirty = new Set();
    this._timer = null;
  }

  // marca un proyecto como sucio y agenda un flush debounced.
  marcarDirty(project_id) {
    if (!project_id) return;   // sin proyecto → solo memoria (honesto)
    this.dirty.add(project_id);
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, this.saveMs);
    if (this._timer && typeof this._timer.unref === 'function') this._timer.unref();
  }

  async flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const pendientes = [...this.dirty];
    this.dirty.clear();
    for (const project_id of pendientes) {
      try {
        const obj = this._snapshot(project_id);
        const content = JSON.stringify({ _version: 1, _updated: new Date().toISOString(), ...obj });
        await this.modulo._rpc('fs.write.request', { project_id, path: this.path, content, encoding: 'utf-8', atomic: true });
      } catch (_) { /* best-effort: el POS sigue vivo en memoria */ }
    }
  }

  async restaurar(project_id) {
    if (!project_id) return;
    try {
      const data = await this.modulo._leerJson(project_id, this.path);
      if (data) this._hidratar(project_id, data);
    } catch (_) { /* best-effort */ }
  }

  detener() { if (this._timer) { clearTimeout(this._timer); this._timer = null; } }
}

module.exports = PosPersistencia;
