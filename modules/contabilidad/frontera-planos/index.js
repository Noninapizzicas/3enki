/**
 * contabilidad/frontera-planos — REFLEJO STATELESS (M1, hoja del plan).
 *
 * CERROJO 1 · anti-realimentacion: contabilidad es la OBSERVADORA que no produce
 * hechos de negocio. El sistema emite CALCULOS (su espacio es `contabilidad.*`);
 * si un contrato pretende ser un HECHO de negocio (otra vertical, un plano
 * ajeno) → RECHAZO determinista con ERROR_FUGA. Cero realimentacion de la
 * operacion (invariante 5 del dominio). Es un juicio MECANICO sobre el prefijo
 * del contrato emitido: misma entrada → mismo veredicto.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated —
 * no guarda estado. Cada op entra objeto, sale objeto. Publica
 * contabilidad.frontera_planos_verificada (+ contabilidad.frontera_planos.
 * verificar.failed par determinista). NO REUTILIZA: cerrojo propio del dominio
 * contable (la identidad "observadora que no produce hechos" se verifica aqui).
 *
 * Ver hoja M1 del diseno-oop y bloque `frontera-planos` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Espacio de CALCULOS que contabilidad tiene permitido emitir.
const PREFIJO_CALCULOS = 'contabilidad.';

// Verticales productoras de HECHOS: si un contrato emitido pretende ser uno de
// estos, es una FUGA (contabilidad no realimenta la operacion).
const VERTICALES_HECHO = new Set([
  'VENTA', 'COBRO', 'PAGO', 'COMPRA', 'CONSUMO', 'CIERRE_JORNADA', 'RECTIFICATIVO', 'NOMINA'
]);

// Codigo simbolico determinista del cerrojo (nombre de la clase M1).
const CODE_FUGA = 'ERROR_FUGA';

class FronteraPlanos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'frontera-planos';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onVerificarRequest(e) {
    return this._atender(e, 'verificar', 'contabilidad.frontera_planos.verificar.response', async (d) => {
      const res = this._verificar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.frontera_planos_verificada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.frontera_planos.verificar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion pura (determinista) ──
  // verificar(emision) -> ok | ERROR_FUGA (prefijo del espacio de CALCULOS contabilidad.*).
  _verificar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const emision = input && input.emision;
    if (!emision || typeof emision !== 'object') return this._invalid('emision');

    const contrato = String(emision.contrato || emision.evento || '').trim();
    if (!contrato) return this._invalid('emision.contrato');

    // Si el contrato pretende ser un HECHO de negocio de una vertical productora
    // → FUGA determinista: contabilidad NO realimenta la operacion.
    const verticalPretendida = String(emision.vertical || '').toUpperCase();
    if (verticalPretendida && VERTICALES_HECHO.has(verticalPretendida)) {
      return this._errorResponse(409, CODE_FUGA, `contabilidad no puede emitir el hecho de la vertical ${verticalPretendida}`, {
        contrato,
        vertical_pretendida: verticalPretendida,
        espacio_de_calculos: PREFIJO_CALCULOS,
        simbolico: CODE_FUGA
      });
    }

    if (emision.es_hecho === true) {
      return this._errorResponse(409, CODE_FUGA, 'un contrato de contabilidad no puede declararse hecho de negocio', {
        contrato, espacio_de_calculos: PREFIJO_CALCULOS, simbolico: CODE_FUGA
      });
    }

    // El contrato emitido debe vivir en el espacio de CALCULOS de contabilidad.
    if (!contrato.startsWith(PREFIJO_CALCULOS)) {
      return this._errorResponse(409, CODE_FUGA, `el contrato ${contrato} no pertenece al espacio de CALCULOS`, {
        contrato,
        prefijo_exigido: PREFIJO_CALCULOS,
        simbolico: CODE_FUGA
      });
    }

    return {
      status: 200,
      data: { project_id: pid, contrato, plano: 'CALCULO', verificado: true, fuga: false }
    };
  }

  // ── Tools ──
  toolVerificar(params) { return this._verificar(params); }
}

module.exports = FronteraPlanos;
