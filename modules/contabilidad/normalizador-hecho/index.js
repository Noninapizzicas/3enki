/**
 * contabilidad/normalizador-hecho — CONVERSOR STATELESS (A2 + A4.3, hoja del plan).
 *
 * UNICA puerta de FORMATO del hecho (invariante 10 del dominio): homogeneiza el
 * hecho CRUDO de cualquier fuente a forma asentable, mapeando los campos de la
 * fuente a los campos internos. Lo que FALTA no se rellena: se marca como campo
 * ausente → excepcion o pregunta (invariante 7: dato ausente = desconocido).
 * Ademas controla el CUADRE del documento (A4.3): suma bases + suma impuestos =
 * total, con tolerancia DECLARABLE; jamas se asienta "casi cuadrado".
 *
 * CONVERSOR (patron real, stateless): sin PosPersistencia ni project.activated —
 * entra objeto, sale objeto. La dependencia con puerto-evento-vertical (A1),
 * contrato-hecho-minimo (A11), facturas y lote-admision es por EVENTO, NUNCA por
 * require cruzado. Emisor/par de fallo: exito publica
 * contabilidad.hecho_normalizado (o contabilidad.documento_descuadrado si no
 * cuadra); error su par determinista. NO REUTILIZA: `facturas` entrega el dato
 * extraido, no la forma asentable de contabilidad (contrato A11 + clave natural
 * A14); el cuadre determinista es propio.
 *
 * Ver hojas A2/A4.3 del diseno-oop y bloque `normalizador-hecho` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos internos de la forma asentable (molde de Hecho del diseno-oop).
const CAMPOS_INTERNOS = [
  'vertical', 'clase_hecho', 'fecha_operacion', 'fecha_valor', 'tercero',
  'lineas', 'impuestos', 'forma_pago', 'documento_origen', 'moneda'
];

// Tolerancia por defecto del cuadre (declarable via payload; [ABIERTO] como parametro).
const TOLERANCIA_DEFECTO = 0.01;

class NormalizadorHecho extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'normalizador-hecho';
    this.version = 'reflejo-0.1.0';
    // Conversor stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onNormalizarRequest(e) {
    return this._atender(e, 'normalizar', 'contabilidad.hecho.normalizar.response', async (d) => {
      const res = this._homogeneizar(d);
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.hecho.normalizar.failed', res);
        return res;
      }
      // Control de cuadre del documento (A4.3): jamas se asienta "casi cuadrado".
      const cuadre = this._cuadrarDocumento({ ...d, hecho: res.data.hecho, tolerancia: d.tolerancia });
      if (cuadre.status === 200 && cuadre.data.cuadrado === false) {
        this.eventBus?.publish('contabilidad.documento_descuadrado', {
          project_id: res.data.project_id,
          vertical: res.data.vertical,
          descuadre: cuadre.data.descuadre,
          faltantes: res.data.faltantes,
          detalle: cuadre.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.hecho_normalizado', {
          ...res.data,
          cuadre: cuadre.status === 200 ? cuadre.data : null,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // Fire-and-forget: puerto-evento-vertical (A1) admitio un hecho → se normaliza.
  onHechoAdmitido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._homogeneizar({
      project_id: d.project_id,
      hecho_crudo: d.hecho || d,
      vertical: d.vertical,
      correlation_id: d.correlation_id
    });
    if (res.status === 200) {
      this.eventBus?.publish('contabilidad.hecho_normalizado', {
        ...res.data,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('contabilidad.hecho.normalizar.failed', res);
    }
    return res;
  }

  // Fire-and-forget: `facturas` proceso una factura → se normaliza a forma asentable.
  onFacturaProcesada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._homogeneizar({
      project_id: d.project_id,
      hecho_crudo: d.factura || d.datos || d,
      vertical: d.vertical || 'COMPRA',
      correlation_id: d.correlation_id
    });
    if (res.status === 200) {
      this.eventBus?.publish('contabilidad.hecho_normalizado', {
        ...res.data,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('contabilidad.hecho.normalizar.failed', res);
    }
    return res;
  }

  // ── proyecciones puras (deterministas) ──
  // homogeneizar(hechoCrudo) -> Hecho — UNICA puerta de formato.
  _homogeneizar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const crudo = (input && (input.hecho_crudo || input.hecho)) || null;
    if (!crudo || typeof crudo !== 'object') return this._invalid('hecho_crudo');

    const vertical = crudo.vertical || (input && input.vertical) || null;
    if (!vertical) return this._invalid('hecho_crudo.vertical');

    // Mapeo de campos de la fuente a campos internos (si la fuente declara su mapa).
    const hecho = this._mapear(input && input.mapa, crudo, vertical);
    const faltantes = this._detectarFaltantes(hecho);

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        hecho: { ...hecho, estado: 'NORMALIZADO' },
        faltantes,
        incompleto: faltantes.length > 0,
        nota: faltantes.length > 0 ? 'lo que falta NO se rellena: va a excepcion/pregunta' : null
      }
    };
  }

  // mapear(camposFuente, camposInternos) -> Hecho.
  _mapear(mapa, crudo, vertical) {
    const fuente = (crudo.payload !== undefined ? crudo.payload : (crudo.datos || crudo)) || {};
    const hecho = { vertical };
    for (const campo of CAMPOS_INTERNOS) {
      if (fuente[campo] !== undefined) hecho[campo] = fuente[campo];
    }
    // Mapa declarado: { campoFuente: campoInterno }.
    if (mapa && typeof mapa === 'object') {
      for (const [origen, destino] of Object.entries(mapa)) {
        if (fuente[origen] !== undefined && destino) hecho[destino] = fuente[origen];
      }
    }
    hecho.fuente = crudo.fuente || null;
    hecho.clave_natural = crudo.clave_natural || null;
    hecho.documento_origen = hecho.documento_origen || crudo.documento_origen || null;
    return hecho;
  }

  // detectarFaltantes(hecho) -> Set<Campo> → excepcion/pregunta (lo que falta NO se rellena).
  _detectarFaltantes(input) {
    const hecho = (input && input.hecho) || input || {};
    const exigidos = Array.isArray(input && input.exigidos) && input.exigidos.length
      ? input.exigidos
      : ['vertical', 'fecha_operacion'];
    return exigidos.filter((c) => {
      const v = hecho[c];
      return v === undefined || v === null || v === '';
    });
  }

  // cuadrarDocumento(campos) -> Cuadrado | Descuadre  (Σ bases + Σ impuestos = total).
  _cuadrarDocumento(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const hecho = (input && input.hecho) || {};

    const t = Number(input && input.tolerancia);
    const tolerancia = Number.isFinite(t) && t >= 0 ? t : TOLERANCIA_DEFECTO;

    const bases = Array.isArray(hecho.lineas)
      ? hecho.lineas.reduce((s, l) => s + (Number(l && (l.base ?? l.importe ?? l.precio)) || 0), 0)
      : 0;
    const impuestos = Array.isArray(hecho.impuestos)
      ? hecho.impuestos.reduce((s, i) => s + (Number(i && (i.cuota ?? i.importe)) || 0), 0)
      : 0;
    const total = Number(hecho.total);

    if (!Array.isArray(hecho.lineas) || !Number.isFinite(total)) {
      return this._errorResponse(422, 'PRECONDITION_FAILED', 'el documento no trae lineas/total para cuadrar', {
        tiene_lineas: Array.isArray(hecho.lineas), total: Number.isFinite(total)
      });
    }

    const sumaBases = this._round(bases, 2);
    const sumaimpuestos = this._round(impuestos, 2);
    const esperado = this._round(sumaBases + sumaimpuestos, 2);
    const descuadre = this._round(esperado - this._round(total, 2), 2);
    const cuadrado = Math.abs(descuadre) <= tolerancia;

    return {
      status: 200,
      data: {
        project_id: pid,
        cuadrado,
        suma_bases: sumaBases,
        suma_impuestos: sumaimpuestos,
        esperado,
        total: this._round(total, 2),
        descuadre,
        tolerancia,
        resultado: cuadrado ? 'CUADRADO' : 'DESCUADRE',
        senal: cuadrado ? null : 'excepcion_a_cola_revision'
      }
    };
  }

  // ── Tools ──
  toolHomogeneizar(params) { return this._homogeneizar(params); }
  toolMapear(params) { return this._mapear(params.mapa, params.hecho_crudo || {}, params.vertical); }
  toolDetectarFaltantes(params) { return this._detectarFaltantes(params); }
  toolCuadrarDocumento(params) { return this._cuadrarDocumento(params); }
}

module.exports = NormalizadorHecho;
