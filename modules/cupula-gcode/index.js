/**
 * cupula-gcode — CUSTODIO single-writer de la cúpula de archivos preparados (pieza 4).
 *
 * Almacén de la MONEDA real del taller lista para imprimir: ArchivoPreparado
 * { ruta, perfil, gramos_est, tiempo_est, listo } en STL/3MF (origen) + GCODE
 * (preparado). Los 3 formatos conviven — NUNCA solo .3mf (ley de la moneda). Único
 * escritor del store por proyecto (PosPersistencia).
 *
 * Funciona como caché: un modelo ya preparado (gcode listo) NO se vuelve a preparar;
 * la cola encadena desde aquí (_reserva alimenta la próxima tanda lista sin re-slicear).
 *
 * Operaciones del plano (plan-construccion.md 6.4): _registrar (emite archivo.preparado),
 * _marcarConsumido, _listosParaImprimir, _reserva, _obtener.
 *
 * CERO juicio: no decide qué pieza imprimir (eso vive en el dueño/cola); solo guarda y
 * sirve la preparación. La decisión de preparar más sigue siendo humana.
 *
 * v0.1.0: FASE 4 TANDA 2.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const FORMATOS = Object.freeze(['STL', '3MF', 'GCODE']);
const nowISO = () => new Date().toISOString();
const _key = (pid, id) => `${pid}:${id}`;

class CupulaGcodeReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cupula-gcode';
    this.version = 'reflejo-0.1.0';
    this.archivos = new Map(); // `${project_id}:${id}` → ArchivoPreparado

    this._persist = new PosPersistencia({
      modulo: this, file: 'cupula-gcode.json', dir: '/3d/cupula-gcode',
      snapshot: (pid) => ({
        project_id: pid,
        archivos: [...this.archivos.values()].filter(a => a.project_id === pid)
      }),
      hidratar: (pid, data) => {
        if (!data) return;
        for (const a of (data.archivos || [])) {
          this.archivos.set(_key(pid, a.id), a);
        }
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onRegistrarRequest(e)      { return this._atender(e, 'registrar', 'cupula-gcode.registrar.response', d => this._registrar(d)); }
  onMarcarConsumidoRequest(e){ return this._atender(e, 'marcar_consumido', 'cupula-gcode.marcar_consumido.response', d => this._marcarConsumido(d)); }
  onListosRequest(e)         { return this._atender(e, 'listos', 'cupula-gcode.listos.response', d => this._listosParaImprimir(d)); }
  onReservaRequest(e)        { return this._atender(e, 'reserva', 'cupula-gcode.reserva.response', d => this._reserva(d)); }
  onObtenerRequest(e)        { return this._atender(e, 'obtener', 'cupula-gcode.obtener.response', d => this._obtener(d)); }

  // ── PROYECCIONES (dominio) ──

  // _registrar: alta de un ArchivoPreparado. Si ya existe para el mismo (modelo, formato,
  // listo) → RECONCILIA (merge de rutas/formatos) en vez de duplicar, y no re-emite. Los 3
  // formatos conviven: puede llegar solo el gcode listo, o el STL/3MF origen, o ambos.
  async _registrar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.archivo && !input.ruta && !input.gcode) return this._invalid('archivo');

    const formato = input.formato ? String(input.formato).toUpperCase() : this._formatoDe(input.archivo || input.gcode || input.ruta);
    if (!FORMATOS.includes(formato)) {
      this._failed('registrar', input, 'formato_no_soportado', { formato });
      return this._errorResponse(422, 'FORMATO_NO_SOPORTADO', `formato no soportado: ${input.archivo || input.gcode}`, { formato });
    }

    const id = input.id || `arc_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const modeloId = input.modelo_id || input.modeloId || input.modelo || null;
    const existente = this._findPorModeloFormato(input.project_id, modeloId, formato, input.listo !== false);

    if (existente) {
      // reconciliar: añade rutas/formatos nuevos si aporta algo distinto
      const actualizado = this._mergeArchivo(existente, input);
      this.archivos.set(_key(input.project_id, existente.id), actualizado);
      this._persist.marcarDirty(input.project_id);
      return { status: 200, data: { archivo: actualizado, reconciliado: true } };
    }

    const archivo = {
      id, project_id: input.project_id, modelo_id: modeloId,
      formato,                          // qué lista para imprimir: STL | 3MF | GCODE
      archivo_stl: input.formato === 'STL' ? String(input.archivo || input.ruta) : null,
      archivo_3mf: input.formato === '3MF' ? String(input.archivo || input.ruta) : null,
      archivo_gcode: (formato === 'GCODE') ? String(input.archivo || input.gcode || input.ruta) : null,
      perfil: input.perfil || 'desconocido',
      gramos_est: input.gramos_est != null ? Number(input.gramos_est) : null,      // valor nominal de la preparación
      tiempo_est: input.tiempo_est != null ? Number(input.tiempo_est) : null,      // no es medición; la medición vive en historial
      listo: input.listo === true || formato === 'GCODE',
      consumido: false,
      preparado_en: nowISO()
    };
    this.archivos.set(_key(input.project_id, id), archivo);
    this._persist.marcarDirty(input.project_id);

    if (archivo.listo) {
      this._publicarEvento('archivo.preparado', {
        archivo_id: id, project_id: input.project_id, modelo_id: archivo.modelo_id,
        formato: archivo.formato, perfil: archivo.perfil,
        correlation_id: input.correlation_id, timestamp: nowISO()
      });
    }
    return { status: 201, data: { archivo, reconciliado: false } };
  }

  // _marcarConsumido: retira un archivo listo de la reserva tras la impresión.
  async _marcarConsumido(input) {
    if (!input.project_id || (!input.archivo_id && !input.id)) {
      return this._invalid(input.project_id ? 'archivo_id' : 'project_id');
    }
    const id = input.archivo_id || input.id;
    const key = _key(input.project_id, id);
    const archivo = this.archivos.get(key);
    if (!archivo) {
      this._failed('marcar_consumido', input, 'archivo_no_encontrado', { archivo_id: id });
      return this._errorResponse(404, 'NOT_FOUND', `archivo no encontrado: ${id}`, { archivo_id: id });
    }
    const actualizado = { ...archivo, consumido: true, consumido_en: nowISO() };
    this.archivos.set(key, actualizado);
    this._persist.marcarDirty(input.project_id);
    return { status: 200, data: { archivo: actualizado } };
  }

  // _listosParaImprimir: solo los archivos listos (gcode listo) y no consumidos.
  async _listosParaImprimir(input) {
    if (!input.project_id) return this._invalid('project_id');
    const de = [...this.archivos.values()]
      .filter(a => a.project_id === input.project_id && a.listo === true && !a.consumido)
      .sort((a, b) => (a.preparado_en < b.preparado_en ? -1 : a.preparado_en > b.preparado_en ? 1 : 0));
    return { status: 200, data: { archivos: de, total: de.length } };
  }

  // _reserva: próxima tanda lista para la cola. CACHÉ: si un modelo ya está preparado
  // (listo), se reutiliza sin re-slicear. No decide qué imprimir — solo devuelve los
  // listos pendientes (opcionalmente filtrados por n / excluyendo ids ya encolados).
  async _reserva(input) {
    if (!input.project_id) return this._invalid('project_id');
    const excluir = new Set(input.excluir_ids || input.ya_encolados || []);
    let de = [...this.archivos.values()]
      .filter(a => a.project_id === input.project_id && a.listo === true && !a.consumido && !excluir.has(a.id))
      .sort((a, b) => (a.preparado_en < b.preparado_en ? -1 : a.preparado_en > b.preparado_en ? 1 : 0));
    if (input.n != null) de = de.slice(0, Number(input.n));
    return { status: 200, data: { reserva: de, total: de.length } };
  }

  // _obtener: un archivo por id.
  async _obtener(input) {
    if (!input.project_id || (!input.archivo_id && !input.id)) {
      return this._invalid(input.project_id ? 'archivo_id' : 'project_id');
    }
    const id = input.archivo_id || input.id;
    const a = this.archivos.get(_key(input.project_id, id));
    if (!a) return this._errorResponse(404, 'NOT_FOUND', `archivo no encontrado: ${id}`, { archivo_id: id });
    return { status: 200, data: { archivo: { ...a } } };
  }

  // helpers internos (lógica de negocio DENTRO del módulo)
  _formatoDe(archivo) {
    const u = String(archivo || '').toLowerCase();
    if (u.endsWith('.stl')) return 'STL';
    if (u.endsWith('.3mf')) return '3MF';
    if (u.endsWith('.gcode') || u.endsWith('.g') || u.endsWith('.gco')) return 'GCODE';
    return 'DESCONOCIDO';
  }

  _findPorModeloFormato(pid, modeloId, formato, listo) {
    if (!modeloId) return null;
    const key = `${pid}:`;
    for (const a of this.archivos.values()) {
      if (!(a.project_id === pid)) continue;
      if (a.modelo_id === modeloId && a.formato === formato && a.listo === listo) return a;
    }
    return null;
  }

  _mergeArchivo(existente, input) {
    const cambios = {};
    const val = input.archivo || input.gcode || input.ruta;
    if (input.formato === 'STL' && val) cambios.archivo_stl = String(val);
    if (input.formato === '3MF' && val) cambios.archivo_3mf = String(val);
    if (input.formato === 'GCODE' && val) cambios.archivo_gcode = String(val);
    if (input.listo === true) cambios.listo = true;
    if (input.perfil) cambios.perfil = String(input.perfil);
    if (input.gramos_est != null) cambios.gramos_est = Number(input.gramos_est);
    if (input.tiempo_est != null) cambios.tiempo_est = Number(input.tiempo_est);
    return { ...existente, ...cambios, actualizado_en: nowISO() };
  }

  _failed(op, input, motivo, extra) {
    this._publicarEvento(`cupula-gcode.${op}.failed`, {
      project_id: input.project_id, motivo, ...extra,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = CupulaGcodeReflejo;
