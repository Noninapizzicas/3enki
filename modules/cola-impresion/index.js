'use strict';

/**
 * cola-impresion — LA COLA DE IMPRESIÓN 3D (reflejo CUSTODIO único).
 *
 * Single-writer de la cola de impresión del taller (SPARKX i7, una pieza a la vez).
 * La cola NO es FIFO simple: un MOTOR DE ORDENACIÓN (_ordenar, proyección interna _op)
 * puntúa cada pieza pendiente con variables — material · urgencia · tamaño · tiempo —
 * y las variables se AJUSTAN CON EL USO: al extraer una pieza, su material pasa a ser
 * el "cargado" y gana prioridad (evita cambios de filamento). La cola NUNCA decide qué
 * imprimir (invariante 6): solo ordena lo aprobado.
 *
 * Dependencias:
 *   - _shared/modulo-hibrido-reflejo (base)
 *   - _shared/pos-persistencia (snapshot por proyecto)
 *   - filesystem (fs.*.request) para el store
 *   - catalogo-modelos por RPC (catalogo.obtener.request) para validar que el modelo existe
 *
 * Reglas del plan (sección 6.2):
 *   - _entrar(item): valida catalogo.existe + no duplicado → cola.entrada | cola.entrar.failed
 *   - _siguiente(): _ordenar(store, criterios) → pop primero → cola.extraccion | cola.vacia
 *   - _reordenar(itemId, pos): sube/baja una pendiente → cola.reordenada
 *   - _longitud(): pendientes + total
 *   - _ordenar(): motor (2.1), criterios parámetros
 *   - _detectarVacia(): (2.4)
 */

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

// Pesos del motor de ordenación (ajustables con el uso). El material cargado se
// actualiza en cada extracción → la variable "material" se ajusta dinámicamente.
const PESOS_DEFAULT = Object.freeze({
  material: 3,   // coincidir con el material cargado (evita cambio de filamento)
  urgencia: 2,   // prioridad declarada por el dueño (1..5)
  tamano: 1,     // piezas pequeñas primero (encadenar rápido)
  tiempo: 1      // antigüedad en cola (más espera → más score)
});

const ESTADOS = Object.freeze(['pendiente', 'imprimiendo', 'hecho', 'retirada']);

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }
const nowISO = () => new Date().toISOString();

class ColaImpresionReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola-impresion';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();          // project_id → { items: Map<id,ItemCola>, materialCargado, pesos }
    this._pesos = { ...PESOS_DEFAULT };

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cola-impresion.json',
      dir: '/impresion-3d/cola',
      snapshot: (pid) => {
        const s = this._stores.get(pid);
        if (!s) return null;
        return {
          project_id: pid,
          materialCargado: s.materialCargado || null,
          pesos: s.pesos || this._pesos,
          items: [...s.items.entries()].map(([id, it]) => [id, it])
        };
      },
      hidratar: (pid, data) => {
        if (!data || !data.items) return;
        const items = new Map();
        for (const [id, it] of data.items) items.set(id, it);
        this._stores.set(pid, {
          items,
          materialCargado: data.materialCargado || null,
          pesos: data.pesos || { ...PESOS_DEFAULT }
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // =============================================================
  // Handlers RPC (una línea cada uno, delegan a _atender)
  // =============================================================
  onEntrarRequest(e)    { return this._atender(e, 'entrar', 'cola.entrar.response', d => this._entrar(d)); }
  onSiguienteRequest(e) { return this._atender(e, 'siguiente', 'cola.siguiente.response', d => this._siguiente(d)); }
  onReordenarRequest(e) { return this._atender(e, 'reordenar', 'cola.reordenar.response', d => this._reordenar(d)); }
  onLongitudRequest(e)  { return this._atender(e, 'longitud', 'cola.longitud.response', d => this._longitud(d)); }
  onListarRequest(e)    { return this._atender(e, 'listar', 'cola.listar.response', d => this._listar(d)); }

  // =============================================================
  // Store
  // =============================================================
  _obtenerOCrear(pid) {
    let store = this._stores.get(pid);
    if (!store) {
      store = { items: new Map(), materialCargado: null, pesos: { ...PESOS_DEFAULT } };
      this._stores.set(pid, store);
      this._persist.marcarDirty(pid);
    }
    return store;
  }

  _pendientes(store) {
    return [...store.items.values()]
      .filter(i => i.estado === 'pendiente')
      .sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity));
  }

  // =============================================================
  // Proyecciones
  // =============================================================

  // _entrar — mete una pieza aprobada. Valida catalogo.existe (RPC) + no duplicado.
  async _entrar(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');
    if (!input.modelo_id) return this._invalid('modelo_id');
    if (!input.nombre) return this._invalid('nombre');

    // No duplicado: mismo modelo_id pendiente en la misma cola.
    const store = this._obtenerOCrear(pid);
    const duplicado = this._pendientes(store).some(i => i.modelo_id === input.modelo_id);
    if (duplicado) {
      return this._errorResponse(409, 'ALREADY_EXISTS', `El modelo '${input.modelo_id}' ya está pendiente en la cola`, { modelo_id: input.modelo_id });
    }

    // Valida que el modelo existe en el catálogo (RPC best-effort: si el catálogo no
    // responde, no bloquea la entrada — la cola solo ordena lo aprobado).
    if (this.eventBus?.publish) {
      const cat = await this._rpc('catalogo.obtener.request', { project_id: pid, id: input.modelo_id });
      if (cat && cat.status === 404) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `El modelo '${input.modelo_id}' no existe en el catálogo`, { modelo_id: input.modelo_id });
      }
    }

    const item = {
      id: input.item_id || crypto.randomUUID(),
      project_id: pid,
      modelo_id: input.modelo_id,
      nombre: String(input.nombre),
      material: input.material || 'desconocido',
      urgencia: Math.min(5, Math.max(1, Number(input.urgencia) || 1)),   // 1..5
      tamano: Number(input.tamano) || 0,                                  // mm³ estimado (0 = desconocido)
      estado: 'pendiente',
      orden: store.items.size + 1,
      creada_en: nowISO(),
      extraida_en: null
    };
    store.items.set(item.id, item);
    this._persist.marcarDirty(pid);

    this._publicarEvento('cola.entrada', {
      project_id: pid, item_id: item.id, modelo_id: item.modelo_id,
      nombre: item.nombre, material: item.material, urgencia: item.urgencia
    });

    return { status: 201, data: { project_id: pid, item } };
  }

  // _siguiente — extrae la siguiente pieza según el motor de ordenación.
  async _siguiente(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');
    const store = this._obtenerOCrear(pid);

    const pendientes = this._pendientes(store);
    if (pendientes.length === 0) {
      this._publicarEvento('cola.vacia', { project_id: pid });
      return { status: 200, data: { project_id: pid, vacia: true, item: null } };
    }

    // Motor de ordenación (proyección interna _op): puntúa y ordena.
    const ordenado = this._ordenar(store, pendientes);
    const siguiente = ordenado[0];
    siguiente.estado = 'imprimiendo';
    siguiente.extraida_en = nowISO();

    // AJUSTE CON EL USO: el material de la pieza extraída pasa a ser el cargado.
    if (siguiente.material && siguiente.material !== 'desconocido') {
      store.materialCargado = siguiente.material;
    }
    this._persist.marcarDirty(pid);

    this._publicarEvento('cola.extraccion', {
      project_id: pid, item_id: siguiente.id, modelo_id: siguiente.modelo_id,
      nombre: siguiente.nombre, material: siguiente.material, materialCargado: store.materialCargado
    });

    return { status: 200, data: { project_id: pid, vacia: false, item: siguiente, materialCargado: store.materialCargado } };
  }

  // _reordenar — sube/baja una pieza pendiente a una posición (1-based).
  async _reordenar(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');
    if (!input.item_id) return this._invalid('item_id');
    const store = this._obtenerOCrear(pid);

    const item = store.items.get(input.item_id);
    if (!item) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Item '${input.item_id}' no existe en la cola`, { item_id: input.item_id });
    if (item.estado !== 'pendiente') {
      return this._errorResponse(409, 'CONFLICT_STATE', `Solo se reordena una pieza pendiente (estado actual: ${item.estado})`, { item_id: input.item_id, estado: item.estado });
    }

    const pendientes = this._pendientes(store);
    const pos = Math.min(pendientes.length, Math.max(1, Number(input.pos) || 1));
    const actual = pendientes.findIndex(i => i.id === item.id);
    if (actual === -1) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Item '${input.item_id}' no está pendiente`, { item_id: input.item_id });

    // Reordena el array de pendientes y reescribe el orden en el store.
    pendientes.splice(actual, 1);
    pendientes.splice(pos - 1, 0, item);
    pendientes.forEach((it, idx) => { it.orden = idx + 1; });
    this._persist.marcarDirty(pid);

    this._publicarEvento('cola.reordenada', {
      project_id: pid, item_id: item.id, pos, total_pendientes: pendientes.length
    });

    return { status: 200, data: { project_id: pid, item_id: item.id, pos, total_pendientes: pendientes.length } };
  }

  // _longitud — pendientes + total.
  async _longitud(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');
    const store = this._obtenerOCrear(pid);
    const pendientes = this._pendientes(store);
    return { status: 200, data: { project_id: pid, pendientes: pendientes.length, total: store.items.size } };
  }

  // _listar — devuelve todos los items de la cola del proyecto (orden actual por estado).
  async _listar(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');
    const store = this._obtenerOCrear(pid);
    const items = [...store.items.values()]
      .sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity))
      .map((it) => ({
        id: it.id, estado: it.estado, orden: it.orden,
        modelo_id: it.modelo_id, nombre: it.nombre,
        material: it.material, urgencia: it.urgencia, tamano: it.tamano,
        creada_en: it.creada_en, extraida_en: it.extraida_en
      }));
    const pendientes = items.filter((i) => i.estado === 'pendiente').length;
    return { status: 200, data: { project_id: pid, items, total: items.length, pendientes, materialCargado: store.materialCargado || null } };
  }

  // =============================================================
  // Proyecciones internas (del plan)
  // =============================================================

  // _ordenar — EL MOTOR DE ORDENACIÓN (2.1). Puntúa cada pieza pendiente con las
  // variables material · urgencia · tamaño · tiempo y devuelve la lista ordenada
  // (mayor score primero). Los pesos y el material cargado se ajustan con el uso.
  _ordenar(store, pendientes) {
    const pesos = store.pesos || this._pesos;
    const cargado = store.materialCargado || null;
    const ahora = Date.now();

    const conScore = pendientes.map((it) => {
      let score = 0;
      // material: coincidir con el cargado evita cambio de filamento → bonus.
      if (cargado && it.material && it.material === cargado) score += pesos.material;
      // urgencia: 1..5, mayor → más score.
      score += (it.urgencia || 1) * pesos.urgencia;
      // tamaño: piezas pequeñas primero (encadenar rápido). 0 (desconocido) → neutro.
      if (it.tamano && it.tamano > 0) score += (1 / it.tamano) * pesos.tamano;
      // tiempo: antigüedad en cola (más espera → más score).
      const edadMs = ahora - new Date(it.creada_en).getTime();
      score += (edadMs / 3600000) * pesos.tiempo;   // horas en cola
      return { item: it, score };
    });

    conScore.sort((a, b) => b.score - a.score);
    return conScore.map(c => c.item);
  }

  // _detectarVacia — (2.4) ¿no hay pendientes?
  _detectarVacia(store) {
    return this._pendientes(store).length === 0;
  }

  // =============================================================
  // Utilidades
  // =============================================================
  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) {
      this.eventBus.publish(evento, { ...data, timestamp: nowISO() });
    }
  }
}

module.exports = ColaImpresionReflejo;
