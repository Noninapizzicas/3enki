/**
 * contabilidad-entrada/captura-documento — REFLEJO STATELESS (A3, hoja del plan).
 *
 * Admite y VALIDA el documento recibido. MECANICO, CERO JUICIO: no interpreta el
 * contenido (eso es `extraccion-dato` A4.1). Comprueba que el documento EXISTE y trae
 * al menos un ANCLAJE (tipo / file_path / contenido / mime). Si no lo trae → RECHAZA
 * con motivo declarado; jamas se inventa un documento.
 *
 * Al admitir (RPC directo), ENCADENA la entrada por EVENTO segun la FORMA del documento:
 *   · declara `formato`  → `puerto-documento.entrar.request` (A4.2 traduce la forma)
 *   · es FISICO (trae path/file_path y NO texto) → `lector-documento.leer.request`
 *     (hay que convertir los bytes en texto ANTES de pedir juicio: encadenar un binario a
 *     extraccion-dato produce una excepcion «documento incompleto» por cada documento)
 *   · ya viene canonico (trae texto/contenido) → `extraccion-dato.juzgar.request` (A4.1)
 *
 * Y NO encadena cuando el documento llega por el HECHO `contabilidad.documento_recibido`:
 * el emisor de ese hecho (puerto-documento-digital / ingesta-documental) YA encadeno al
 * camino correcto. Re-encadenar aqui es un SEGUNDO camino sobre el mismo documento: medido
 * en vivo, metia una excepcion espuria en la cola por cada documento que entraba bien.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (admitir) → sin ui_handler.
 * Ver hoja A3 del plan-construccion y diseno-oop.md (CLASE CapturaDocumento).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Anclajes que hacen ADMISIBLE un documento. Sin NINGUNO, no hay documento que admitir.
// `path` y `texto` son las formas REALES que usan los modulos de esta vertical (fs.read trabaja
// con `path`; el lector devuelve `texto`). El contrato original solo nombraba `file_path` y
// `contenido`, y con eso un documento que traia `path` se rechazaba en silencio.
const ANCLAJES = ['tipo', 'file_path', 'path', 'contenido', 'texto', 'mime', 'url'];

class CapturaDocumento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'captura-documento';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onAdmitirRequest(e) {
    return this._atender(e, 'admitir', 'captura-documento.admitir.response', (d) => {
      const res = this._admitir(d);
      if (res.status !== 200) this.eventBus?.publish('captura-documento.admitir.failed', res);
      // Reflejo: no escribe → no hay hecho que anunciar (R2). Solo encadena la entrada.
      else this._encadenar(res, d);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): llego un documento por el canal digital ──
  onDocumentoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id && !this.project_id) return;
    let res;
    try {
      res = this._admitir({
        project_id: d.project_id || this.project_id,
        documento: d.documento && typeof d.documento === 'object' ? d.documento : d,
        formato: d.formato,
        origen: d.origen,
        correlation_id: d.correlation_id
      });
    } catch (err) {
      this.logger?.error(`${this.name}.documento_recibido.error`, { error: err.message });
      return;
    }
    // AQUI NO SE ENCADENA. Este handler escucha un HECHO: el documento ya entro por el puerto
    // digital, que es quien encadena al camino correcto (lector si es fisico, extraccion si ya
    // es texto). Encadenar otra vez creaba un segundo camino y una excepcion espuria por
    // documento (medido en produccion). Se admite (deja constancia) y se para.
    if (res.status === 200 && res.data && res.data.admitido) {
      this.logger?.info(`${this.name}.documento_recibido.admitido`, {
        project_id: res.data.project_id,
        camino: res.data.encadenado_a,
        nota: 'el emisor del hecho ya encadeno; aqui no se re-encadena'
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // admitir(input) → { admitido, documento, encadenado_a, abierto }
  // ══════════════════════════════════════════════════════════════════════
  _admitir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const documento = input.documento;
    if (!documento || typeof documento !== 'object') return this._invalid('documento');

    // Validacion MECANICA: al menos un anclaje presente. Sin anclaje NO es admisible.
    const anclajes = ANCLAJES.filter((k) => documento[k] !== undefined && documento[k] !== null && documento[k] !== '');
    const admitido = anclajes.length > 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'captura-documento',
        admitido,
        documento,
        formato: input.formato != null ? String(input.formato) : null,
        origen: input.origen != null ? String(input.origen) : null,
        anclajes,
        // CERO JUICIO: se declara que no se interpreto el contenido (eso es extraccion-dato).
        contenido_interpretado: false,
        encadenado_a: admitido ? this._camino(documento, input.formato) : null,
        abierto: {
          documento: admitido
            ? null
            : 'el documento no trae ningun anclaje (tipo/file_path/contenido/mime/url): no se admite, no se inventa'
        }
      }
    };
  }

  // El CAMINO que le toca a un documento, por su FORMA (no por su contenido):
  //   formato declarado → puerto-documento (hay que traducir la forma)
  //   fisico (bytes)    → lector-documento (hay que leerlo antes de juzgarlo)
  //   canonico (texto)  → extraccion-dato (ya se puede volver dato)
  _camino(documento = {}, formato = null) {
    if (formato != null) return 'puerto-documento';
    const fisico = Boolean(documento.path || documento.file_path)
      && documento.texto == null && documento.contenido == null;
    return fisico ? 'lector-documento' : 'extraccion-dato';
  }

  // Encadena la entrada por EVENTO al camino que toca. No se decide nada de negocio aqui.
  _encadenar(res, d) {
    if (!res.data || !res.data.admitido) return;
    const payload = {
      project_id: res.data.project_id,
      documento: res.data.documento,
      formato: res.data.formato,
      origen: res.data.origen || 'captura-documento',
      correlation_id: d.correlation_id
    };
    try {
      const camino = this._camino(res.data.documento, res.data.formato);
      if (camino === 'puerto-documento') this.eventBus?.publish('puerto-documento.entrar.request', payload);
      else if (camino === 'lector-documento') this.eventBus?.publish('lector-documento.leer.request', payload);
      else this.eventBus?.publish('extraccion-dato.juzgar.request', payload);
    } catch (_) { /* best-effort */ }
  }

  // ── Tools ──
  toolAdmitir(params) { return this._admitir(params); }
}

module.exports = CapturaDocumento;
