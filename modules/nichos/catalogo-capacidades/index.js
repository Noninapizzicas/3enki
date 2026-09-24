/**
 * nichos/catalogo-capacidades — CUSTODIO CON PERSISTENCIA (D3, hoja del plan).
 *
 * Catalogo persistente por PROYECTO de las CAPACIDADES (tanto existentes como
 * faltantes) para construir la SOLUCION del nicho. Invariante D3: "lo que falta,
 * se crea" — jamas deja un hueco muerto. El ensamblador-solucion (D1) consulta
 * (_consultar -> CapacidadesDisponibles) y, cuando detecta que falta algo, el
 * custodio lo registra como FALTANTE declarado (nichos.capacidad.faltante_declarado)
 * para que el paso de construccion lo materialice.
 *
 * CUSTODIO (patrón real de /perfil-limite-busqueda y /criterio-viabilidad): un solo
 * escritor — el CONSTRUCTOR (ensamblador) o el DUEÑO via el guard de rol en
 * _declararFaltante. La lectura (_consultar) no muta. La escritura (_declararFaltante)
 * valida, normaliza y garantiza la invariante (crea la capacidad faltante si no
 * existia). Persiste por proyecto con PosPersistencia (storage
 * /prisma/nichos/catalogo-capacidades.json), restaura en project.activated y
 * vuelca en onUnload. Emisor/par de fallo en errores.
 *
 * Ver hoja D3 del plan-construccion y arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Roles autorizados a ESCRIBIR el catalogo (single-writer: el ensamblador de la
// solucion D1 y el DUEÑO; los demas solo leen).
const ROLES_ESCRITOR = new Set(['CONSTRUCTOR', 'DUEÑO']);

// Shape base del catalogo por proyecto.
function catalogoVacio() {
  return {
    esquema: 'nichos-capacidades-v1',
    capacidades: [],   // [{ nombre, estado: 'existente'|'faltante', descripcion, creado_para, updated_at }]
    updated_at: null,
    declarado_por: null
  };
}

const ESTADOS = new Set(['existente', 'faltante']);

// Normaliza un nombre de capacidad (string no vacio).
function strNoVacio(v) {
  return (typeof v === 'string' && v.trim().length > 0) ? v.trim() : null;
}

class CatalogoCapacidades extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'catalogo-capacidades';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> catalogo (un solo estado por proyecto)
    this._catalogos = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'catalogo-capacidades.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const c = this._catalogos.get(pid);
        return c ? { project_id: pid, catalogo: c } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.catalogo) this._catalogos.set(pid, data.catalogo);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el catalogo del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender / fire-and-forget) ──
  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.capacidad.consultar.response', d => this._consultar(d));
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'nichos.capacidad.declarar.response', async (d) => {
      const res = await this._declararFaltante(d);
      // Emisor/par de fallo: exito → dominio (invariante: se crea lo que falta); fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.capacidad.faltante_declarado', {
          project_id: res.data.project_id,
          capacidad: res.data.capacidad,
          catalogo: res.data.catalogo,
          creado: res.data.creado,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.capacidad.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyección de lectura (NO muta) ──
  _obtenerOCrear(pid) {
    let c = this._catalogos.get(pid);
    if (!c) {
      c = catalogoVacio();
      this._catalogos.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  _consultar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const c = this._obtenerOCrear(pid);
    const nicho = (input && input.nicho) || null;
    return {
      status: 200,
      data: {
        project_id: pid,
        nicho,
        capacidades_disponibles: c.capacidades.filter(x => x.estado === 'existente'),
        capacidades_faltantes: c.capacidades.filter(x => x.estado === 'faltante'),
        capacidades: c.capacidades,
        cantidad: c.capacidades.length
      }
    };
  }

  // Alias semantico para ensamblador (D1).
  consultarDisponibles(pid, nicho) {
    return this._consultar({ project_id: pid, nicho });
  }

  // ── proyección de escritura (un solo escritor; INVARIANTE: lo que falta se crea) ──
  _declararFaltante(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo CONSTRUCTOR (ensamblador D1) o DUEÑO.
    if (!ROLES_ESCRITOR.has(input.rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el CONSTRUCTOR o el DUEÑO pueden declarar capacidades', {
        rol_esperado: [...ROLES_ESCRITOR].join('|'), rol_recibido: input.rol
      });
    }

    const nombre = strNoVacio(input.capacidad) || strNoVacio(input.nombre);
    if (!nombre) return this._invalid('capacidad');

    const c = this._obtenerOCrear(pid);
    const estado = input.estado && ESTADOS.has(input.estado) ? input.estado : 'faltante';

    // Busca si la capacidad ya estaba registrada (cualquier estado).
    const existente = c.capacidades.find(x => x.nombre === nombre);
    let creado = false;
    if (existente) {
      // INVARIANTE: si estaba como faltante y ahora se declara existente (o viceversa),
      // solo se actualiza el estado/descripcion, no se crea un duplicado.
      existente.estado = estado;
      existente.updated_at = new Date().toISOString();
      if (input.descripcion) existente.descripcion = String(input.descripcion).trim();
    } else {
      // INVARIANTE CORE: lo que falta, se crea — jamas deja un hueco muerto.
      c.capacidades.push({
        nombre,
        estado,
        descripcion: input.descripcion ? String(input.descripcion).trim() : `capacidad declarada para construir la solucion`,
        creado_para: input.nicho ? String(input.nicho).trim() : null,
        updated_at: new Date().toISOString()
      });
      creado = true;
    }

    c.updated_at = new Date().toISOString();
    c.declarado_por = input.rol;
    this._catalogos.set(pid, c);
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, capacidad: c.capacidades.find(x => x.nombre === nombre), catalogo: c, creado }
    };
  }

  // ── Tools ──
  toolConsultar(params) { return this._consultar(params); }
  toolDeclarar(params) { return this._declararFaltante(params); }
}

module.exports = CatalogoCapacidades;
