/**
 * contabilidad-analitica/cola-declaraciones-criterio — CUSTODIO CON PERSISTENCIA (K9, hoja del plan).
 *
 * UNA SOLA COLA donde el JEFE fija y ratifica TODOS los criterios. Cierra
 * declarativamente B1/B7 · C7 · E6 · F5 · J6 · D11 · I5 — un unico punto de
 * declaracion para todo el sistema: `unidad_de_cierre`, `periodo`, `amortizacion`,
 * `reparto`, `dimensiones`, `tipos`, `consolidacion`.
 *
 * Invariante 13 (el minimo/criterio se DECLARA, no se estima): el sistema PREGUNTA;
 * no decide. Un criterio sin valor declarado NO se rellena con un default: queda
 * `[ABIERTO]`, con su valor en null y su estado declarado. La cola recoge lo abierto
 * para que el JEFE lo declare.
 *
 * UN SOLO ESCRITOR de la parcela: el JEFE (rol JEFE_CRITERIO) fija y ratifica;
 * cualquier otro rol es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - Nada se estima: valor ausente → estado ABIERTO (no un valor por defecto).
 *  - No se borra: re-fijar un criterio APPENDEA a su historial; el valor vigente
 *    queda declarado con su fecha y su autor. Jamas se sobrescribe en silencio.
 *  - Ratificar es un acto del JEFE sobre un criterio YA declarado; sobre un criterio
 *    abierto no se inventa una ratificacion (se declara que sigue abierto).
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja K9 del plan-construccion y diseno-oop.md (CLASE ColaDeclaracionesCriterio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la cola: solo el JEFE fija/ratifica criterios.
const ROL_ESCRITOR = 'JEFE_CRITERIO';

// Lo que la cola cierra DECLARATIVAMENTE (no se cablea ningun valor: solo la lista).
const CIERRA_DECLARATIVO = 'B1·B7·C7·E6·F5·J6·D11·I5';

// Criterios [ABIERTO] conocidos que la cola recoge para que el JEFE los declare.
// (Dato del diseno; el contenido/valor de cada uno es ParametroDeclarable del jefe.)
const CRITERIOS_CONOCIDOS = [
  'unidad_de_cierre',
  'periodo',
  'amortizacion',
  'reparto',
  'dimensiones',
  'tipos',
  'consolidacion'
];

class ColaDeclaracionesCriterio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola-declaraciones-criterio';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, criterios: Map<clave, Criterio> }
    this._colas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cola-declaraciones-criterio.json',
      dir: '/contabilidad/cola-declaraciones-criterio',
      snapshot: (pid) => {
        const c = this._colas.get(pid);
        if (!c) return null;
        return { project_id: pid, esquema: c.esquema, criterios: [...c.criterios.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const criterios = new Map();
        for (const cr of (data.criterios || [])) {
          if (cr && cr.clave != null) criterios.set(String(cr.clave), cr);
        }
        this._colas.set(pid, { esquema: data.esquema || 'contabilidad-cola-declaraciones-criterio-v1', criterios });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la cola de criterios del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onFijarRequest(e) {
    return this._atender(e, 'fijar', 'cola-declaraciones-criterio.fijar.response', async (d) => {
      const res = this._fijar(d);
      if (res.status !== 200) this.eventBus?.publish('cola-declaraciones-criterio.fijar.failed', res);
      return res;
    });
  }

  onRatificarRequest(e) {
    return this._atender(e, 'ratificar', 'cola-declaraciones-criterio.ratificar.response', async (d) => {
      const res = this._ratificar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: un criterio quedo ratificado por el JEFE.
        this.eventBus?.publish('contabilidad.criterio_ratificado', {
          project_id: res.data.project_id,
          criterio: res.data.criterio,
          clave: res.data.criterio.clave,
          valor: res.data.criterio.valor,
          ratificado: res.data.ratificado,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('cola-declaraciones-criterio.ratificar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor): el JEFE fija un criterio ──
  _fijar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el JEFE declara criterios.
    const guard = this._guardEscritor(input.rol);
    if (guard) return guard;

    const clave = input.clave != null ? String(input.clave).trim() : '';
    if (!clave) return this._invalid('clave');

    // El valor es ParametroDeclarable. Ausente/vacio NO se estima: queda [ABIERTO].
    const tieneValor = input.valor !== undefined && input.valor !== null
      && !(typeof input.valor === 'string' && input.valor.trim() === '');

    const cola = this._obtenerOCrear(pid);
    const existente = cola.criterios.get(clave) || null;
    const ahora = new Date().toISOString();

    const criterio = existente || {
      clave,
      cierra: CRITERIOS_CONOCIDOS.includes(clave) ? CIERRA_DECLARATIVO : null,
      conocido: CRITERIOS_CONOCIDOS.includes(clave),
      valor: null,
      estado: 'ABIERTO',
      fijado_por: null,
      fijado_en: null,
      ratificado_en: null,
      historial: []
    };

    if (tieneValor) {
      criterio.valor = input.valor;
      criterio.estado = 'DECLARADO';
      criterio.fijado_por = ROL_ESCRITOR;
      criterio.fijado_en = ahora;
      // Re-fijar (cambiar el valor) NO borra: se apila en el historial.
      criterio.ratificado_en = null;
    } else {
      // El sistema pregunta y el JEFE aun no ha declarado: sigue [ABIERTO].
      criterio.valor = null;
      criterio.estado = 'ABIERTO';
      criterio.fijado_en = criterio.fijado_en || ahora;
    }
    criterio.historial = Array.isArray(criterio.historial) ? criterio.historial : [];
    criterio.historial.push({
      estado: criterio.estado,
      valor: criterio.valor,
      por: ROL_ESCRITOR,
      en: ahora
    });

    cola.criterios.set(clave, criterio);
    cola.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        criterio,
        fijado: true,
        abierto: criterio.estado === 'ABIERTO'
      }
    };
  }

  // ── proyeccion de ratificacion (acto del JEFE sobre lo ya declarado) ──
  _ratificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._guardEscritor(input.rol);
    if (guard) return guard;

    const clave = input.clave != null ? String(input.clave).trim() : '';
    if (!clave) return this._invalid('clave');

    const cola = this._obtenerOCrear(pid);
    const criterio = cola.criterios.get(clave) || null;

    // Criterio no registrado ni declarado: NO se inventa una ratificacion.
    if (!criterio) {
      return {
        status: 200,
        data: {
          project_id: pid,
          criterio: { clave, cierra: CRITERIOS_CONOCIDOS.includes(clave) ? CIERRA_DECLARATIVO : null, conocido: CRITERIOS_CONOCIDOS.includes(clave), valor: null, estado: 'ABIERTO' },
          ratificado: false,
          abierto: true,
          motivo: 'el criterio no esta registrado ni declarado en la cola'
        }
      };
    }

    // Criterio [ABIERTO]: el JEFE aun no lo declaro — no hay nada que ratificar.
    if (criterio.estado === 'ABIERTO') {
      return {
        status: 200,
        data: {
          project_id: pid,
          criterio,
          ratificado: false,
          abierto: true,
          motivo: 'el criterio sigue [ABIERTO]: el JEFE aun no lo declaro'
        }
      };
    }

    // Ya ratificado: idempotente (no se re-escribe ni se pierde el historial).
    const ya_estaba = criterio.estado === 'RATIFICADO';
    if (!ya_estaba) {
      const ahora = new Date().toISOString();
      criterio.estado = 'RATIFICADO';
      criterio.ratificado_en = ahora;
      criterio.historial = Array.isArray(criterio.historial) ? criterio.historial : [];
      criterio.historial.push({ estado: 'RATIFICADO', valor: criterio.valor, por: ROL_ESCRITOR, en: ahora });
      cola.updated_at = ahora;
      this._persist.marcarDirty(pid);
    }

    return {
      status: 200,
      data: { project_id: pid, criterio, ratificado: true, ya_estaba, abierto: false }
    };
  }

  // GUARD de un solo escritor: el segundo escritor NO espera ni hace cola.
  _guardEscritor(rol) {
    if (rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el JEFE (JEFE_CRITERIO) fija y ratifica criterios en la cola',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: rol ?? null });
    }
    return null;
  }

  _obtenerOCrear(pid) {
    let c = this._colas.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-cola-declaraciones-criterio-v1', criterios: new Map() };
      this._colas.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Lectura directa de la cola (mismo proceso) — no muta.
  criteriosDe(pid) {
    const c = pid ? this._colas.get(pid) : null;
    return c ? [...c.criterios.values()] : [];
  }

  // Los criterios aun [ABIERTO] — lo que el sistema pregunta y el JEFE no declaro.
  abiertosDe(pid) {
    return this.criteriosDe(pid).filter(c => c.estado === 'ABIERTO');
  }

  // ── Tools ──
  toolFijar(params) { return this._fijar(params); }
  toolRatificar(params) { return this._ratificar(params); }
}

module.exports = ColaDeclaracionesCriterio;
