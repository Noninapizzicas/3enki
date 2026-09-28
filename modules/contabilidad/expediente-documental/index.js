/**
 * contabilidad/expediente-documental — CUSTODIO (L7, hoja del plan).
 *
 * Cada CIFRA con el DOCUMENTO ORIGEN archivado y enlazado: LA PRUEBA que sostiene
 * la firma ante una inspeccion. L2 explica; el expediente CONSERVA. Un solo
 * escritor (la ADMISION archiva la prueba); el almacen fisico del documento lo
 * pone `filesystem` por EVENTO (fs.write.request), NUNCA por require cruzado —
 * `filesystem` es el almacen, el expediente es el ENLACE cifra<->prueba.
 *
 * CUSTODIO (patron real, append-only): un unico escritor del enlace en guard;
 * _archivar valida y apila el enlace (nunca se reescribe: invariante 9, registros
 * inmutables); _recuperar y _verificarEnlace son proyecciones PURAS de lectura.
 * Persiste por proyecto con PosPersistencia (storage
 * /contabilidad/expediente-documental/*.json), restaura en project.activated y
 * vuelca en onUnload. Emisor/par de fallo: exito publica
 * contabilidad.cifra_archivada; error su par determinista. NO REUTILIZA: el
 * enlace cifra<->documento de origen es propio de la vertical.
 *
 * Ver hoja L7 del diseno-oop y bloque `expediente-documental` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la prueba — la ADMISION archiva el documento origen.
const ROL_ARCHIVO = 'ADMISION';

// Codigo simbolico determinista del cerrojo (nombre de la clase L7).
const CODE_SIN_PRUEBA = 'ERROR_CIFRA_SIN_PRUEBA';

class ExpedienteDocumental extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'expediente-documental';
    this.version = 'reflejo-0.1.0';
    // store en memoria (append-only): project_id -> { esquema, expediente: {}, archivos: [] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'expediente-documental.json',
      dir: '/contabilidad/expediente-documental',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.expediente) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el expediente del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onArchivarRequest(e) {
    return this._atender(e, 'archivar', 'contabilidad.expediente.archivar.response', async (d) => {
      const res = this._archivar(d);
      if (res.status === 200) {
        // El almacen fisico del documento lo pone `filesystem` por EVENTO (no require).
        if (res.data.archivar_almacen) {
          const escrito = await this._rpc('fs.write.request', {
            project_id: res.data.project_id,
            path: `/contabilidad/expediente/${res.data.id_cifra}.json`,
            content: JSON.stringify({
              id_cifra: res.data.id_cifra,
              documento_origen: res.data.id_documento,
              referencia: res.data.referencia || null
            }),
            encoding: 'utf-8',
            atomic: true
          });
          res.data.almacenado = !!(escrito && escrito.status === 200);
        }
        this.eventBus?.publish('contabilidad.cifra_archivada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.expediente.archivar.failed', res);
      }
      return res;
    });
  }

  onRecuperarRequest(e) {
    return this._atender(e, 'recuperar', 'contabilidad.expediente.recuperar.response', async (d) => {
      const res = this._recuperar(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.expediente.recuperar.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-expediente-documental-v1', expediente: {}, archivos: [] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // archivar(cifra, documentoOrigen) -> ok — single-writer; la prueba queda ENLAZADA.
  // APPEND-ONLY: el enlace se apila; nunca se reescribe ni se borra.
  _archivar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol !== ROL_ARCHIVO) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo ADMISION archiva la prueba de la cifra', {
        rol_esperado: ROL_ARCHIVO, rol_recibido: rol
      });
    }

    const idCifra = (input && (input.id_cifra || input.cifra)) || null;
    if (!idCifra || typeof idCifra !== 'string') return this._invalid('id_cifra');

    const idDocumento = input && (input.id_documento || input.documento_origen);
    if (!idDocumento) return this._invalid('id_documento');

    const d = this._obtenerOCrear(pid);
    const enlace = {
      id_cifra: idCifra,
      id_documento: String(idDocumento),
      referencia: (input && input.referencia) || null,
      tipo_documento: (input && input.tipo_documento) || null,
      archivado_por: ROL_ARCHIVO,
      archivado_en: new Date().toISOString()
    };
    d.expediente[idCifra] = enlace;
    d.archivos.push({ id_cifra: idCifra, id_documento: enlace.id_documento, archivado_en: enlace.archivado_en });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        id_cifra: idCifra,
        id_documento: enlace.id_documento,
        referencia: enlace.referencia,
        archivar_almacen: (input && input.cifra !== undefined) ? false : true,
        prueba_enlazada: true,
        total: d.archivos.length
      }
    };
  }

  // recuperar(cifra) -> IdDocumento (proyeccion PURA: no muta).
  _recuperar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const idCifra = (input && (input.id_cifra || input.cifra)) || null;
    if (!idCifra) return this._invalid('id_cifra');

    const d = this._obtenerOCrear(pid);
    const enlace = d.expediente[idCifra];
    if (!enlace) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `la cifra ${idCifra} no tiene documento archivado`, {
        id_cifra: idCifra, simbolico: CODE_SIN_PRUEBA
      });
    }
    return { status: 200, data: { project_id: pid, id_cifra: idCifra, id_documento: enlace.id_documento, enlace } };
  }

  // verificarEnlace() -> ok | ERROR_CIFRA_SIN_PRUEBA (proyeccion PURA: no muta).
  _verificarEnlace(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const d = this._obtenerOCrear(pid);
    const exigidas = Array.isArray(input && input.cifras) ? input.cifras : Object.keys(d.expediente);
    const sinPrueba = exigidas.filter((c) => !d.expediente[c]);

    if (sinPrueba.length > 0) {
      return this._errorResponse(409, CODE_SIN_PRUEBA, 'hay cifras sin documento origen archivado', {
        sin_prueba: sinPrueba, simbolico: CODE_SIN_PRUEBA
      });
    }
    return { status: 200, data: { project_id: pid, verificado: true, cifras: exigidas.length } };
  }

  // ── Tools ──
  toolArchivar(params) { return this._archivar(params); }
  toolRecuperar(params) { return this._recuperar(params); }
  toolVerificarEnlace(params) { return this._verificarEnlace(params); }
}

module.exports = ExpedienteDocumental;
