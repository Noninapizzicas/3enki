/**
 * lentes-diseno — EL CUENCO (orquestador de packs de conocimiento del sistema).
 *
 * Nació sirviendo las 8 lentes de diseño; ahora es la cúpula invertida que RECOGE
 * N packs auto-descubiertos (packs/<dominio>/) y los sirve por UNA puerta. Cada
 * pack es un ÓRGANO con su anatomía declarada en _pack.json (su ADN):
 *
 *   MEMORIA  (.md)        lo que SABE   — siempre presente (lentes + rutas)
 *   MOTOR    (motor.js)   lo que HACE   — opcional; DORMIDO si el pack no lo trae
 *   QUÍMICO  (quimico)    su RITMO      — opcional; late una op y secreta su evento
 *   EVENTO                el IMPULSO    — lo único que cruza la frontera (el bus)
 *
 * La diferencia entre diseño (solo memoria), copy (solo memoria) y negocio
 * (memoria + motor + químico) NO es de naturaleza: es qué facultades tiene
 * despiertas. Soltar un pack nuevo = soltar un órgano. No se reescribe el cuenco.
 *
 * SELECCIÓN HÍBRIDA (cómo sabe QUÉ memoria entregar):
 *   - reflejo (determinista): obtener({ dominio?, tarea }) → rutas[tarea].
 *   - LLM (fuzzy):            obtener({ nombres }) → el LLM eligió leyendo cuando_usar.
 *   Sin `dominio`, busca en todos los packs; con `dominio`, se ciñe a ese órgano.
 *
 * Puertas (RPC del bus):
 *   lentes.listar.request  { dominio? } → { packs, lentes:[{nombre, dominio, cuando_usar}], rutas }
 *   lentes.obtener.request { dominio?, nombres?:[], tarea?:'' } → { lentes:[{nombre, dominio, cuando_usar, contenido}] }
 *   lentes.motor.request   { dominio, op, args } → { resultado }   (solo packs con motor despierto)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const PACKS_DIR = path.join(__dirname, 'packs');

// "7d" / "12h" / "30m" / "45s" → ms. null si no parsea (químico ausente).
function _parseCada(s) {
  const m = /^(\d+)\s*([smhd])$/.exec(String(s || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * mult;
}

class LentesDisenoModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'lentes-diseno';
    this.version = '2.0.0';
    this._packs = new Map();    // dominio → { cuando_usar, lentes:Map<nombre,{cuando_usar,contenido}>, rutas, motor?, quimico? }
    this._timers = [];          // timers del químico (uno por pack que secreta)
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._descubrirPacks();
    this._anunciarPacks();      // EVENTO lente.registrar por pack (auto-descubrimiento = impulso)
    this._secretarQuimicos();   // arranca los químicos (hormonas a su cadencia)
    this.logger?.info('lentes-diseno.loaded', {
      module: this.name, version: this.version,
      packs: this._packs.size,
      lentes: [...this._packs.values()].reduce((a, p) => a + p.lentes.size, 0),
      motores: [...this._packs.values()].filter(p => p.motor).length,
      quimicos: this._timers.length
    });
  }

  async onUnload() {
    for (const t of this._timers) { try { clearInterval(t); } catch (_) { /* */ } }
    this._timers = [];
    this._packs.clear();
    await super.onUnload();
  }

  // ── la cúpula invertida: RECOGE packs/<dominio>/_pack.json (no dirige, recoge) ──
  _descubrirPacks() {
    let dirs;
    try { dirs = fs.readdirSync(PACKS_DIR, { withFileTypes: true }); }
    catch (err) { this.logger?.error('lentes-diseno.packs.missing', { error: err.message }); return; }

    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const packDir = path.join(PACKS_DIR, d.name);
      const adnPath = path.join(packDir, '_pack.json');
      let adn;
      try { adn = JSON.parse(fs.readFileSync(adnPath, 'utf-8')); }
      catch (err) { this.logger?.warn('lentes-diseno.pack.sin_adn', { dir: d.name, error: err.message }); continue; }

      const dominio = adn.dominio || d.name;
      const lentes = new Map();
      // MEMORIA: carga el .md íntegro de cada lente (vive dentro del órgano).
      for (const [nombre, meta] of Object.entries(adn.memoria?.lentes || {})) {
        let contenido = '';
        try { contenido = fs.readFileSync(path.join(packDir, meta.archivo), 'utf-8'); }
        catch (err) { this.logger?.warn('lentes-diseno.lente.missing', { dominio, nombre, archivo: meta.archivo, error: err.message }); continue; }
        lentes.set(nombre, { cuando_usar: meta.cuando_usar || '', contenido });
      }

      // MOTOR: facultad despierta si el pack la trae; dormida si no.
      let motor = null;
      if (adn.motor?.hook) {
        try {
          const mod = require(path.join(packDir, adn.motor.hook));
          const ops = {};
          for (const op of (adn.motor.ops || Object.keys(mod))) {
            if (typeof mod[op] === 'function') ops[op] = mod[op];
          }
          motor = { ops };
        } catch (err) { this.logger?.warn('lentes-diseno.motor.error', { dominio, error: err.message }); }
      }

      this._packs.set(dominio, {
        cuando_usar: adn.cuando_usar || '',
        lentes, rutas: adn.memoria?.rutas || {},
        motor,
        quimico: adn.quimico || null
      });
    }
  }

  // ── ANUNCIA: cada pack emite su EVENTO de nacimiento (impulso, no escaneo muerto) ──
  _anunciarPacks() {
    if (!this.eventBus?.publish) return;
    for (const [dominio, pack] of this._packs) {
      try {
        this.eventBus.publish('lente.registrar', {
          dominio, cuando_usar: pack.cuando_usar,
          lentes: [...pack.lentes.keys()],
          tiene_motor: !!pack.motor, tiene_quimico: !!pack.quimico
        });
      } catch (_) { /* best-effort */ }
    }
  }

  // ── SECRETA: arranca el químico de cada pack que lo declara (la hormona) ──
  _secretarQuimicos() {
    if (!this.eventBus?.publish) return;
    for (const [dominio, pack] of this._packs) {
      const q = pack.quimico;
      if (!q || !q.op || !q.evento) continue;
      const ms = _parseCada(q.cada);
      if (!ms || !pack.motor?.ops?.[q.op]) continue;
      const late = () => {
        try {
          const resultado = pack.motor.ops[q.op]({});
          this.eventBus.publish(q.evento, { dominio, ...resultado, timestamp: new Date().toISOString() });
        } catch (err) { this.logger?.warn('lentes-diseno.quimico.error', { dominio, error: err.message }); }
      };
      const t = setInterval(late, ms);
      if (typeof t.unref === 'function') t.unref();   // no impide cerrar el proceso (tests)
      this._timers.push(t);
    }
  }

  // ── handlers del bus ──
  onListarRequest(e)  { return this._atender(e, 'listar',  'lentes.listar.response',  d => this._listar(d)); }
  onObtenerRequest(e) { return this._atender(e, 'obtener', 'lentes.obtener.response', d => this._obtener(d)); }
  onMotorRequest(e)   { return this._atender(e, 'motor',   'lentes.motor.response',   d => this._motor(d)); }

  // ── proyección: catálogo barato (nombre + dominio + cuando_usar) + rutas ──
  _listar(d) {
    const filtro = d?.dominio ? String(d.dominio) : null;
    const packs = [];
    const lentes = [];
    const rutas = {};
    for (const [dominio, pack] of this._packs) {
      if (filtro && dominio !== filtro) continue;
      packs.push({ dominio, cuando_usar: pack.cuando_usar, tiene_motor: !!pack.motor, tiene_quimico: !!pack.quimico });
      for (const [nombre, l] of pack.lentes) lentes.push({ nombre, dominio, cuando_usar: l.cuando_usar });
      for (const [tarea, ns] of Object.entries(pack.rutas)) rutas[tarea] = ns;
    }
    return { status: 200, data: { packs, lentes, rutas } };
  }

  // ── proyección: resuelve la SELECCIÓN HÍBRIDA y entrega los .md COMPLETOS ──
  _obtener(d) {
    // Si viene `dominio`, ciñe la búsqueda a ese órgano; si no, busca en todos.
    const filtro = d?.dominio ? String(d.dominio) : null;
    const packsBuscar = filtro
      ? (this._packs.has(filtro) ? [[filtro, this._packs.get(filtro)]] : [])
      : [...this._packs.entries()];

    if (filtro && packsBuscar.length === 0) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `dominio desconocido: ${filtro}`, { dominios_validos: [...this._packs.keys()] });
    }

    const pedidos = new Map();   // nombre → dominio (resuelto)

    // mitad REFLEJO: tarea → rutas (determinista). Acepta string o array.
    const tareas = Array.isArray(d?.tarea) ? d.tarea : (d?.tarea ? [d.tarea] : []);
    for (const t of tareas) {
      const key = String(t).toLowerCase();
      for (const [dominio, pack] of packsBuscar) {
        const ruta = pack.rutas[key];
        if (Array.isArray(ruta)) ruta.forEach(n => { if (!pedidos.has(n)) pedidos.set(n, dominio); });
      }
    }

    // mitad LLM: nombres elegidos leyendo los cuando_usar.
    const nombres = Array.isArray(d?.nombres) ? d.nombres : (d?.nombres ? [d.nombres] : []);
    for (const n of nombres) {
      const nombre = String(n);
      for (const [dominio, pack] of packsBuscar) {
        if (pack.lentes.has(nombre) && !pedidos.has(nombre)) { pedidos.set(nombre, dominio); break; }
      }
      if (!pedidos.has(nombre)) pedidos.set(nombre, null);   // marcado desconocido
    }

    if (pedidos.size === 0) {
      const rutasValidas = new Set();
      for (const [, pack] of packsBuscar) Object.keys(pack.rutas).forEach(r => rutasValidas.add(r));
      return this._errorResponse(400, 'INVALID_INPUT',
        'indica `tarea` (ruteo determinista) y/o `nombres` (elección del LLM)',
        { field: 'tarea|nombres', tareas_validas: [...rutasValidas] });
    }

    const lentes = [];
    const desconocidas = [];
    for (const [nombre, dominio] of pedidos) {
      const pack = dominio ? this._packs.get(dominio) : null;
      const l = pack?.lentes.get(nombre);
      if (l) lentes.push({ nombre, dominio, cuando_usar: l.cuando_usar, contenido: l.contenido });
      else desconocidas.push(nombre);
    }

    if (lentes.length === 0) {
      const validas = [];
      for (const [, pack] of packsBuscar) validas.push(...pack.lentes.keys());
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `ninguna lente válida en la petición: ${desconocidas.join(', ')}`,
        { desconocidas, lentes_validas: validas });
    }

    return { status: 200, data: { lentes, ...(desconocidas.length ? { desconocidas } : {}) } };
  }

  // ── la facultad DESPIERTA: flexiona el motor de un pack (hemisferio izquierdo) ──
  _motor(d) {
    const dominio = d?.dominio ? String(d.dominio) : null;
    const op = d?.op ? String(d.op) : null;
    if (!dominio || !op) {
      return this._errorResponse(400, 'INVALID_INPUT', 'requiere `dominio` y `op`', { field: 'dominio|op' });
    }
    const pack = this._packs.get(dominio);
    if (!pack) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `dominio desconocido: ${dominio}`, { dominios_validos: [...this._packs.keys()] });
    if (!pack.motor) return this._errorResponse(409, 'CONFLICT_STATE', `el pack '${dominio}' no tiene motor (facultad dormida)`, {});
    const fn = pack.motor.ops[op];
    if (typeof fn !== 'function') {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `op desconocida: ${op}`, { ops_validas: Object.keys(pack.motor.ops) });
    }
    try {
      const resultado = fn(d.args || {});
      return { status: 200, data: { dominio, op, resultado } };
    } catch (err) {
      return this._errorResponse(400, 'INVALID_INPUT', err.message, { dominio, op });
    }
  }
}

module.exports = LentesDisenoModule;
