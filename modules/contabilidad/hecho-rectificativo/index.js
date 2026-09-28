/**
 * contabilidad/hecho-rectificativo — PUENTE STATELESS (A13, hoja del plan).
 *
 * Plano 2 de los 4 planos de correccion: el hecho POSTERIOR que corrige o anula
 * uno anterior casa con su ORIGINAL por CLAVE NATURAL (M3). NO BORRA: ANADE.
 * El original queda intacto; la correccion SUMA un asiento de ajuste (senal a
 * B5, escritor-diario). Espejo de B5 del lado del hecho.
 *
 * PUENTE (patron real, stateless): sin PosPersistencia ni project.activated —
 * los hechos admitidos que pueden ser ORIGINAL de un rectificativo se cachean en
 * memoria del propio puente (alimentados por EVENTO `contabilidad.hecho_admitido`
 * de puerto-evento-vertical), NUNCA por require cruzado. Si el original no se
 * halla → ERROR_ORIGINAL_NO_HALLADO (determinista); si el rectificativo no
 * declara a que original apunta → se DECLARA (no se asume). La clave natural la
 * da clave-natural (M3) por EVENTO; si ese RPC no responde, se publica el par de
 * fallo y NUNCA se emite basura (contrato TOLERANTE). Emisor/par de fallo: exito
 * publica contabilidad.hecho_rectificado; error su par determinista. NO
 * REUTILIZA: la correccion no destructiva por clave natural es propia del
 * dominio contable.
 *
 * Ver hoja A13 del diseno-oop y bloque `hecho-rectificativo` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Signos del hecho rectificativo (clase A13): corrige o anula.
const SIGNOS = new Set(['CORRIGE', 'ANULA']);

// Codigo simbolico determinista del cerrojo (clase A13).
const CODE_ORIGINAL_NO_HALLADO = 'ERROR_ORIGINAL_NO_HALLADO';

class HechoRectificativo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'hecho-rectificativo';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: cache en memoria de hechos admitidos (posibles ORIGINALES).
    this._admitidos = new Map();   // project_id -> Map<clave_natural, hecho>
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onEmparejarRequest(e) {
    return this._atender(e, 'emparejar', 'contabilidad.rectificativo.emparejar.response', async (d) => {
      const res = await this._emparejar(d);
      if (res.status === 200) {
        // NO BORRA: ANADE — señal al libro (B5) con el asiento de ajuste.
        const emision = this._emitir({ ...d, hecho: res.data.rectificativo, ajuste: res.data.ajuste });
        this.eventBus?.publish('contabilidad.hecho_rectificado', {
          ...res.data,
          emision: emision.status === 200 ? emision.data : null,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.rectificativo.emparejar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: puerto-evento-vertical (A1) admitio un hecho → posible ORIGINAL.
  onHechoAdmitido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const clave = d.clave_natural || (d.hecho && d.hecho.clave_natural) || null;
    if (!clave) return null;   // sin clave no es localizable como original

    if (!this._admitidos.has(d.project_id)) this._admitidos.set(d.project_id, new Map());
    this._admitidos.get(d.project_id).set(String(clave), d.hecho || d);
    this.logger?.info(`${this.name}.admitido_cacheado`, { clave });
    return { status: 200, data: { project_id: d.project_id, clave_natural: String(clave), cacheado: true } };
  }

  // ── proyecciones puras (deterministas) ──
  // emparejar(rectificativo, original) -> ok | ERROR_ORIGINAL_NO_HALLADO.
  async _emparejar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rect = (input && (input.rectificativo || input.hecho)) || null;
    if (!rect || typeof rect !== 'object') return this._invalid('rectificativo');

    const vertical = rect.vertical || (input && input.vertical) || null;
    if (!vertical) return this._invalid('rectificativo.vertical');

    // Clave natural del rectificativo: viene en el payload o la da clave-natural (M3) por EVENTO.
    let claveRect = (input && input.clave_natural) || rect.clave_natural || null;
    if (!claveRect) {
      const resp = await this._rpc('contabilidad.clave.calcular.request', {
        project_id: pid,
        hecho: rect,
        unidad_de_cierre: (input && input.unidad_de_cierre) || rect.unidad_cierre || null
      }, { timeout_ms: 4000 });
      claveRect = (resp && resp.status === 200 && resp.data && resp.data.clave_natural) || null;
      if (!claveRect) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE',
          'clave-natural (M3) no devolvio la clave del rectificativo: no se asume', {
            vertical, dependencia: 'clave-natural', accion: 'NO_EMITIR_PUBLICAR_FALLO'
          });
      }
    }

    // A que ORIGINAL apunta: explicito en el payload, o declarado por el rectificativo.
    const refOriginal = (input && (input.original_ref || (input.original && (input.original.clave_natural || input.original.clave))))
      || rect.hecho_original || rect.original || rect.clave_original || null;

    let original = (input && input.original && typeof input.original === 'object' && refOriginal === (input.original.clave_natural || input.original.clave))
      ? input.original
      : null;
    if (!original && refOriginal) original = this._buscarOriginal(pid, refOriginal);

    // Si el rectificativo NO declara a que apunta → se DECLARA, no se asume.
    if (!original && !refOriginal) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el rectificativo no declara el original al que apunta', {
          vertical, senal: 'ORIGINAL_NO_DECLARADO', accion: 'se declara, no se asume'
        });
    }

    if (!original) {
      return this._errorResponse(404, CODE_ORIGINAL_NO_HALLADO,
        `el original ${refOriginal} no se halla entre los hechos admitidos`, {
          vertical, original_ref: refOriginal, simbolico: CODE_ORIGINAL_NO_HALLADO
        });
    }

    const signo = this._signo(rect);
    const ajuste = this._calcularAjuste(signo, rect, original);

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        clave_rectificativo: claveRect,
        clave_original: original.clave_natural || refOriginal || null,
        signo,
        rectificativo: { ...rect, clave_natural: claveRect },
        original: { clave_natural: original.clave_natural || refOriginal || null, resumen: original },
        ajuste,
        borra: false,
        suma: true,
        regla: 'la correccion NO borra el original: SUMA un asiento de ajuste (B5)'
      }
    };
  }

  // emitir(hecho, ajuste) -> asiento de ajuste (B5), NUNCA borrado.
  _emitir(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const hecho = (input && input.hecho) || {};
    const ajuste = (input && input.ajuste) || null;
    if (!ajuste) return this._invalid('ajuste');

    const asiento = {
      tipo: 'AJUSTE',
      origen: 'RECTIFICATIVO',
      signo: ajuste.signo,
      importe: ajuste.importe,
      clave_rectificativo: hecho.clave_natural || null,
      clave_original: ajuste.clave_original || null,
      destino: 'B5_escritor_diario',
      borra_original: false
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        asiento_ajuste: asiento,
        original_intacto: true,
        borrado: false,
        suma: true,
        senal_libro: 'B5'
      }
    };
  }

  // buscarOriginal(pid, ref) -> hecho | null (cache en memoria, alimentada por evento).
  _buscarOriginal(pid, ref) {
    const m = this._admitidos.get(pid);
    if (!m) return null;
    const hallado = m.get(String(ref));
    if (hallado) return hallado;
    // Tolerancia: coincidencia por documento de origen (declarado por la fuente).
    for (const hecho of m.values()) {
      const doc = hecho && (hecho.documento_origen || hecho.documento);
      if (doc && String(doc) === String(ref)) return hecho;
    }
    return null;
  }

  _signo(rect) {
    const s = String(rect.tipo || rect.signo || '').toUpperCase();
    return SIGNOS.has(s) ? s : 'CORRIGE';
  }

  _calcularAjuste(signo, rect, original) {
    const totalOriginal = Number(original && original.total);
    const totalRect = Number(rect && rect.total);
    let importe;
    if (signo === 'ANULA') {
      // Anular = asiento que neutraliza el original.
      importe = Number.isFinite(totalOriginal) ? -this._round(totalOriginal, 2) : null;
    } else {
      // Corregir = diferencia entre lo nuevo y lo original.
      importe = (Number.isFinite(totalRect) && Number.isFinite(totalOriginal))
        ? this._round(totalRect - totalOriginal, 2)
        : (Number.isFinite(totalRect) ? this._round(totalRect, 2) : null);
    }
    return {
      signo,
      importe,
      total_original: Number.isFinite(totalOriginal) ? this._round(totalOriginal, 2) : null,
      total_rectificativo: Number.isFinite(totalRect) ? this._round(totalRect, 2) : null,
      clave_original: original && original.clave_natural ? original.clave_natural : null
    };
  }

  // ── Tools ──
  toolEmparejar(params) { return this._emparejar(params); }
  toolEmitir(params) { return this._emitir(params); }
}

module.exports = HechoRectificativo;
