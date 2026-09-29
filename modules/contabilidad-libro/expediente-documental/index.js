/**
 * contabilidad-libro/expediente-documental — CUSTODIO CON PERSISTENCIA (L7, hoja del plan).
 *
 * **LA PRUEBA PARA LA INSPECCION.** Cada cifra del libro queda con su documento ORIGEN
 * ARCHIVADO y ENLAZADO: `cifra → documento` con su huella, su procedencia y su enlace. Es un
 * registro INMUTABLE y APPEND-ONLY: un documento NO se borra jamas (invariante 10: los registros
 * inmutables solo crecen). Si hay que sustituir un documento por uno mejor, se AÑADE el nuevo y
 * el anterior queda como historial — la correccion SUMA.
 *
 * L2 (`vista-revisable`) EXPLICA el asiento con su traza; EL EXPEDIENTE CONSERVA la prueba.
 * No se solapan: L2 compone una vista, L7 archiva el documento origen.
 *
 * ATRIBUTOS del diseno: `referencias:Map<Cifra,Documento>`.
 * METODOS: `archivar(cifra, doc)`, `recuperar(cifra):Documento`.
 *
 * Invariantes:
 *  - APPEND-ONLY e INMUTABLE: un documento archivado no se borra ni se muta. Otra copia del
 *    mismo documento NO se re-archiva (idempotente por huella); un documento NUEVO se AÑADE.
 *  - UN SOLO ESCRITOR por la parcela `libro/expediente`: se pide el turno a single-writer (M2)
 *    POR EVENTO y se RESPETA su GUARD (403 si el turno es de otro).
 *  - Dato ausente = desconocido: sin documento NO se enlaza una cifra a un documento inventado;
 *    se declara `faltan` y no se archiva.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD (single-writer + escritor).
 * Ver hoja L7 del plan-construccion y diseno-oop.md (CLASE ExpedienteDocumental).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// La parcela del expediente. El turno lo concede single-writer (M2).
const PARCELA = 'libro/expediente';
// Rol que reclama el turno en single-writer.
const ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR';

class ExpedienteDocumental extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'expediente-documental';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, documentos:[append-only], por_cifra:Map<cifra, [doc_id]> }
    this._expedientes = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'expediente-documental.json',
      dir: '/contabilidad/expediente-documental',
      snapshot: (pid) => {
        const e = this._expedientes.get(pid);
        if (!e) return null;
        return { project_id: pid, esquema: e.esquema, documentos: e.documentos };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const documentos = Array.isArray(data.documentos) ? data.documentos : [];
        const por_cifra = new Map();
        for (const d of documentos) {
          const c = d && d.cifra != null ? String(d.cifra) : null;
          if (c === null) continue;
          const arr = por_cifra.get(c) || [];
          arr.push(d.id);
          por_cifra.set(c, arr);
        }
        this._expedientes.set(pid, { esquema: data.esquema || 'contabilidad-expediente-documental-v1', documentos, por_cifra });
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

  // ── handlers RPC (una linea, delegan a _atender) ──
  onArchivarRequest(e) {
    return this._atender(e, 'archivar', 'expediente-documental.archivar.response', async (d) => {
      const res = await this._archivar(d);
      if (res.status === 200) {
        // Solo un documento REALMENTE archivado (no idempotente) emite el evento de dominio.
        if (res.data.archivado === true) {
          this.eventBus?.publish('contabilidad.cifra_archivada', {
            project_id: res.data.project_id,
            cifra: res.data.cifra,
            documento: res.data.documento,
            documento_id: res.data.documento.id,
            huella: res.data.documento.huella,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('expediente-documental.archivar.failed', res);
      }
      return res;
    });
  }

  onRecuperarRequest(e) {
    return this._atender(e, 'recuperar', 'expediente-documental.recuperar.response', async (d) => {
      const res = this._recuperar(d);
      if (res.status !== 200) this.eventBus?.publish('expediente-documental.recuperar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // archivar(cifra, doc) → Referencia (UNICO ESCRITOR del expediente)
  // ══════════════════════════════════════════════════════════════════════
  async _archivar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cifra = input.cifra != null ? String(input.cifra).trim() : '';
    if (!cifra) return this._invalid('cifra');

    // El DOCUMENTO: el que viene declarado, o el que entrega puerto-documento POR EVENTO.
    const { documento, fuente_documento } = await this._documento(pid, input);
    if (!documento) {
      // Sin documento NO se enlaza una cifra a un documento inventado.
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'no hay documento que archivar para esta cifra (dato ausente = desconocido: nada se inventa)',
        { cifra, fuente_documento, motivo: 'sin_documento' });
    }

    // ── GUARD: UN SOLO ESCRITOR de la parcela libro/expediente (se RESPETA el de M2). ──
    const escritor_id = input.id != null ? String(input.id)
      : (input.escritor_id != null ? String(input.escritor_id) : ROL_RECLAMANTE);
    const turno = await this._rpc('single-writer.reclamar.request',
      { project_id: pid, rol: ROL_RECLAMANTE, parcela: PARCELA, id: escritor_id }, { timeout_ms: 4000 });
    const turno_data = turno && turno.data ? turno.data : null;
    if (turno_data && turno_data.concedido === false) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor con el turno de la parcela libro/expediente puede archivar documentos',
        { parcela: PARCELA, dueno: turno_data.dueno ?? null, solicitante: escritor_id });
    }
    const turno_confirmado = Boolean(turno_data && turno_data.concedido === true);

    // La HUELLA del documento: declarada o derivada de su contenido declarado. Identidad, no juicio.
    const huella = this._huella(documento, input);

    const e = this._obtenerOCrear(pid);

    // IDEMPOTENCIA: el MISMO documento (misma huella) para la MISMA cifra NO se re-archiva.
    const ya = e.documentos.find((x) => x.cifra === cifra && x.huella === huella) || null;
    if (ya) {
      return {
        status: 200,
        data: {
          project_id: pid, cifra, documento: ya, archivado: false, ya_existe: true,
          turno_confirmado,
          motivo: 'el mismo documento ya estaba archivado para esta cifra (el expediente no duplica)'
        }
      };
    }

    // ── APPEND-ONLY: el expediente SOLO CRECE. Un documento archivado no se borra ni se muta. ──
    const ahora = new Date().toISOString();
    const archivo = {
      id: `doc_${pid}_${cifra}_${huella}`,
      cifra,
      // Datos DECLARADOS del documento: referencia, tipo, procedencia, fecha, contenido.
      referencia: documento.referencia != null ? String(documento.referencia) : null,
      tipo: documento.tipo != null ? String(documento.tipo) : null,
      procedencia: documento.procedencia != null ? String(documento.procedencia) : fuente_documento,
      fecha: documento.fecha != null ? String(documento.fecha) : null,
      contenido: documento.contenido !== undefined ? documento.contenido : null,
      metadatos: documento.metadatos && typeof documento.metadatos === 'object' ? documento.metadatos : null,
      huella,
      // Enlace a la traza del asiento (si la cifra lo declara): el expediente conserva la prueba.
      traza: documento.traza && typeof documento.traza === 'object' ? documento.traza : null,
      // Inmutable: nunca se sustituye. Un documento mejor se AÑADE como archivo NUEVO.
      inmutable: true,
      archivado_por: escritor_id,
      archivado_en: ahora
    };
    e.documentos.push(archivo);
    const arr = e.por_cifra.get(cifra) || [];
    arr.push(archivo.id);
    e.por_cifra.set(cifra, arr);
    e.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, cifra, documento: archivo, archivado: true, aceptado: true, turno_confirmado }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // recuperar(cifra) → Documento (LECTURA, no muta)
  // ══════════════════════════════════════════════════════════════════════
  _recuperar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cifra = input.cifra != null ? String(input.cifra).trim() : '';
    if (!cifra) return this._invalid('cifra');

    const e = this._obtenerOCrear(pid);
    // Todos los documentos de la cifra (append-only: puede haber mas de uno). El VIGENTE es el
    // ultimo archivado — el historial se conserva entero para la inspeccion.
    const docs = e.documentos.filter((d) => d.cifra === cifra);
    const documento = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        cifra,
        // Sin documento archivado se declara: no se fabrica la prueba.
        archivado: Boolean(documento),
        documento,
        historial: docs,
        total: docs.length,
        abierto: {
          documento: documento ? null : 'no hay documento archivado para esta cifra: el expediente conserva, no inventa'
        }
      }
    };
  }

  // El documento declarado en la peticion, o el que da puerto-documento POR EVENTO. Nunca se inventa.
  async _documento(pid, input) {
    if (input.documento && typeof input.documento === 'object') {
      return { documento: input.documento, fuente_documento: 'declarado' };
    }
    if (input.doc && typeof input.doc === 'object') {
      return { documento: input.doc, fuente_documento: 'declarado' };
    }
    const r = await this._rpc('puerto-documento.entrar.request',
      { project_id: pid, cifra: input.cifra, referencia: input.referencia, documento_id: input.documento_id }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    const doc = data && data.documento ? data.documento : (data && data.documentos && data.documentos[0] ? data.documentos[0] : null);
    if (doc) return { documento: doc, fuente_documento: 'puerto-documento' };
    return { documento: null, fuente_documento: null };
  }

  // Huella identitaria del documento: la declarada, o el hash de su contenido declarado.
  _huella(documento, input) {
    if (input.huella != null && String(input.huella).trim() !== '') return String(input.huella).trim();
    if (documento.huella != null && String(documento.huella).trim() !== '') return String(documento.huella).trim();
    const material = JSON.stringify({
      referencia: documento.referencia !== undefined ? documento.referencia : null,
      tipo: documento.tipo !== undefined ? documento.tipo : null,
      fecha: documento.fecha !== undefined ? documento.fecha : null,
      contenido: documento.contenido !== undefined ? documento.contenido : null
    });
    return crypto.createHash('sha1').update(material).digest('hex').slice(0, 16);
  }

  _obtenerOCrear(pid) {
    let e = this._expedientes.get(pid);
    if (!e) {
      e = { esquema: 'contabilidad-expediente-documental-v1', documentos: [], por_cifra: new Map() };
      this._expedientes.set(pid, e);
      this._persist.marcarDirty(pid);
    }
    return e;
  }

  // Lectura directa (mismo proceso) — no muta. Los documentos archivados de una cifra.
  documentosDe(pid, cifra) {
    const e = pid ? this._expedientes.get(pid) : null;
    if (!e) return [];
    return e.documentos.filter((d) => String(d.cifra) === String(cifra));
  }

  // ── Tools ──
  toolArchivar(params) { return this._archivar(params); }
  toolRecuperar(params) { return this._recuperar(params); }
}

module.exports = ExpedienteDocumental;
