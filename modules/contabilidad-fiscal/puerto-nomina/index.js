/**
 * contabilidad-fiscal/puerto-nomina — PUENTE (G4, hoja del plan).
 *
 * ORIGEN DECLARABLE del dato de nomina: la FRONTERA por la que entra la nomina de un
 * sistema de personal externo (o de la operacion de la vertical). Si no existe el origen,
 * se DECLARA (el puerto se abre con su contrato); no se inventa el dato.
 *
 *   · recibir — llega UNA nomina ya emitida por el origen externo. El puerto la ADMITE
 *     tal cual (no la interpreta) y ANUNCIA el hecho de dominio `contabilidad.nomina_recibida`
 *     para que arranque la cadena de nomina (recibo-nomina G1, lineas-nomina G6,
 *     pagos-a-cuenta-empleado G8, obligacion-seguridad-social, asiento-personal...).
 *
 * Frontera (A · dependencias): la nomina viene de FUERA del repo (el sistema de personal).
 * La escucha de `contabilidad.nomina_recibida` NO se declara: este puerto la EMITE.
 *
 * Invariante: dato ausente = desconocido. Sin nomina no hay nada que recibir (no se fabrica);
 * el origen/contrato que no venga queda declarado en `abierto`, nunca estimado.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G4 del plan-construccion y diseno-oop.md (CLASE PuertoNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuertoNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-nomina';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onRecibirRequest(e) {
    return this._atender(e, 'recibir', 'puerto-nomina.recibir.response', async (d) => {
      const res = this._recibir(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE (admite la nomina en el dominio), anuncia el HECHO de dominio.
        this.eventBus?.publish('contabilidad.nomina_recibida', {
          project_id: res.data.project_id,
          nomina: res.data.nomina,
          origen: res.data.origen,
          empleado: res.data.empleado,
          periodo: res.data.periodo,
          recibida_en: res.data.recibida_en,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('puerto-nomina.recibir.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // recibir(nomina, origen?) → se admite y se anuncia contabilidad.nomina_recibida
  // ══════════════════════════════════════════════════════════════════════
  _recibir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La NOMINA: viene DECLARADA. Sin ella NO se fabrica nada (dato ausente = desconocido).
    const nomina = input.nomina !== undefined ? input.nomina
      : (input.hecho !== undefined ? input.hecho
        : (input.recibo !== undefined ? input.recibo : undefined));
    if (nomina === undefined || nomina === null) return this._invalid('nomina');

    // El ORIGEN (sistema de personal / vertical): declarado. El puerto no lo adivina.
    const origen = input.origen != null ? String(input.origen).trim()
      : (input.vertical != null ? String(input.vertical).trim()
        : (input.sistema != null ? String(input.sistema).trim() : null));

    const base = (nomina && typeof nomina === 'object') ? nomina : {};
    const empleado = input.empleado != null ? input.empleado
      : (base.empleado != null ? base.empleado : (base.empleado_id != null ? base.empleado_id : null));
    const periodo = input.periodo != null ? input.periodo
      : (base.periodo != null ? base.periodo : null);
    const recibida_en = input.recibida_en != null ? String(input.recibida_en) : new Date().toISOString();

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'puerto-nomina',
        // La nomina entra TAL CUAL: el puerto la admite, NO la da forma (eso es recibo-nomina G1).
        nomina,
        origen,
        empleado,
        periodo,
        recibida_en,
        recibida: true,
        // El puerto admite, no interpreta: la forma asentable es de G1.
        interpretada: false,
        abierto: {
          origen: origen ? null : 'la nomina no declara su origen (sistema de personal/vertical): se admite igual (el puerto no inventa el emisor)',
          origen_externo: origen ? null : 'si no existe el origen, se declara el puerto y se crea (origen declarable)'
        }
      }
    };
  }

  // ── Tools ──
  toolRecibir(params) { return this._recibir(params); }
}

module.exports = PuertoNomina;
