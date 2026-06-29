/**
 * lentes-diseno — BASE COMPARTIDA del sistema: las 8 lentes de diseño.
 *
 * Reflejo PURO (sin mitad fuzzy): no decide nada, SIRVE conocimiento. Posee los
 * 8 agentes de diseño COMPLETOS (lentes/*.md, copiados de agency-agents/design)
 * y los entrega por el bus para que CUALQUIER página que diseñe (carta-design,
 * carta-digital, menu-generator, carta-marketing) beba de la misma puerta —
 * como marca/recetas son fuentes que todos consumen por RPC del dueño.
 *
 * NO es la capa de agentes (aparcada: tool-use roto bajo deepseek). Aquí no hay
 * agent.execute: el reflejo entrega los .md íntegros, el LLM de página TRANSFORMA
 * (adopta la lente y diseña). Blueprint-coherente puro.
 *
 * SELECCIÓN HÍBRIDA (cómo sabe QUÉ entregar):
 *   - reflejo (determinista): obtener({ tarea }) → rutas[tarea] del catálogo.
 *     Una respuesta correcta computable: 'tema'→[ux-architect,brand-guardian].
 *   - LLM (fuzzy):            obtener({ nombres }) → el LLM eligió leyendo los
 *     cuando_usar de listar(). Criterio, no computable.
 *   Se pueden combinar; el resultado se deduplica.
 *
 * Lazy: listar() es barato (solo nombre+cuando_usar); obtener() trae el .md
 * COMPLETO solo de las lentes pedidas → cero bloat por turno, conocimiento íntegro.
 *
 * Puerta (RPC del bus):
 *   lentes.listar.request  → { lentes: [{nombre, cuando_usar}], rutas }
 *   lentes.obtener.request { nombres?: [], tarea?: '' } → { lentes: [{nombre, cuando_usar, contenido}] }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const LENTES_DIR = path.join(__dirname, 'lentes');
const CATALOGO_PATH = path.join(LENTES_DIR, '_catalogo.json');

class LentesDisenoModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'lentes-diseno';
    this.version = '1.0.0';
    this._lentes = new Map();   // nombre → { cuando_usar, contenido }
    this._rutas = {};           // tarea → [nombre]
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._cargarCatalogo();
    this.logger?.info('lentes-diseno.loaded', { module: this.name, version: this.version, lentes: this._lentes.size });
  }

  async onUnload() {
    this._lentes.clear();
    this._rutas = {};
    await super.onUnload();
  }

  // Carga el catálogo + el contenido íntegro de cada .md (en memoria, son del módulo).
  _cargarCatalogo() {
    let cat;
    try { cat = JSON.parse(fs.readFileSync(CATALOGO_PATH, 'utf-8')); }
    catch (err) { this.logger?.error('lentes-diseno.catalogo.missing', { error: err.message }); return; }
    this._rutas = cat.rutas || {};
    for (const [nombre, meta] of Object.entries(cat.lentes || {})) {
      let contenido = '';
      try { contenido = fs.readFileSync(path.join(LENTES_DIR, meta.archivo), 'utf-8'); }
      catch (err) { this.logger?.warn('lentes-diseno.lente.missing', { nombre, archivo: meta.archivo, error: err.message }); continue; }
      this._lentes.set(nombre, { cuando_usar: meta.cuando_usar || '', contenido });
    }
  }

  // ── handlers del bus (una línea cada uno, sobre _atender de la base) ──
  onListarRequest(e)  { return this._atender(e, 'listar',  'lentes.listar.response',  () => this._listar()); }
  onObtenerRequest(e) { return this._atender(e, 'obtener', 'lentes.obtener.response', d => this._obtener(d)); }

  // ── proyección: el catálogo barato (nombre + cuando_usar) + las rutas ──
  // Esto es lo que el LLM lee para ELEGIR (mitad fuzzy) y lo que muestra las
  // tareas ruteables (mitad reflejo).
  _listar() {
    const lentes = [...this._lentes.entries()].map(([nombre, l]) => ({ nombre, cuando_usar: l.cuando_usar }));
    return { status: 200, data: { lentes, rutas: this._rutas } };
  }

  // ── proyección: resuelve la SELECCIÓN HÍBRIDA y entrega los .md COMPLETOS ──
  _obtener(d) {
    const pedidos = new Set();

    // mitad REFLEJO: tarea → rutas (determinista). Acepta string o array.
    const tareas = Array.isArray(d?.tarea) ? d.tarea : (d?.tarea ? [d.tarea] : []);
    for (const t of tareas) {
      const ruta = this._rutas[String(t).toLowerCase()];
      if (Array.isArray(ruta)) ruta.forEach(n => pedidos.add(n));
    }

    // mitad LLM: nombres elegidos leyendo los cuando_usar.
    const nombres = Array.isArray(d?.nombres) ? d.nombres : (d?.nombres ? [d.nombres] : []);
    for (const n of nombres) pedidos.add(String(n));

    if (pedidos.size === 0) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'indica `tarea` (ruteo determinista) y/o `nombres` (elección del LLM)',
        { field: 'tarea|nombres', tareas_validas: Object.keys(this._rutas), lentes_validas: [...this._lentes.keys()] });
    }

    const lentes = [];
    const desconocidas = [];
    for (const nombre of pedidos) {
      const l = this._lentes.get(nombre);
      if (l) lentes.push({ nombre, cuando_usar: l.cuando_usar, contenido: l.contenido });
      else desconocidas.push(nombre);
    }

    if (lentes.length === 0) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `ninguna lente válida en la petición: ${desconocidas.join(', ')}`,
        { desconocidas, lentes_validas: [...this._lentes.keys()] });
    }

    return { status: 200, data: { lentes, ...(desconocidas.length ? { desconocidas } : {}) } };
  }
}

module.exports = LentesDisenoModule;
