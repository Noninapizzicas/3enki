/**
 * contabilidad/anclaje-cierre-vertical — CUSTODIO (A14, hoja del plan).
 *
 * Declara POR FUENTE que es un CIERRE y como se identifica; ancla la clave
 * natural del hecho de cierre (la unidad que el cerrojo de idempotencia M3
 * necesita). Su CONTENIDO pende de `unidad_de_cierre` (M4, [ABIERTO], declarable):
 * si la fuente no lo declara, la clave queda incompleta y el hecho va a cola;
 * JAMAS se inventa una unidad de cierre.
 *
 * CUSTODIO (patron real): un unico escritor del store por vertical — _declarar
 * valida rol DUENO en guard; _anclar es proyeccion PURA de lectura (no muta).
 * Persiste por proyecto con PosPersistencia (storage
 * /contabilidad/anclaje-cierre-vertical/*.json), restaura en project.activated y
 * vuelca en onUnload. Emisor/par de fallo. La definicion de cierre por vertical
 * no existe en el inventario: el cierre de caja existente es de la OPERACION
 * (mono-negocio) y aqui llega como HECHO observado.
 *
 * Ver hoja A14 del diseno-oop y bloque `anclaje-cierre-vertical` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la definicion de cierre por vertical.
const ROL_ESCRITOR = 'DUENO';

class AnclajeCierreVertical extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'anclaje-cierre-vertical';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, unidades: { <vertical>: DefinicionCierre } }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'anclaje-cierre-vertical.json',
      dir: '/contabilidad/anclaje-cierre-vertical',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.unidades) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las unidades de cierre del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.anclaje.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.anclaje_declarado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.anclaje.declarar.failed', res);
      }
      return res;
    });
  }

  onAnclarRequest(e) {
    return this._atender(e, 'anclar', 'contabilidad.anclaje.anclar.response', async (d) => {
      const res = this._anclar(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.anclaje.anclar.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-anclaje-cierre-vertical-v1', unidades: {} };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // declarar(rol, vertical, definicion) — un solo escritor (DUENO).
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUENO declara la unidad de cierre', {
        rol_esperado: ROL_ESCRITOR, rol_recibido: rol
      });
    }

    const vertical = input && input.vertical;
    if (!vertical) return this._invalid('vertical');

    const def = input && input.definicion;
    if (!def || typeof def !== 'object') return this._invalid('definicion');

    const d = this._obtenerOCrear(pid);
    d.unidades[vertical] = {
      tipo: def.tipo || null,
      identificador: def.identificador || null,
      unidad_cierre: def.unidad_cierre || null,
      declarado_por: ROL_ESCRITOR,
      declarado_en: new Date().toISOString()
    };
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, vertical, definicion: d.unidades[vertical] } };
  }

  // anclar(vertical, hecho) -> ClaveNatural  (o incompleta → la unidad no se inventa).
  _anclar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const vertical = input && input.vertical;
    if (!vertical) return this._invalid('vertical');
    const hecho = (input && input.hecho) || {};

    const d = this._obtenerOCrear(pid);
    const unidad = d.unidades[vertical];
    if (!unidad) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `la vertical ${vertical} no declara su unidad de cierre`, {
        vertical, senal: 'unidad_de_cierre_no_declarada'
      });
    }

    const campo = unidad.identificador;
    const valor = campo ? hecho[campo] : undefined;
    if (valor === undefined || valor === null || valor === '') {
      // La unidad pende de la fuente: si no la declara, la clave queda incompleta.
      return this._errorResponse(422, 'PRECONDITION_FAILED', 'el hecho no trae el identificador de cierre declarado', {
        vertical, campo_esperado: campo
      });
    }

    const clave = `${vertical}:${unidad.unidad_cierre || unidad.tipo || 'cierre'}:${valor}`;
    return { status: 200, data: { project_id: pid, vertical, clave_natural: clave } };
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolAnclar(params) { return this._anclar(params); }
}

module.exports = AnclajeCierreVertical;
