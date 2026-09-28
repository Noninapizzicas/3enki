/**
 * contabilidad/puerto-nomina — PUENTE STATELESS (G4, hoja del plan).
 *
 * Origen DECLARABLE del dato de nomina. El sistema NO calcula nomina por
 * defecto: la RECIBE. Calcular es capacidad OPCIONAL y declarable (G5, pieza
 * [ABIERTO] en cola-declaraciones-criterio); mientras el dueno no declare "el
 * negocio calcula", este puente solo conecta con la fuente de personal y admite
 * los recibos YA emitidos por ella.
 *
 * PUENTE (patron real, stateless): sin PosPersistencia ni project.activated —
 * el catalogo de origenes conectados vive en memoria del propio puerto (es
 * configuracion del adaptador, no parcela persistente). Dependencia con
 * recibo-nomina (G1) por EVENTO, NUNCA por require cruzado. Si no existe el
 * origen → se CREA (invariante de puerto abierto: un adaptador por origen,
 * puesto en el sitio de despliegue); si el origen no esta declarado se dice
 * NO_DECLARADO, jamas se asume. Emisor/par de fallo: exito publica
 * contabilidad.nomina_recibida; error su par determinista. NO REUTILIZA: no
 * existe puerto de nomina en el inventario (nominas = 0 modulos).
 *
 * Ver hoja G4 del diseno-oop y bloque `puerto-nomina` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Origenes de nomina que el puerto SABE conectar de fabrica. Un origen nuevo
// se registra con _conectar (invariante de puerto abierto: si falta, SE CREA).
const ORIGENES_BASE = new Set(['ASESORIA', 'SISTEMA_PERSONAL', 'FICHERO_NORMALIZADO', 'MANUAL']);

// Rol unico que declara el origen/capacidad del dato de nomina.
const ROL_DECLARANTE = 'DUENO';

class PuertoNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-nomina';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: catalogo de origenes declarados en memoria (por origen).
    this._origenes = new Map();   // origen -> { origen, tipo, calcula, conocido, declarado_en }
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onRecibirRequest(e) {
    return this._atender(e, 'recibir', 'contabilidad.nomina.recibir.response', async (d) => {
      const res = this._recibir(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.nomina_recibida', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.nomina.recibir.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──
  // recibir(hechoNomina) -> ok — el recibo LLEGA hecho por la fuente; el puerto
  // NO calcula nomina (calcular es capacidad opcional, G5 declarable).
  _recibir(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const recibo = (input && (input.hecho_nomina || input.recibo)) || null;
    if (!recibo || typeof recibo !== 'object') return this._invalid('hecho_nomina');

    const origen = String((input && input.origen) || recibo.origen || '').toUpperCase();
    if (!origen) return this._invalid('origen');

    // El origen debe estar conectado; si no lo esta, se conecta al vuelo con lo
    // que la fuente trae (puerto abierto: si no existe, SE CREA).
    if (!this._origenes.has(origen)) {
      const r = this._conectar({ project_id: pid, origen, rol: ROL_DECLARANTE, tipo: input.tipo });
      if (r.status !== 200) return r;
    }

    const empleado = recibo.empleado || recibo.id_empleado || null;
    if (!empleado) return this._invalid('hecho_nomina.empleado');

    const estadoOrigen = this._origenes.get(origen);
    const bruto = Number(recibo.bruto ?? recibo.total_devengado);
    const neto = Number(recibo.neto ?? recibo.liquido);

    return {
      status: 200,
      data: {
        project_id: pid,
        origen,
        empleado,
        periodo: recibo.periodo || null,
        bruto: Number.isFinite(bruto) ? this._round(bruto, 2) : null,
        neto: Number.isFinite(neto) ? this._round(neto, 2) : null,
        recibo,
        calculado_por_sistema: false,
        capacidad_calculo: estadoOrigen ? !!estadoOrigen.calcula : false,
        nota: 'el sistema RECIBE la nomina; calcular es capacidad opcional (G5 declarable)'
      }
    };
  }

  // conectar(origen) -> ok | NO_DECLARADO — si no existe el origen, SE CREA.
  _conectar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const origen = String((input && input.origen) || '').toUpperCase();
    if (!origen) return this._invalid('origen');

    const rol = String((input && input.rol) || ROL_DECLARANTE).toUpperCase();
    if (rol !== ROL_DECLARANTE) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUENO declara el origen de la nomina', {
        rol_esperado: ROL_DECLARANTE, rol_recibido: rol
      });
    }

    const existente = this._origenes.get(origen);
    const estado = {
      origen,
      tipo: (input && input.tipo) || (existente && existente.tipo) || null,
      // G5 [ABIERTO]: por defecto el sistema NO calcula; el dueno lo declara.
      calcula: input && input.calcula !== undefined ? !!input.calcula : (existente ? existente.calcula : false),
      conocido: ORIGENES_BASE.has(origen) || !!existente,
      declarado_en: new Date().toISOString(),
      declarado_por: rol
    };
    this._origenes.set(origen, estado);
    this.logger?.info(`${this.name}.origen_conectado`, { origen });

    return {
      status: 200,
      data: {
        project_id: pid,
        origen,
        creado: !existente,
        conocido: estado.conocido,
        capacidad: estado
      }
    };
  }

  // ── Tools ──
  toolRecibir(params) { return this._recibir(params); }
  toolConectar(params) { return this._conectar(params); }
}

module.exports = PuertoNomina;
