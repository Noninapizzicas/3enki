/**
 * contabilidad-fiscal/recibo-nomina — REFLEJO STATELESS (G1, hoja del plan).
 *
 * Admite y da FORMA ASENTABLE al hecho de nomina. Mecanico, CERO juicio: NO calcula la
 * nomina (bruto/neto, bases, tipos), NO la interpreta y NO decide nada — el hecho de
 * nomina llega YA emitido (por `puerto-nomina` G7) y aqui se le da la forma que el
 * escritor de personal (asiento-personal G3) y el resto de la cadena de nomina necesitan.
 *
 * La forma asentable: una CABEZA identificada (empleado, periodo) y unos CONCEPTOS
 * declarados, cada uno con su importe. Se normaliza la ESTRUCTURA, no el VALOR: los
 * importes y conceptos son DECLARADOS y se copian tal cual (lo ausente queda null).
 *
 * Invariante: dato ausente = desconocido. Sin hecho de nomina no hay forma que dar (no se
 * fabrica); un concepto sin importe se declara, no se estima con un cero.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.nomina_recibida`; NINGUN modulo del
 * repo lo emite AUN (lo emite `puerto-nomina` G7, de un grupo posterior): declararlo daria
 * cadena colgada. NO se declara hasta que su emisor exista.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G1 del plan-construccion y diseno-oop.md (CLASE ReciboNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// La forma asentable del recibo: cabeza (quien/cuando) + conceptos declarados.
const CABEZA = ['empleado', 'empleado_id', 'periodo', 'fecha', 'devengo'];

class ReciboNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'recibo-nomina';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onDarFormaRequest(e) {
    return this._atender(e, 'dar_forma', 'recibo-nomina.dar_forma.response', async (d) => {
      const res = this._dar_forma(d);
      // Reflejo: da forma al hecho de nomina; no escribe estado → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('recibo-nomina.dar_forma.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // dar_forma(nomina) → recibo con forma asentable (mecanico, cero juicio)
  // ══════════════════════════════════════════════════════════════════════
  _dar_forma(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El HECHO de nomina: viene DECLARADO (lo emitio puerto-nomina). Sin el no se fabrica forma.
    const nomina = (input.nomina && typeof input.nomina === 'object') ? input.nomina
      : ((input.hecho && typeof input.hecho === 'object') ? input.hecho
        : ((input.recibo && typeof input.recibo === 'object') ? input.recibo : null));
    if (!nomina) return this._invalid('nomina');

    // CABEZA: identifica el recibo. Se copia lo declarado; lo ausente → null y se declara.
    const cabeza = {};
    const faltan_cabeza = [];
    for (const campo of CABEZA) {
      const v = nomina[campo];
      if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
        cabeza[campo] = null;
        faltan_cabeza.push(campo);
      } else {
        cabeza[campo] = v;
      }
    }

    // CONCEPTOS: la forma asentable de las lineas. NO se calcula su importe: se copia declarado.
    const conceptos = this._conceptos(nomina);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'recibo-nomina',
        // Forma asentable: cabeza + conceptos. El contenido (importes) es DECLARADO, no calculado.
        forma: { ...cabeza, conceptos },
        cabeza,
        conceptos,
        num_conceptos: conceptos.length,
        // Mecanico: admite y da forma, NO calcula ni interpreta la nomina.
        calculado: false,
        interpretado: false,
        abierto: {
          cabeza: faltan_cabeza.length > 0
            ? `campos de cabeza sin declarar: ${faltan_cabeza.join(', ')} (se declaran, no se inventan)`
            : null,
          conceptos: conceptos.length > 0 ? null
            : 'el hecho de nomina no declara conceptos: la forma queda sin lineas (no se estiman)'
        }
      }
    };
  }

  // Conceptos declarados: cada uno con su importe COPIADO (nunca calculado). Importe ausente → null.
  _conceptos(nomina) {
    const raw = Array.isArray(nomina.conceptos) ? nomina.conceptos
      : (Array.isArray(nomina.lineas) ? nomina.lineas : []);
    return raw.map((c, i) => {
      const o = (c && typeof c === 'object') ? c : { concepto: c };
      const importe = (o.importe !== undefined && o.importe !== null) ? o.importe
        : ((o.cuantia !== undefined && o.cuantia !== null) ? o.cuantia : null);
      return {
        orden: i + 1,
        concepto: o.concepto != null ? String(o.concepto) : (o.clave != null ? String(o.clave) : null),
        tipo: o.tipo != null ? String(o.tipo) : null,
        importe,                       // declarado; ausente → null (no se asume 0)
        signo: o.signo != null ? String(o.signo) : null,
        cantidad: (o.cantidad !== undefined && o.cantidad !== null) ? o.cantidad : null,
        precio: (o.precio !== undefined && o.precio !== null) ? o.precio : null
      };
    });
  }

  // ── Tools ──
  toolDarForma(params) { return this._dar_forma(params); }
}

module.exports = ReciboNomina;
