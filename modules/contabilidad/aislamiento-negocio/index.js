/**
 * contabilidad/aislamiento-negocio — CUSTODIO (I4, hoja del plan).
 *
 * Multi-negocio SIN FUGA (invariante 13 del dominio): un dueno por parcela.
 * Gobierna la PARCELA de cada negocio; ningun calculo de un negocio lee ni
 * escribe la parcela de otro salvo por CONSOLIDACION DECLARADA. Escribe aqui el
 * rol SISTEMA y solo el. Cualquier intento de tocar la parcela de un negocio
 * desde otro se rechaza de forma determinista con ERROR_FUGA_ENTRE_NEGOCIOS.
 * La capa de proyecto (PosPersistencia) NO sustituye a este aislamiento: dos
 * negocios pueden vivir en el mismo project_id y siguen sin verse.
 *
 * CUSTODIO (patron real): un unico escritor del store por parcela de negocio —
 * _registrar valida rol en guard; _parcela es proyeccion PURA de lectura (no
 * muta) y _escribir es el guard de aislamiento. Persiste por proyecto con
 * PosPersistencia (storage /contabilidad/aislamiento-negocio/*.json), restaura
 * en project.activated y vuelca en onUnload. Emisor/par de fallo: exito publica
 * contabilidad.parcela_negocio_registrada; error su par determinista. La
 * dependencia con single-writer (M2) es por EVENTO, NUNCA por require cruzado.
 * NO REUTILIZA: el aislamiento por parcela de negocio es la invariante 13.
 *
 * Ver hoja I4 del diseno-oop y bloque `aislamiento-negocio` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela de negocio (el sistema que aísla).
const ROL_ESCRITOR = 'SISTEMA';

// Rol autorizado a declarar la CONSOLIDACION entre negocios (excepcion declarada).
const ROLES_CONSOLIDACION = new Set(['DUENO', 'JEFE', 'SISTEMA']);

// Codigo simbolico determinista del cerrojo (clase I4).
const CODE_FUGA = 'ERROR_FUGA_ENTRE_NEGOCIOS';

class AislamientoNegocio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aislamiento-negocio';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, parcelas: { <negocio>: Parcela } }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'aislamiento-negocio.json',
      dir: '/contabilidad/aislamiento-negocio',
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

  // Restaura las parcelas de negocio del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'contabilidad.parcela_negocio.registrar.response', async (d) => {
      const res = this._registrar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.parcela_negocio_registrada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.parcela_negocio.registrar.failed', res);
      }
      return res;
    });
  }

  onEscribirRequest(e) {
    return this._atender(e, 'escribir', 'contabilidad.parcela_negocio.escribir.response', async (d) => {
      const res = this._escribir(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.parcela_negocio.escribir.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-aislamiento-negocio-v1', parcelas: {} };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // registrar(negocio, dueno, consolidacion?) — un solo escritor; un dueno por parcela.
  _registrar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo SISTEMA gobierna las parcelas de negocio', {
        rol_esperado: ROL_ESCRITOR, rol_recibido: rol
      });
    }

    const negocio = input && (input.negocio || input.id_negocio);
    if (!negocio) return this._invalid('negocio');

    const dueno = String((input && (input.dueno || input.rol_dueno)) || '').toUpperCase() || null;

    const d = this._obtenerOCrear(pid);
    const existente = d.parcelas[negocio];
    // Re-registrar la MISMA parcela con OTRO dueno = dos duenos = rechazo.
    if (existente && dueno && existente.dueno && existente.dueno !== dueno) {
      return this._errorResponse(409, CODE_FUGA, `la parcela del negocio ${negocio} ya tiene dueno`, {
        negocio, dueno_vigente: existente.dueno, dueno_intentado: dueno, simbolico: CODE_FUGA
      });
    }

    const consolidacion = input && input.consolidacion;
    d.parcelas[negocio] = {
      negocio,
      dueno: dueno || (existente && existente.dueno) || null,
      // La consolidacion es la UNICA excepcion declarada al aislamiento.
      consolidacion_declarada: Array.isArray(consolidacion)
        ? [...new Set(consolidacion.map((n) => String(n)))]
        : ((existente && existente.consolidacion_declarada) || []),
      registrado_por: ROL_ESCRITOR,
      registrado_en: new Date().toISOString()
    };
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, negocio, parcela: d.parcelas[negocio], reusado: !!existente }
    };
  }

  // parcela(negocio) -> Parcela (proyeccion PURA de lectura; no muta).
  _parcela(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const negocio = input && (input.negocio || input.id_negocio);
    if (!negocio) return this._invalid('negocio');

    const d = this._obtenerOCrear(pid);
    const p = d.parcelas[negocio];
    if (!p) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `el negocio ${negocio} no tiene parcela registrada`, { negocio });
    }
    return { status: 200, data: { project_id: pid, negocio, parcela: p } };
  }

  // escribir(negocio, rol, cambio) -> ok | ERROR_FUGA_ENTRE_NEGOCIOS.
  // Ningun calculo de un negocio toca la parcela de otro salvo consolidacion declarada.
  _escribir(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol !== ROL_ESCRITOR && !ROLES_CONSOLIDACION.has(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo SISTEMA (o consolidacion declarada) escribe parcelas', {
        rol_esperado: ROL_ESCRITOR, rol_recibido: rol
      });
    }

    const negocio = input && (input.negocio || input.id_negocio);
    if (!negocio) return this._invalid('negocio');

    const d = this._obtenerOCrear(pid);
    const p = d.parcelas[negocio];
    if (!p) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `el negocio ${negocio} no tiene parcela registrada`, { negocio });
    }

    // FUGA: si el cambio declara un negocio distinto de la parcela que se toca,
    // es una lectura/escritura entre negocios → rechazo determinista.
    const negocioCambio = input && input.negocio_destino;
    if (negocioCambio && String(negocioCambio) !== String(negocio)) {
      const permitido = Array.isArray(p.consolidacion_declarada)
        && p.consolidacion_declarada.includes(String(negocioCambio));
      if (!permitido) {
        return this._errorResponse(409, CODE_FUGA, `el negocio ${negocio} no puede tocar la parcela de ${negocioCambio}`, {
          negocio, negocio_destino: String(negocioCambio), consolidacion_declarada: p.consolidacion_declarada || [], simbolico: CODE_FUGA
        });
      }
    }

    p.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio,
        rol,
        escrito: true,
        cambio: (input && input.cambio !== undefined) ? input.cambio : null,
        via_consolidacion: !!(negocioCambio && String(negocioCambio) !== String(negocio))
      }
    };
  }

  // ── Tools ──
  toolRegistrar(params) { return this._registrar(params); }
  toolParcela(params) { return this._parcela(params); }
  toolEscribir(params) { return this._escribir(params); }
}

module.exports = AislamientoNegocio;
