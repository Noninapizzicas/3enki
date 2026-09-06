/**
 * busqueda-repositorios — CONVERSOR del proyecto 3D (taller personal de impresion 3D).
 *
 * Frontera de formato multi-fuente: unifica la busqueda de modelos 3D en varios
 * repositorios (Printables, MakerWorld, Cults3D, Thingiverse) por query.
 *
 * Contrato (del plan-construccion.md, seccion 6.6):
 *   entrada = query (texto/categoria, pregunta abierta 12) + repositorios opcionales
 *   salida  = [resultados] normalizados a forma canonica (unificados)
 *   garantia = un repositorio caido no rompe la busqueda (se omiten sus resultados);
 *              si todos fallan, vacio + busqueda.buscar.failed (invariante 12)
 *   no hace = no descarga, no importa, no decide; es SOLO frontera de formato
 *
 * FORMA: CONVERSOR — SIN estado, SIN red. El puerto es 'buscar(query) → [resultados]'.
 * Los adaptadores concretos (APIs de repositorios) se cablean en el puente, no aqui:
 * se inyectan como { nombre, buscar(query) → Promise<[resultado_crudo]> }.
 * La logica de negocio (unificar, omitir caidos, vacio si todos fallan) vive DENTRO
 * del modulo como proyeccion _op; _shared/ SOLO infraestructura.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// Repositorios soportados por defecto (el puente cablea los adaptadores reales).
const REPOSITORIOS_DEFECTO = ['printables', 'makerworld', 'cults3d', 'thingiverse'];

class BusquedaRepositoriosReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'busqueda-repositorios';
    this.version = 'reflejo-0.1.0';
    // Adaptadores inyectados: Map<nombre, { buscar(query) → Promise<[crudo]> }>.
    // El puente los cablea; aqui solo se consumen. Sin adaptador → repositorio caido.
    this._adaptadores = new Map();
  }

  // ── Handlers RPC (una linea cada uno, delegan a _atender) ──
  onBuscarRequest(e) {
    return this._atender(e, 'buscar', 'busqueda.buscar.response', d => this._buscar(d));
  }

  // ── Inyeccion de adaptadores (la hace el puente, no la logica) ──
  registrarAdaptador(nombre, adaptador) {
    if (nombre && adaptador && typeof adaptador.buscar === 'function') {
      this._adaptadores.set(nombre, adaptador);
    }
  }

  // ── Proyeccion determinista: buscar(query) → [resultados] ──
  async _buscar(input) {
    const query = (input && input.query) || '';
    const pid = (input && input.project_id) || null;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      this._publicarEvento('busqueda.buscar.failed', { project_id: pid, query, motivo: 'query_vacia' });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'query requerida (no vacia)' } };
    }

    // Repositorios a consultar: los pedidos o todos los soportados.
    const pedidos = (input && Array.isArray(input.repositorios) && input.repositorios.length)
      ? input.repositorios
      : REPOSITORIOS_DEFECTO;

    const consultados = [];
    const caidos = [];
    const crudos = [];

    for (const nombre of pedidos) {
      const adaptador = this._adaptadores.get(nombre);
      if (!adaptador) {
        // Sin adaptador cableado → repositorio caido (no rompe la busqueda).
        caidos.push(nombre);
        continue;
      }
      consultados.push(nombre);
      try {
        const res = await adaptador.buscar(query.trim());
        if (Array.isArray(res)) crudos.push(...res.map(r => ({ repositorio: nombre, ...r })));
      } catch (_) {
        // Repositorio caido: se omite, no rompe la busqueda (invariante 12).
        caidos.push(nombre);
      }
    }

    // Unificar a forma canonica (7.1) y deduplicar por (repositorio, id).
    const resultados = this._unificar(crudos);

    // Si todos los repositorios cayeron (o ninguno respondio) → vacio + failed.
    const todosCayeron = (consultados.length === 0) || (caidos.length === consultados.length);
    if (resultados.length === 0 && caidos.length > 0 && todosCayeron) {
      this._publicarEvento('busqueda.buscar.failed', {
        project_id: pid, query: query.trim(), motivo: 'todos_los_repositorios_caidos', repositorios_caidos: caidos
      });
    }

    return {
      status: 200,
      data: {
        query: query.trim(),
        resultados,
        total: resultados.length,
        repositorios_consultados: consultados,
        repositorios_caidos: caidos
      }
    };
  }

  // 7.1 _unificar — normaliza resultados crudos a forma canonica y deduplica.
  _unificar(crudos) {
    const vistos = new Set();
    const out = [];
    for (const c of crudos) {
      const id = c.id || c.url || `${c.repositorio}:${c.titulo || ''}`;
      const clave = `${c.repositorio}::${id}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      out.push({
        repositorio: c.repositorio,
        id: c.id || null,
        titulo: c.titulo || 'desconocido',
        url: c.url || null,
        autor: c.autor || 'desconocido',
        licencia: c.licencia || 'desconocido',
        descargas: c.descargas != null ? c.descargas : null,
        valoracion: c.valoracion != null ? c.valoracion : null
      });
    }
    return out;
  }

  // ── Utilidades ──
  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) {
      this.eventBus.publish(evento, { ...data, timestamp: new Date().toISOString() });
    }
  }
}

module.exports = BusquedaRepositoriosReflejo;
