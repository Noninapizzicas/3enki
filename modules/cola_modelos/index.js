/**
 * cola_modelos — CUSTODIO single-writer de la cola de impresión 3D (PASO 1 del plan-construccion).
 *
 * Contrato: custodia los modelos pendientes de imprimir con su prioridad y estado,
 * aplica la máquina de estados (PENDIENTE→IMPRIMIENDO→IMPRESO) con freno de
 * transición legal (una transición inválida se rechaza SIN mutar), mantiene el
 * singleton 'imprimiendo' (una sola pieza en la máquina a la vez) y ofrece la
 * propuesta determinista (el siguiente por prioridad, desempate por fecha_alta).
 * NO decide el contenido ni imprime: custodia y propone. El motor de propuesta y
 * el orquestador (pasos siguientes del plan F3b) consumen esta cripta por bus.
 *
 * FORMA: REFLEJO + PosPersistencia por proyecto (patrón custodio, gemelo de banco).
 * Store: /impresion-3d/cola/modelos.json (single-writer, fs.write atómico).
 *
 * Invariantes:
 *   - id único → 409 ALREADY_EXISTS.
 *   - singleton 'imprimiendo' → si ya hay una pieza imprimiendo, un nuevo
 *     IMPRIMIENDO se rechaza 409 CONFLICT_STATE.
 *   - transición legal → solo por los arcos permitidos; una transición inválida
 *     se rechaza 409 CONFLICT_STATE SIN mutar el modelo.
 *   - estado inicial siempre 'PENDIENTE'.
 *   - el modelo que está IMPRIMIENDO nunca se propondrá de nuevo (está fuera de
 *     la cola de candidatos a proponer).
 *
 * v0.1.0 (primera pasada del plan-construccion): el esqueleto de la cripta.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

// Máquina de estados: illegal-states-unrepresentable (los terminales no son
// reentrantes; una pieza impresa no vuelve a pendiente).
const ESTADOS = Object.freeze(['PENDIENTE', 'IMPRIMIENDO', 'IMPRESO']);
// Arcos permitidos: PENDIENTE→IMPRIMIENDO→IMPRESO. Una IMPRESO no transiciona más.
const TRANSICIONES = Object.freeze({
  PENDIENTE: ['IMPRIMIENDO'],
  IMPRIMIENDO: ['IMPRESO'],
  IMPRESO: []
});

const nowISO = () => new Date().toISOString();
const _key = (pid, id) => `${pid}:${id}`;

class ColaModelosReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola_modelos';
    this.version = 'reflejo-0.1.0';
    this.modelos = new Map();    // `${project_id}:${id}` → modelo
    this.historico = new Map();  // `${project_id}:${id}` → modelo impreso (p7)

    this._persist = new PosPersistencia({
      modulo: this, file: 'modelos.json', dir: '/impresion-3d/cola',
      snapshot: (pid) => {
        const suyos = (m) => [...m.values()].filter(ml => ml.project_id === pid);
        return { project_id: pid, modelos: suyos(this.modelos), historico: suyos(this.historico) };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        for (const ml of (data.modelos || [])) this.modelos.set(_key(pid, ml.id), ml);
        for (const ml of (data.historico || [])) this.historico.set(_key(pid, ml.id), ml);
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onAgregarRequest(e)           { return this._atender(e, 'agregar', 'cola_modelos.agregar.response', d => this._agregar(d)); }
  onObtenerPorPrioridadRequest(e) { return this._atender(e, 'obtener_por_prioridad', 'cola_modelos.obtener_por_prioridad.response', d => this._obtenerPorPrioridad(d)); }
  onActualizarEstadoRequest(e)  { return this._atender(e, 'actualizar_estado', 'cola_modelos.actualizar_estado.response', d => this._actualizarEstado(d)); }
  onListarRequest(e)            { return this._atender(e, 'listar', 'cola_modelos.listar.response', d => this._listar(d)); }

  // ── PROYECCIONES (dominio) ──

  // _agregar: crea uno o varios modelos en estado PENDIENTE. Acepta un modelo
  // directo {nombre, prioridad, material?, tiempo_estimado?, origen?, fuente?}
  // o un array modelos. Dedup por id (generado dentro) y por (origen, ref) si vienen.
  async _agregar(input) {
    if (!input.project_id) return this._invalid('project_id');

    const entrantes = Array.isArray(input.modelos) && input.modelos.length
      ? input.modelos
      : (input.nombre ? [input] : null);
    if (!entrantes) return this._errorResponse(400, 'INVALID_INPUT', 'se requieren un modelo {nombre,prioridad} o un array modelos', {});

    const doc = await this._cargar(input.project_id);
    const nuevos = [];
    const duplicados = [];

    for (const s of entrantes) {
      if (!s.nombre || typeof s.prioridad !== 'number') {
        duplicados.push({ motivo: 'forma_incompleta', modelo: s });
        continue;
      }

      // Dedupe por (origen, ref) si ambos presentes (mismo archivo/URL ya en cola).
      if (s.origen && s.ref) {
        const dupe = [...doc.modelos.values()].find(m => m.origen === s.origen && m.ref === s.ref);
        if (dupe) { duplicados.push({ motivo: 'duplicado', id: dupe.id }); continue; }
      }

      const id = `mod_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
      const modelo = {
        id, project_id: input.project_id,
        nombre: String(s.nombre),
        prioridad: s.prioridad,
        material: s.material ? String(s.material) : null,
        tiempo_estimado: s.tiempo_estimado ? Number(s.tiempo_estimado) : null,
        origen: s.origen ? String(s.origen) : null,
        ref: s.ref ? String(s.ref) : null,
        fecha_alta: s.fecha_alta || nowISO(),
        estado: 'PENDIENTE',
        historial: [{ estado: 'PENDIENTE', en: nowISO() }]
      };
      doc.modelos.set(_key(input.project_id, id), modelo);
      nuevos.push(modelo);
    }

    await this._guardar(input.project_id, doc);

    for (const m of nuevos) this._publicarEvento('cola_modelos.modelo_agregado', { project_id: input.project_id, modelo: m });

    return { status: 201, data: { añadidos: nuevos, duplicados } };
  }

  // _obtenerPorPrioridad: propuesta determinista — el modelo de mayor prioridad
  // (número más alto) en estado PENDIENTE, desempate por fecha_alta más antigua.
  // Excluye IMPRIMIENDO (el singleton) e IMPRESO. Si todo está impreso/pendiente
  // vacío → 404 RESOURCE_NOT_FOUND 'cola_vacia' (respuesta canónica: hay respuesta
  // siempre, nunca silencio).
  async _obtenerPorPrioridad(input) {
    if (!input.project_id) return this._invalid('project_id');

    const doc = await this._cargar(input.project_id);
    const candidatos = [...doc.modelos.values()].filter(m => m.estado === 'PENDIENTE');
    if (!candidatos.length) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'cola_vacia', { message: 'no hay modelos pendientes para proponer' });
    }

    candidatos.sort((a, b) => {
      if (b.prioridad !== a.prioridad) return b.prioridad - a.prioridad;
      return a.fecha_alta < b.fecha_alta ? -1 : 1;   // desempate: el más antiguo primero
    });

    return { status: 200, data: { modelo: candidatos[0], candidatos: candidatos.length } };
  }

  // _actualizarEstado: transición legal con freno. Valida que el arco existe
  // (PENDIENTE→IMPRIMIENDO→IMPRESO). Una transición inválida se rechaza 409 SIN
  // mutar el modelo. Aplicar IMPRIMIENDO respeta el singleton 'imprimiendo'.
  async _actualizarEstado(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');
    if (!input.estado) return this._invalid('estado');

    const doc = await this._cargar(input.project_id);
    const ml = doc.modelos.get(_key(input.project_id, input.id));
    if (!ml) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'modelo_no_encontrado', { id: input.id });

    // 1) Arco legal (sin mutar en caso de error).
    if (ml.estado === input.estado) {
      return this._errorResponse(409, 'CONFLICT_STATE', 'transicion_invalida', { id: input.id, desde: ml.estado, hacia: input.estado, detalle: 'estado identico' });
    }
    if (!ESTADOS.includes(input.estado)) return this._invalid('estado');
    if (!TRANSICIONES[ml.estado] || !TRANSICIONES[ml.estado].includes(input.estado)) {
      return this._errorResponse(409, 'CONFLICT_STATE', 'transicion_invalida', { id: input.id, desde: ml.estado, hacia: input.estado });
    }

    // 2) Singleton 'imprimiendo': no puede haber dos IMPRIMIENDO a la vez.
    if (input.estado === 'IMPRIMIENDO') {
      const enMaquina = [...doc.modelos.values()].find(m => m.estado === 'IMPRIMIENDO' && m.id !== input.id);
      if (enMaquina) {
        return this._errorResponse(409, 'CONFLICT_STATE', 'ya_hay_una_pieza_imprimiendo', { id: input.id, enMaquina: enMaquina.id });
      }
    }

    ml.estado = input.estado;
    ml[`${input.estado.toLowerCase()}_en`] = nowISO();
    ml.historial.push({ estado: input.estado, en: nowISO(), motivo: input.motivo || null });
    await this._guardar(input.project_id, doc);

    // IMPRESO es terminal → pasa a histórico y sale de la cola viva.
    if (input.estado === 'IMPRESO') {
      doc.modelos.delete(_key(input.project_id, ml.id));
      doc.historico.set(_key(input.project_id, ml.id), ml);
      await this._guardar(input.project_id, doc);
      this._publicarEvento('cola_modelos.modelo_impreso', { project_id: input.project_id, modelo: ml });
    } else if (input.estado === 'IMPRIMIENDO') {
      this._publicarEvento('cola_modelos.modelo_imprimiendo', { project_id: input.project_id, modelo: ml });
    }

    return { status: 200, data: { modelo: ml } };
  }

  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');

    const doc = await this._cargar(input.project_id);
    let lista = [...doc.modelos.values()].filter(m => m.project_id === input.project_id);
    if (input.estado) {
      if (!ESTADOS.includes(input.estado)) return this._invalid('estado');
      lista = lista.filter(m => m.estado === input.estado);
    }
    lista.sort((a, b) => (a.prioridad !== b.prioridad ? b.prioridad - a.prioridad : (a.fecha_alta < b.fecha_alta ? -1 : 1)));
    return { status: 200, data: { modelos: lista, total: lista.length } };
  }

  // ── store (single-writer, por proyecto) ──
  async _cargar(project_id) {
    const doc = {
      modelos: new Map([...this.modelos].filter(([k]) => k.startsWith(`${project_id}:`))),
      historico: new Map([...this.historico].filter(([k]) => k.startsWith(`${project_id}:`)))
    };
    return doc;
  }

  async _guardar(project_id, doc) {
    // Reemplazo completo por proyecto (incluye el delete de IMPRESO → histórico).
    for (const k of [...this.modelos.keys()]) if (k.startsWith(`${project_id}:`)) this.modelos.delete(k);
    for (const k of [...this.historico.keys()]) if (k.startsWith(`${project_id}:`)) this.historico.delete(k);
    for (const m of doc.modelos.values()) this.modelos.set(_key(project_id, m.id), m);
    for (const m of doc.historico.values()) this.historico.set(_key(project_id, m.id), m);
    this._persist.marcarDirty(project_id);
  }
}

module.exports = ColaModelosReflejo;
