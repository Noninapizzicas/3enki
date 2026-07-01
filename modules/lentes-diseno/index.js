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

// El cuenco vive en DOS raíces: la SEMILLA curada (packs en el código, versionada) y
// lo CRECIDO en caliente por lentes.montar (en data/, persistente, fuera de git). Se
// escanean ambas; lo crecido AÑADE lentes/rutas al pack semilla de su dominio (nunca
// pisa motor/quimico/cuando_usar). Simetría con la cantera (cosecha: seed + data).
const PACKS_DIR = path.join(__dirname, 'packs');
const PACKS_DATA_DIR = path.join(process.cwd(), 'data', 'lentes-diseno', 'packs');

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
    this.version = '2.2.0';
    this._packs = new Map();    // dominio → { cuando_usar, lentes:Map<nombre,{cuando_usar,contenido}>, rutas, motor?, quimico? }
    this._timers = [];          // timers del químico (uno por pack que secreta)
    // ── GRAFO de órganos (cúpula Obsidian, capa 3). Sustrato barato + capa que
    //    crece con el tráfico. nodos = lentes; aristas DECLARADAS (co-ruta/co-dominio)
    //    + APRENDIDAS (co-uso). La selección puede navegar por vecindad, no solo tabla.
    this._nodos = new Map();    // nombre → { dominio, cuando_usar, tags:Set<tarea> }
    this._declarado = new Map();// "a|b" (ordenado) → peso declarado (estructura)
    this._aprendido = new Map();// "a|b" → peso aprendido (co-uso real; volátil, lo durará el destilador)
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._descubrirPacks();
    this._construirGrafo();     // teje las aristas DECLARADAS (sustrato; lo aprendido crece con el uso)
    this._anunciarPacks();      // EVENTO lente.registrar por pack (auto-descubrimiento = impulso)
    this._secretarQuimicos();   // arranca los químicos (hormonas a su cadencia)
    this.logger?.info('lentes-diseno.loaded', {
      module: this.name, version: this.version,
      packs: this._packs.size,
      lentes: [...this._packs.values()].reduce((a, p) => a + p.lentes.size, 0),
      motores: [...this._packs.values()].filter(p => p.motor).length,
      quimicos: this._timers.length,
      nodos: this._nodos.size, aristas: this._declarado.size
    });
  }

  async onUnload() {
    for (const t of this._timers) { try { clearInterval(t); } catch (_) { /* */ } }
    this._timers = [];
    this._packs.clear();
    this._nodos.clear(); this._declarado.clear(); this._aprendido.clear();
    await super.onUnload();
  }

  // ── la cúpula invertida: RECOGE packs/<dominio>/_pack.json (no dirige, recoge) ──
  // Escanea SEMILLA (código) primero y luego CRECIDO (data): lo crecido MERGEA en el
  // pack semilla de su dominio (añade lentes + extiende rutas); no crea dominios nuevos.
  _descubrirPacks() {
    this._packs.clear();
    this._scanPacks(PACKS_DIR, true);        // semilla: crea packs
    this._scanPacks(PACKS_DATA_DIR, false);  // crecido: solo mergea en dominios existentes
  }

  _scanPacks(baseDir, allowNew) {
    let dirs;
    try { dirs = fs.readdirSync(baseDir, { withFileTypes: true }); }
    catch (err) {
      if (baseDir === PACKS_DIR) this.logger?.error('lentes-diseno.packs.missing', { error: err.message });
      return;  // data/ ausente (aún sin montajes) = sin ruido
    }

    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const packDir = path.join(baseDir, d.name);
      const adnPath = path.join(packDir, '_pack.json');
      let adn;
      try { adn = JSON.parse(fs.readFileSync(adnPath, 'utf-8')); }
      catch (err) { this.logger?.warn('lentes-diseno.pack.sin_adn', { dir: d.name, error: err.message }); continue; }

      const dominio = adn.dominio || d.name;
      // GUARDA no-colgantes: lo crecido solo extiende un dominio que YA existe (bebido por página).
      if (!allowNew && !this._packs.has(dominio)) {
        this.logger?.warn('lentes-diseno.crecido.dominio_huerfano', { dominio });
        continue;
      }

      const lentes = new Map();
      // MEMORIA: carga el .md íntegro de cada lente (vive dentro del órgano).
      for (const [nombre, meta] of Object.entries(adn.memoria?.lentes || {})) {
        let contenido = '';
        try { contenido = fs.readFileSync(path.join(packDir, meta.archivo), 'utf-8'); }
        catch (err) { this.logger?.warn('lentes-diseno.lente.missing', { dominio, nombre, archivo: meta.archivo, error: err.message }); continue; }
        lentes.set(nombre, { cuando_usar: meta.cuando_usar || '', contenido });
      }
      const rutas = adn.memoria?.rutas || {};

      // MERGE: si el dominio ya existe (semilla), lo crecido AÑADE — nunca pisa
      // motor/quimico/cuando_usar de la semilla; solo suma lentes y extiende rutas.
      if (this._packs.has(dominio)) {
        const ex = this._packs.get(dominio);
        for (const [nombre, l] of lentes) ex.lentes.set(nombre, l);
        for (const [tarea, ns] of Object.entries(rutas)) {
          const cur = ex.rutas[tarea] || (ex.rutas[tarea] = []);
          for (const n of ns) if (!cur.includes(n)) cur.push(n);
        }
        continue;
      }

      // MOTOR: facultad despierta si el pack la trae; dormida si no. (Solo semilla.)
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
        lentes, rutas,
        motor,
        quimico: adn.quimico || null
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  GRAFO de órganos (cúpula Obsidian) — sustrato declarado + capa que aprende
  // ════════════════════════════════════════════════════════════════════════

  _arKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

  // SUSTRATO: nodos = lentes; tags = las rutas en las que participa (señal DECLARADA,
  // determinista, cero embeddings). Arista declarada = tags compartidos*2 + mismo dominio.
  _construirGrafo() {
    this._nodos.clear(); this._declarado.clear();
    // 1. nodos + tags (de las rutas del propio pack)
    for (const [dominio, pack] of this._packs) {
      const tagsDe = new Map();   // nombre → Set<tarea>
      for (const [tarea, ns] of Object.entries(pack.rutas)) {
        for (const n of ns) { if (!tagsDe.has(n)) tagsDe.set(n, new Set()); tagsDe.get(n).add(tarea); }
      }
      for (const nombre of pack.lentes.keys()) {
        this._nodos.set(nombre, {
          dominio, cuando_usar: pack.lentes.get(nombre).cuando_usar,
          tags: tagsDe.get(nombre) || new Set()
        });
      }
    }
    // 2. aristas declaradas (todos los pares; el peso 0 no se guarda)
    const nombres = [...this._nodos.keys()];
    for (let i = 0; i < nombres.length; i++) {
      for (let j = i + 1; j < nombres.length; j++) {
        const A = this._nodos.get(nombres[i]), B = this._nodos.get(nombres[j]);
        let peso = 0;
        for (const t of A.tags) if (B.tags.has(t)) peso += 2;        // co-ruta = usado junto (declarado fuerte)
        if (A.dominio === B.dominio) peso += 1;                       // co-dominio (vecindad débil)
        if (peso > 0) this._declarado.set(this._arKey(nombres[i], nombres[j]), peso);
      }
    }
  }

  // APRENDIDO: cada co-uso real (un obtener que trajo ≥2 lentes) refuerza la arista.
  // Volátil por ahora (vive en memoria, ligera); la durabilidad la dará el destilador.
  _coUso(nombres) {
    const ns = [...new Set(nombres)].filter(n => this._nodos.has(n));
    if (ns.length < 2) return;
    for (let i = 0; i < ns.length; i++)
      for (let j = i + 1; j < ns.length; j++) {
        const k = this._arKey(ns[i], ns[j]);
        this._aprendido.set(k, (this._aprendido.get(k) || 0) + 1);
      }
  }

  _peso(a, b) {
    const k = this._arKey(a, b);
    return (this._declarado.get(k) || 0) + (this._aprendido.get(k) || 0);
  }

  // VECINDAD: dado un nodo, los más cercanos por peso (declarado+aprendido).
  // Aquí emerge lo CROSS-DOMINIO: una arista aprendida puede unir diseño↔copy↔negocio
  // aunque ninguna tabla plana lo declare.
  _vecinas(desde, k = 5, dominioFiltro = null) {
    if (!this._nodos.has(desde)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `lente desconocida: ${desde}`, { lentes: [...this._nodos.keys()] });
    }
    const vec = [];
    for (const otro of this._nodos.keys()) {
      if (otro === desde) continue;
      const nodo = this._nodos.get(otro);
      if (dominioFiltro && nodo.dominio !== dominioFiltro) continue;
      const peso = this._peso(desde, otro);
      if (peso > 0) vec.push({
        nombre: otro, dominio: nodo.dominio, cuando_usar: nodo.cuando_usar,
        peso, declarado: this._declarado.get(this._arKey(desde, otro)) || 0,
        aprendido: this._aprendido.get(this._arKey(desde, otro)) || 0
      });
    }
    vec.sort((a, b) => b.peso - a.peso || a.nombre.localeCompare(b.nombre));
    return { status: 200, data: { desde, vecinas: vec.slice(0, Math.max(1, k | 0)) } };
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
  onVecinasRequest(e) { return this._atender(e, 'vecinas', 'lentes.vecinas.response', d => this._vecinas(d?.desde, d?.k, d?.dominio)); }
  onMontarRequest(e)  { return this._atender(e, 'montar',  'lentes.montar.response',  d => this._montar(d)); }
  // co-uso externo (p.ej. el destilador o el conserje observan un uso conjunto)
  onCoUso(e) { const d = (e && e.data) || e || {}; if (Array.isArray(d.lentes)) this._coUso(d.lentes); }

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

    // APRENDIZAJE: todo obtener con ≥2 lentes ES una observación de co-uso. Refuerza
    // la arista en caliente (sustrato que crece con el tráfico propio) y emite la
    // señal pública para quien quiera tejer durabilidad (destilador). Auto-alimentado.
    if (lentes.length >= 2) {
      const nombres = lentes.map(l => l.nombre);
      this._coUso(nombres);
      try { this.eventBus?.publish?.('lente.co_uso', { lentes: nombres, timestamp: new Date().toISOString() }); } catch (_) { /* best-effort */ }
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

  // ── MONTAR: la puerta de escritura del cuenco (crecible en caliente). Una skill
  // promovida desde la cantera ENTRA como lente activa en el pack de su dominio y, si
  // trae `tarea`, en esa ruta (para que el ruteo determinista la alcance). Persiste en
  // data/ (overlay ADN + .md) y re-descubre. GUARDA: no colgantes — el dominio debe
  // existir como pack (bebido por una página); no se inventan dominios muertos. ──
  _montar({ dominio, nombre, contenido, cuando_usar = '', tarea } = {}) {
    if (!dominio || typeof dominio !== 'string') return this._invalid('dominio');
    if (!nombre || typeof nombre !== 'string') return this._invalid('nombre');
    if (!contenido || typeof contenido !== 'string') return this._invalid('contenido');
    if (!this._packs.has(dominio)) {
      return this._errorResponse(409, 'CONFLICT_STATE',
        `dominio sin pack: no se montan colgantes en '${dominio}'`,
        { dominios_validos: [...this._packs.keys()] });
    }

    const archivo = `${this._slug(nombre)}.md`;
    const packDir = path.join(PACKS_DATA_DIR, dominio);   // dir por dominio raw (fs UTF-8 ok)
    const adnPath = path.join(packDir, '_pack.json');

    // overlay ADN del lado crecido (se lee-o-inicia; idempotente por nombre).
    let adn;
    try { adn = JSON.parse(fs.readFileSync(adnPath, 'utf-8')); }
    catch (_) { adn = { dominio, memoria: { lentes: {}, rutas: {} } }; }
    adn.memoria = adn.memoria || {};
    adn.memoria.lentes = adn.memoria.lentes || {};
    adn.memoria.rutas = adn.memoria.rutas || {};
    adn.memoria.lentes[nombre] = { archivo, cuando_usar };
    let tareaNorm = null;
    if (tarea) {
      tareaNorm = String(tarea).toLowerCase();
      const arr = adn.memoria.rutas[tareaNorm] || (adn.memoria.rutas[tareaNorm] = []);
      if (!arr.includes(nombre)) arr.push(nombre);
    }

    try {
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(path.join(packDir, archivo), String(contenido).trim() + '\n', 'utf-8');
      fs.writeFileSync(adnPath, JSON.stringify(adn, null, 2), 'utf-8');
    } catch (err) {
      return this._errorResponse(500, 'UNKNOWN_ERROR', `no se pudo montar la lente: ${err.message}`, { dominio, nombre });
    }

    this._descubrirPacks();   // re-indexa (semilla + crecido) → la lente ya es activa
    this._construirGrafo();
    const pack = this._packs.get(dominio);
    try {
      this.eventBus?.publish?.('lente.registrar', {
        dominio, cuando_usar: pack.cuando_usar,
        lentes: [...pack.lentes.keys()], tiene_motor: !!pack.motor, tiene_quimico: !!pack.quimico
      });
    } catch (_) { /* best-effort */ }
    this.metrics?.increment?.('lentes-diseno.montadas.total', { dominio });

    return { status: 200, data: { dominio, nombre, tarea: tareaNorm, montada: true, total_lentes: pack.lentes.size } };
  }

  _slug(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  }
}

module.exports = LentesDisenoModule;
