/**
 * contabilidad/single-writer — CUSTODIO (M2, hoja del plan).
 *
 * CERROJO 2 · la LEY que gobierna a TODO custodio: un unico ESCRITOR por
 * parcela. Los custodios registran su parcela y su rol autorizado; a partir de
 * ahi, cualquier intento de escritura con OTRO rol se rechaza de forma
 * determinista (ERROR_DOS_ESCRITORES). Dos escritores sobre la misma parcela =
 * corrupcion esperando turno (invariante 8 del dominio).
 *
 * CUSTODIO (patron real, distinto del reflejo stateless): un unico escritor de
 * la LEY — el DUENO declara el registro de parcelas en guard; _autorizar es
 * proyeccion PURA de guard (no muta) y _escribir es el guard de escritura que
 * todo custodio invoca antes de tocar su parcela. Persiste por proyecto con
 * PosPersistencia (storage /contabilidad/single-writer/*.json), restaura en
 * project.activated y vuelca en onUnload. Emisor/par de fallo: exito publica
 * contabilidad.parcela_registrada / contabilidad.parcela_autorizada; error su
 * par determinista. NO REUTILIZA: el guard de escritor por parcela es la
 * invariante transversal del dominio; no existe modulo que lo gobierne.
 *
 * Ver hoja M2 del diseno-oop y bloque `single-writer` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico que DECLARA la ley (el registro de parcelas). Los custodios la cumplen.
const ROL_LEY = 'DUENO';

// Codigo simbolico determinista del cerrojo (nombre de la clase M2).
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';

class SingleWriter extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'single-writer';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, parcelas: { <parcela>: { rol_autorizado } } }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'single-writer.json',
      dir: '/contabilidad/single-writer',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.parcelas) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el registro de parcelas del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'contabilidad.parcela.registrar.response', async (d) => {
      const res = this._registrar(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.parcela_registrada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.parcela.registrar.failed', res);
      }
      return res;
    });
  }

  onAutorizarRequest(e) {
    return this._atender(e, 'autorizar', 'contabilidad.parcela.autorizar.response', async (d) => {
      const res = this._escribir(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.parcela_autorizada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.parcela.autorizar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-single-writer-v1', parcelas: {} };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // registrar(rol, parcela, rol_autorizado) — la LEY la declara el DUENO.
  // Re-registrar la MISMA parcela con OTRO escritor = dos escritores = rechazo.
  _registrar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol !== ROL_LEY) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUENO declara la ley de parcelas', {
        rol_esperado: ROL_LEY, rol_recibido: rol
      });
    }

    const parcela = input && input.parcela;
    if (!parcela) return this._invalid('parcela');

    const rolAutorizado = String((input && input.rol_autorizado) || '').toUpperCase();
    if (!rolAutorizado) return this._invalid('rol_autorizado');

    const d = this._obtenerOCrear(pid);
    const existente = d.parcelas[parcela];
    if (existente) {
      if (existente.rol_autorizado !== rolAutorizado) {
        return this._errorResponse(409, CODE_DOS_ESCRITORES, `la parcela ${parcela} ya tiene escritor`, {
          parcela,
          rol_vigente: existente.rol_autorizado,
          rol_intentado: rolAutorizado,
          simbolico: CODE_DOS_ESCRITORES
        });
      }
      // Idempotente: misma parcela, mismo escritor.
      return { status: 200, data: { project_id: pid, parcela, rol_autorizado: rolAutorizado, reusado: true } };
    }

    d.parcelas[parcela] = {
      parcela,
      rol_autorizado: rolAutorizado,
      registrado_por: ROL_LEY,
      registrado_en: new Date().toISOString()
    };
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, parcela, rol_autorizado: rolAutorizado, reusado: false } };
  }

  // autorizar(parcela, rol) -> ok | ERROR_DOS_ESCRITORES  (proyeccion PURA: no muta).
  _autorizar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const parcela = input && input.parcela;
    if (!parcela) return this._invalid('parcela');
    const rol = String((input && input.rol_autorizado) || (input && input.rol_escritor) || '').toUpperCase();
    if (!rol) return this._invalid('rol');

    const d = this._obtenerOCrear(pid);
    const p = d.parcelas[parcela];
    if (!p) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `la parcela ${parcela} no esta registrada`, {
        parcela, simbolico: 'PARCELA_NO_REGISTRADA'
      });
    }
    if (p.rol_autorizado !== rol) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES, `la parcela ${parcela} es de ${p.rol_autorizado}`, {
        parcela, rol_vigente: p.rol_autorizado, rol_intentado: rol, simbolico: CODE_DOS_ESCRITORES
      });
    }
    return { status: 200, data: { project_id: pid, parcela, rol, autorizado: true } };
  }

  // escribir(parcela, rol, cambio) -> ok | ERROR_DOS_ESCRITORES.
  // Ningun custodio escribe si no es el rol autorizado de su parcela.
  _escribir(input) {
    const res = this._autorizar(input);
    if (res.status !== 200) return res;
    return {
      status: 200,
      data: {
        project_id: res.data.project_id,
        parcela: res.data.parcela,
        rol: res.data.rol,
        escrito: true,
        cambio: (input && input.cambio !== undefined) ? input.cambio : null
      }
    };
  }

  // ── Tools ──
  toolRegistrar(params) { return this._registrar(params); }
  toolAutorizar(params) { return this._autorizar(params); }
  toolEscribir(params) { return this._escribir(params); }
}

module.exports = SingleWriter;
