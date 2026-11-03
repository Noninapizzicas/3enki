'use strict';

/**
 * factura-gestion · CONVERSOR · PLAZA — H03 (FacturaGestión).
 *
 * CONVIERTE UN CIERRE EN EL DOCUMENTO DE COBRO DE UNA PARTE. No calcula el importe: lo formatea.
 * Tres reglas que son el módulo:
 *
 *   1. SÓLO LO DEVENGADO EN ESE CIERRE. Ni una línea más, ni un concepto nuevo. Lo que está en
 *      duda (Q18) no se factura: se declara aparte, con su importe y su NO_CONSTA.
 *   2. LOS CAMPOS QUE NO CONSTAN SE MARCAN VACÍOS. El IVA, quién factura a quién y la forma
 *      jurídica son Q4 [ABIERTO]: el campo existe y se dice `NO_CONSTA`; no se pone un 21% ni una
 *      serie que nadie ha declarado. Sin tipo declarado no hay cuota, y el total es la base.
 *   3. UNA FACTURA POR CIERRE Y PARTE — POR CONSTRUCCIÓN. El documento se deriva del cierre con
 *      su huella: el mismo cierre y la misma parte dan SIEMPRE el mismo documento. La segunda
 *      emisión no es otra factura: es idempotente, salvo que venga como RECTIFICATIVA con motivo.
 *
 * Sin store: el documento no se guarda aquí (lo guarda quien lo pidió). Guardarlo sería una
 * segunda verdad del dinero.
 *
 * Isla: cero require a otra isla. El cierre se pide al bus (`liquidacion.de`).
 */

const ModuloBocaos = require('../_bocaos');

const TIMEOUT_CIERRE_MS = 3000;

class FacturaGestion extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'factura-gestion';
    this.version = 'conversor-0.1.0';
    this._path = null;                     // sin store: cambia de forma y devuelve
  }

  // ================= RPC del bus (una línea por op) =================
  onEmitirRequest(e) { return this.servir(e, 'emitir', 'factura-gestion.emitir', (d) => this._emitir(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'factura-gestion.de', (d) => this._de(d)); }

  // ================= H03 · emitir (ORDEN) =================
  async _emitir(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    if (!d.parte_id) return this._invalid('parte_id');

    const cierre = await this._cierre(d, project_id);
    if (!cierre) {
      return this._errorResponse(404, 'CIERRE_NO_CONSTA',
        'sin cierre no hay documento: una factura sin devengo congelado es un número con membrete',
        { field: d.cierre_id ? 'cierre_id' : 'periodo', hueco: 'cierre inexistente o periodo sin cerrar' });
    }
    const fila = (cierre.partes || []).find((f) => f.parte_id === d.parte_id);
    if (!fila) {
      return this._errorResponse(404, 'PARTE_NO_CONSTA',
        'esa parte no tiene devengo en ese cierre', { field: 'parte_id', cierre_id: cierre.cierre_id });
    }

    // H03 · la rectificativa: exige motivo y dice a qué documento corrige. No se emite «otra».
    const rect = d.rectifica && typeof d.rectifica === 'object' ? d.rectifica : null;
    let motivoRect = null;
    if (rect) {
      motivoRect = typeof (rect.motivo || d.motivo) === 'string' ? String(rect.motivo || d.motivo).trim() : '';
      if (!motivoRect) {
        return this._errorResponse(409, 'RECTIFICATIVA_SIN_MOTIVO',
          'una segunda factura del mismo cierre y parte es RECTIFICATIVA y exige motivo (H03)',
          { field: 'rectifica.motivo' });
      }
    }

    const baseId = `fc-${this.huella({ cierre: cierre.cierre_id, parte: d.parte_id }).slice(0, 10)}`;
    const documento_id = rect ? `${baseId}-r1` : baseId;

    const doc = this._documento({ cierre, fila, documento_id, baseId, rect, motivoRect, d });
    // El HECHO sale siempre: la llave del documento es determinista, así que el mismo cierre y la
    // misma parte emiten SIEMPRE el mismo `documento_id` y quien cobra deduplica por él (una sola
    // factura, un solo cobro). Lo que no se puede es callar el hecho para «no repetir».
    this.hecho('bocaos.documento_emitido', this._hechoDe(doc));
    return {
      status: 201,
      data: {
        documento: doc,
        misma_llave: true,
        nota: 'una factura por cierre y parte: la misma llave da el mismo documento_id (H03)'
      }
    };
  }

  // ================= H03 · de (PREGUNTA) =================
  // El documento se RECONSTRUYE desde el cierre: misma llave, mismo documento, misma huella. Así
  // el conversor no necesita guardar nada y no hay dos verdades del importe.
  async _de(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    if (!d.parte_id) return this._invalid('parte_id');

    const cierre = await this._cierre(d, project_id);
    if (!cierre) {
      return this._errorResponse(404, 'CIERRE_NO_CONSTA', 'no hay cierre con el que reconstruir el documento',
        { field: d.cierre_id ? 'cierre_id' : 'periodo' });
    }
    const fila = (cierre.partes || []).find((f) => f.parte_id === d.parte_id);
    if (!fila) {
      return this._errorResponse(404, 'PARTE_NO_CONSTA', 'esa parte no tiene devengo en ese cierre',
        { field: 'parte_id' });
    }
    const baseId = `fc-${this.huella({ cierre: cierre.cierre_id, parte: d.parte_id }).slice(0, 10)}`;
    const doc = this._documento({ cierre, fila, documento_id: d.documento_id || baseId, baseId, rect: null, motivoRect: null, d });
    return { status: 200, data: { documento: doc, reconstruido: true, cierre_id: cierre.cierre_id } };
  }

  // ================= el documento =================
  _documento({ cierre, fila, documento_id, baseId, rect, motivoRect, d }) {
    // Las líneas: SOLO lo devengado en este cierre. Ni un concepto más (H03).
    const lineas = [];
    if (Number.isInteger(fila.variable_seguro_centimos)) {
      lineas.push({
        concepto: 'céntimos por pedido aceptado',
        detalle: `${fila.pedidos} pedido(s) aceptado(s) × ${fila.cents_por_pedido} c`,
        cantidad: fila.pedidos,
        precio_unitario_centimos: fila.cents_por_pedido,
        importe_centimos: fila.variable_seguro_centimos,
        estado: 'CONSTA',
        // E04/A32: la frase que impide que alguien lo «mejore» con kilómetros.
        base: 'por pedido ACEPTADO, con la tarifa vigente en la hora del hecho (E04/A32)'
      });
    } else {
      lineas.push({
        concepto: 'céntimos por pedido aceptado',
        cantidad: fila.pedidos,
        precio_unitario_centimos: null,
        importe_centimos: null,
        estado: 'NO_CONSTA',
        motivo: fila.motivo || 'el contrato de esa parte no trae céntimos por pedido'
      });
    }
    if (Number.isInteger(fila.fijo_periodo_centimos)) {
      lineas.push({
        concepto: 'fijo del tramo (parte del periodo)',
        cantidad: 1,
        precio_unitario_centimos: fila.fijo_periodo_centimos,
        importe_centimos: fila.fijo_periodo_centimos,
        estado: 'CONSTA',
        base: `fijo mensual ${fila.fijo_mensual_centimos} c × ${fila.prorrateo.dias_periodo}/${fila.prorrateo.dias_mes} (declarado, Q26)`
      });
    } else if (fila.fijo_mensual_centimos !== null) {
      lineas.push({
        concepto: 'fijo del tramo (parte del periodo)',
        cantidad: 1,
        precio_unitario_centimos: null,
        importe_centimos: null,
        estado: 'NO_CONSTA',
        // Sin la parte del fijo el documento está incompleto, y lo dice en la línea, no en la letra
        // pequeña: ni un total a medias se convierte en una cuota.
        motivo: fila.motivo_fijo || 'la parte del fijo mensual que toca al periodo no consta (Q26)'
      });
    }

    const base = Number.isInteger(fila.total_seguro_centimos) ? fila.total_seguro_centimos : null;
    const iva = this._iva(base, d.iva || (d.cierre && d.cierre.iva));

    const doc = {
      documento_id,
      tipo: rect ? 'RECTIFICATIVA' : 'ORDINARIA',
      rectifica_a: rect ? (rect.documento_id || baseId) : null,
      motivo_rectificacion: motivoRect,
      clase: 'documento de cobro de la plaza',
      cierre_id: cierre.cierre_id,
      periodo: cierre.periodo,
      plaza_id: cierre.plaza_id || d.plaza_id || null,
      huella_cierre: cierre.huella || null,
      // Quién factura a quién es Q4 [ABIERTO]: se marcan las dos caras y se dice que no consta.
      emisor: { rol: 'plaza', parte_id: cierre.plaza_id || null, forma_juridica: null, forma_juridica_estado: 'NO_CONSTA' },
      receptor: { rol: fila.parte, parte_id: fila.parte_id, forma_juridica: null, forma_juridica_estado: 'NO_CONSTA' },
      quien_factura_a_quien: 'Q4 [ABIERTO]',
      // La numeración fiscal necesita una serie que la plaza no tiene declarada: no se inventa.
      serie: null,
      numero: null,
      numeracion: 'NO_CONSTA (Q4: sin serie fiscal declarada)',
      moneda: d.moneda || null,
      moneda_estado: d.moneda ? 'DECLARADA' : 'NO_CONSTA',
      fecha: cierre.cerrado_en,
      lineas,
      base_centimos: base,
      base_estado: base === null ? 'NO_CONSTA' : 'SUMA',
      iva,
      // Lo que se cobra es la cuota devengada (la base); el IVA, cuando conste, se suma.
      total_centimos: base,
      total_estado: base === null ? 'NO_CONSTA' : (iva.cuota_centimos === null ? 'SIN_IVA_DECLARADO' : 'CON_IVA'),
      // Lo que NO se factura, con nombre: la duda de Q18 no entra en el documento.
      no_facturado: [
        {
          motivo: 'pedido(s) cancelado(s) tras aceptar: en duda (Q18 [ABIERTO])',
          pedidos: (fila.detalle || []).filter((x) => x.estado === 'en_duda').map((x) => x.pedido_id),
          importe_centimos: fila.variable_en_duda_centimos,
          estado: 'NO_CONSTA'
        }
      ].filter((x) => x.pedidos.length > 0),
      // H06 · lo que este documento NO es: ni la comida ni el reparto.
      no_es: 'no incluye la comida ni el reparto: la plaza factura SU cuota (H06)',
      cobrable: base !== null,
      motivo_no_cobrable: base === null ? 'sin base no hay importe que cobrar: el documento está incompleto' : null
    };
    doc.huella = this.huella({
      documento_id: doc.documento_id, cierre: doc.cierre_id, parte: doc.receptor.parte_id,
      lineas: doc.lineas, iva: doc.iva, total: doc.total_centimos
    });
    return doc;
  }

  // H03 · el IVA es Q4 [ABIERTO]: el campo existe, el tipo no se inventa. Y sin tipo no hay cuota.
  _iva(base, declarado) {
    const tipo = declarado && Number.isFinite(declarado.tipo) ? declarado.tipo : null;
    if (tipo === null) {
      return {
        tipo: null, base_centimos: base, cuota_centimos: null, estado: 'NO_CONSTA',
        motivo: 'el tipo de IVA y quién factura a quién son Q4 [ABIERTO]: no se inventa un 21%'
      };
    }
    if (base === null) {
      return {
        tipo, base_centimos: null, cuota_centimos: null, estado: 'NO_CONSTA',
        motivo: 'hay tipo de IVA pero no hay base: no se calcula una cuota sobre nada'
      };
    }
    const cuota = Math.round((base * tipo) / 100);
    return {
      tipo, base_centimos: base, cuota_centimos: cuota, estado: 'CALCULADA',
      total_con_iva_centimos: base + cuota,
      nota: 'el tipo lo declara quien emite; aquí sólo se multiplica'
    };
  }

  // El cierre: o viene en la petición, o se pide a su dueño. Nunca se supone.
  async _cierre(d, project_id) {
    if (d.cierre && typeof d.cierre === 'object' && Array.isArray(d.cierre.partes)) return d.cierre;
    if (!d.periodo && !d.cierre_id) return null;
    const r = await this._rpc('liquidacion.de.request', {
      project_id, periodo: d.periodo, cierre_id: d.cierre_id
    }, { timeout_ms: TIMEOUT_CIERRE_MS });
    if (!r || typeof r.status === 'number' && r.status >= 400) return null;
    const cierre = r.data && r.data.cierre ? r.data.cierre : null;
    // Un periodo abierto no tiene cierre: no hay nada que facturar todavía.
    return cierre && cierre.estado === 'CERRADO' ? cierre : null;
  }

  _hechoDe(doc) {
    return {
      documento_id: doc.documento_id,
      tipo: doc.tipo,
      rectifica_a: doc.rectifica_a,
      cierre_id: doc.cierre_id,
      periodo: doc.periodo,
      plaza_id: doc.plaza_id,
      parte_id: doc.receptor.parte_id,
      parte: doc.receptor.rol,
      base_centimos: doc.base_centimos,
      iva_estado: doc.iva.estado,
      iva_tipo: doc.iva.tipo,
      total_centimos: doc.total_centimos,
      total_estado: doc.total_estado,
      cobrable: doc.cobrable,
      huella: doc.huella
    };
  }
}

module.exports = FacturaGestion;
